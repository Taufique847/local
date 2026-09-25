import { Types } from 'mongoose';
import { Appointment } from '../models/appointment.model';
import { Business } from '../models/business.model';
import { AvailabilityService } from './availability.service';
import { LockService, LockAcquisitionError } from './lock.service';
import { zonedParts, zonedWallClockToUtc } from '../utils/format';
import { IAppointment, IRecurrenceRule } from '../types/appointment.types';
import { AppError } from '../types';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'recurrence' });

/**
 * Repeating appointments — the maintenance plan every home-services business sells.
 *
 * Three decisions shape everything here.
 *
 * **1. Occurrences are real appointments, not computed on read.**
 * A technician has to be assigned to a specific visit, that visit gets rescheduled,
 * cancelled, invoiced and photographed, and it has its own `rescheduleHistory`. A
 * virtual occurrence has nowhere to put any of that. The cost is that a series has to
 * be materialised, which is what the horizon and the top-up job below are for.
 *
 * **2. A series is generated to a horizon, not in full.**
 * "Quarterly for three years" is twelve rows; "weekly, ongoing" is unbounded. Writing
 * either eagerly is wrong for a different reason — the first buries the calendar in work
 * nobody has committed to yet, the second never terminates. The horizon materialises what
 * is close enough to matter and `recurrenceGeneratedThrough` records where to resume.
 *
 * **3. An occurrence that cannot be booked is skipped, not forced and not fatal.**
 * A year of weekly visits will land on a closed public holiday and on an hour the
 * assigned technician is already busy. Failing the whole series because week 30 clashes
 * is useless; creating it anyway is double-booking. Skipping and reporting which dates
 * were skipped is the only honest option, and it is the one an owner can act on.
 */
export class RecurrenceService {
  /**
   * How far ahead a series is materialised.
   *
   * 120 days rather than the booking horizon. `BusinessPolicy.maxBookingHorizonDays`
   * defaults to 30 and exists to stop a *customer* booking too far out; a contractor
   * putting their own maintenance plan on the calendar is a different act, and capping it
   * at a month would make quarterly plans impossible to see.
   */
  public static readonly HORIZON_DAYS = 120;

  /** A hard ceiling per generation pass, so one call cannot write thousands of rows. */
  private static readonly MAX_PER_PASS = 60;

  /**
   * The nth start time of a series, in the business's own wall clock.
   *
   * Computed from the *first* occurrence every time rather than by repeatedly adding to
   * the previous one. Adding accumulates: 52 weekly steps across two DST transitions
   * drifts by an hour, and a 09:00 visit becomes 08:00. Deriving each occurrence from
   * index 0 means every one lands at 09:00 local whatever the offset that week.
   *
   * Returns null when the date does not exist in the target month — see below.
   */
  public static occurrenceAt(
    firstStart: Date,
    rule: Pick<IRecurrenceRule, 'frequency' | 'interval'>,
    index: number,
    timezone: string
  ): Date | null {
    const first = zonedParts(firstStart, timezone);
    if (!first) return null;

    if (rule.frequency === 'weekly') {
      // Days, not milliseconds: a week is 7 calendar days, which is 167 or 169 hours
      // across a transition, and `zonedWallClockToUtc` resolves the offset for us.
      return zonedWallClockToUtc(
        first.year,
        first.month,
        first.day + index * rule.interval * 7,
        first.minutesOfDay,
        timezone
      );
    }

    const monthsAhead = index * rule.interval;
    const target = new Date(Date.UTC(first.year, first.month - 1 + monthsAhead, 1, 12));
    const year = target.getUTCFullYear();
    const month = target.getUTCMonth() + 1;
    const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();

    /**
     * The 31st of a month that has 30 days is skipped, not clamped to the 30th.
     *
     * Clamping looks friendlier and is worse: a plan set for the 31st would fire on the
     * 30th of April, the 28th of February and the 31st of May, so the interval between
     * visits silently varies and a customer told "the 31st of every month" is visited on
     * four different dates. Skipping keeps the promise the plan made, and the skipped
     * dates are reported.
     */
    if (first.day > daysInMonth) return null;

    return zonedWallClockToUtc(year, month, first.day, first.minutesOfDay, timezone);
  }

  /**
   * Validates a rule and returns it normalised.
   *
   * An unbounded series is refused. It cannot be materialised in full by definition, so
   * accepting one would mean the series exists only as far as the last top-up ran — and a
   * contractor who disabled the scheduler, or whose plan outlived this install, would find
   * their maintenance calendar quietly stopping on a date nothing chose. Making the end
   * explicit means the calendar always shows the whole commitment.
   */
  public static normaliseRule(rule: IRecurrenceRule): IRecurrenceRule {
    /**
     * `?? 1`, not `|| 1`.
     *
     * An omitted interval means "every one", which is a sensible default. An explicit `0`
     * is meaningless — every zero weeks is not a schedule — and `||` would have silently
     * turned it into a weekly plan, so a typo in a form would create 52 visits a year
     * nobody asked for.
     */
    const raw = rule.interval ?? 1;
    const interval = Math.trunc(Number(raw));

    if (!['weekly', 'monthly'].includes(rule.frequency)) {
      throw new AppError("Recurrence frequency must be 'weekly' or 'monthly'.", 400);
    }
    if (!Number.isFinite(interval) || interval < 1 || interval > 52) {
      throw new AppError('Recurrence interval must be between 1 and 52.', 400);
    }

    const hasCount = rule.count !== undefined && rule.count !== null;
    const hasUntil = rule.until !== undefined && rule.until !== null;

    if (!hasCount && !hasUntil) {
      throw new AppError(
        'A repeating appointment needs an end: either a number of visits or a date to repeat until.',
        400
      );
    }
    if (hasCount && hasUntil) {
      throw new AppError(
        'Give a number of visits or a date to repeat until, not both.',
        400
      );
    }

    if (hasCount) {
      const count = Math.trunc(Number(rule.count));
      if (!Number.isFinite(count) || count < 2 || count > 260) {
        throw new AppError('A repeating appointment must have between 2 and 260 visits.', 400);
      }
      return { frequency: rule.frequency, interval, count };
    }

    const until = new Date(rule.until as any);
    if (Number.isNaN(until.getTime())) {
      throw new AppError('The repeat-until date is not a valid date.', 400);
    }

    return { frequency: rule.frequency, interval, until };
  }

  /**
   * Materialises the occurrences of a series that fall inside the horizon.
   *
   * Idempotent on `recurrenceGeneratedThrough`: a second call generates nothing new, and
   * the top-up job can run as often as it likes.
   *
   * Runs under the same per-business booking lock the create path uses, because it makes
   * the same check-then-write decisions against the same slot space. Without it a series
   * being generated and a customer booking on the phone could both be told an hour was
   * free.
   */
  public static async materialise(
    businessId: Types.ObjectId | string,
    parentId: Types.ObjectId | string,
    options: { horizonDays?: number } = {}
  ): Promise<{ created: number; skipped: Array<{ startAt: Date; reason: string }> }> {
    try {
      return await LockService.withLock(
        `booking:${businessId.toString()}`,
        { ttlMs: 30_000, retries: 25, retryDelayMs: 120 },
        () => this.materialiseUnlocked(businessId, parentId, options)
      );
    } catch (err) {
      if (err instanceof LockAcquisitionError) {
        throw new AppError(
          'Another booking for this business is being processed. Please try again in a moment.',
          409
        );
      }
      throw err;
    }
  }

  private static async materialiseUnlocked(
    businessId: Types.ObjectId | string,
    parentId: Types.ObjectId | string,
    options: { horizonDays?: number }
  ): Promise<{ created: number; skipped: Array<{ startAt: Date; reason: string }> }> {
    const parent = await Appointment.findOne({ _id: parentId, businessId });
    if (!parent) throw new AppError('Appointment not found', 404);
    if (!parent.recurrenceRule) {
      throw new AppError('That appointment is not part of a repeating series.', 400);
    }

    const rule = parent.recurrenceRule;
    const timezone = parent.timezone || 'America/New_York';
    const durationMs = parent.endAt.getTime() - parent.startAt.getTime();

    const horizonDays = options.horizonDays ?? this.HORIZON_DAYS;
    const horizon = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000);

    /**
     * Where to resume.
     *
     * Occurrences already written are skipped by index rather than by re-querying for
     * each candidate date: the parent records how far it got, so a series with 200 past
     * visits costs no lookups to continue.
     */
    const generatedThrough = parent.recurrenceGeneratedThrough ?? parent.startAt;

    const created: IAppointment[] = [];
    const skipped: Array<{ startAt: Date; reason: string }> = [];
    let furthest = generatedThrough;
    /**
     * Whether the loop ran out of *occurrences* rather than out of *horizon*.
     *
     * The distinction is the whole point of `recurrenceCompletedAt`: stopping because the
     * plan has ended is final, stopping because 120 days is as far as we look is not.
     */
    let exhausted = false;

    // Index 0 is the parent itself, which already exists.
    for (let index = 1; created.length < this.MAX_PER_PASS; index += 1) {
      if (rule.count && index >= rule.count) {
        exhausted = true;
        break;
      }

      const startAt = this.occurrenceAt(parent.startAt, rule, index, timezone);

      if (!startAt) {
        /**
         * A date the target month does not have — the 31st of April. Not an error and not
         * the end of the series, because May does have one.
         *
         * The 400-index ceiling is the termination guarantee for an `until`-bounded
         * monthly plan on the 31st: without it, a rule that only ever lands on missing
         * dates would iterate forever looking for one that fits.
         */
        if (index > 400) {
          exhausted = true;
          break;
        }
        continue;
      }

      if (rule.until && startAt.getTime() > new Date(rule.until).getTime()) {
        exhausted = true;
        break;
      }
      if (startAt.getTime() > horizon.getTime()) break;

      // Already written on an earlier pass.
      if (startAt.getTime() <= generatedThrough.getTime()) {
        if (startAt.getTime() > furthest.getTime()) furthest = startAt;
        continue;
      }

      const endAt = new Date(startAt.getTime() + durationMs);

      const hours = await AvailabilityService.isWithinBusinessHours(businessId, startAt, endAt);
      if (!hours.ok) {
        skipped.push({ startAt, reason: hours.reason || 'Outside opening hours' });
        furthest = startAt;
        continue;
      }

      const conflict = await AvailabilityService.checkSlotConflictDetailed(
        businessId,
        startAt,
        endAt,
        { technicianId: parent.technicianId ?? null }
      );

      if (conflict.conflict) {
        skipped.push({ startAt, reason: conflict.reason || 'Already booked' });
        furthest = startAt;
        continue;
      }

      const occurrence = await Appointment.create({
        businessId: parent.businessId,
        customerId: parent.customerId,
        // Deliberately not copied: a lead is converted once, and pointing every
        // occurrence at it would re-fire lead activity on each visit.
        leadId: null,
        serviceId: parent.serviceId,
        title: parent.title,
        description: parent.description,
        startAt,
        endAt,
        timezone,
        status: 'scheduled',
        priority: parent.priority,
        source: parent.source,
        address: parent.address,
        technicianId: parent.technicianId ?? null,
        technicianName: parent.technicianName,
        customerNotes: parent.customerNotes,
        internalNotes: parent.internalNotes,
        /**
         * Linked to the parent, and deliberately without a copy of the rule: the rule has
         * exactly one home so it can only be changed in one place.
         */
        recurrenceParentId: parent._id,
        createdBy: parent.createdBy,
      });

      created.push(occurrence);
      furthest = startAt;
    }

    parent.recurrenceGeneratedThrough = furthest;
    if (exhausted && !parent.recurrenceCompletedAt) parent.recurrenceCompletedAt = new Date();
    await parent.save();

    if (created.length || skipped.length) {
      log.info('series_materialised', {
        parentId: parent._id.toString(),
        created: created.length,
        skipped: skipped.length,
      });
    }

    return { created: created.length, skipped };
  }

  /**
   * Extends every series whose materialised window is running out.
   *
   * Run from the scheduler. The query is the point: only series whose
   * `recurrenceGeneratedThrough` is inside the horizon need work, so a business with a
   * hundred finished plans costs one indexed lookup rather than a hundred generation
   * passes.
   */
  public static async topUpSeries(): Promise<{
    /** How many series the query selected. */
    examined: number;
    /** How many of those actually gained occurrences. */
    series: number;
    created: number;
  }> {
    const parents = await Appointment.find({
      /**
       * Carrying a rule is what makes something a series parent, and it is the only clause
       * needed to find them.
       *
       * Two others were here and both have been removed:
       *
       *  - `recurrenceParentId: null` — redundant. Occurrences never carry a rule (there is
       *    a test for that), so the rule clause already excludes them.
       *  - `status: { $nin: ['cancelled'] }` — and this one was actively wrong. It is
       *    `cancelSeries` that ends a plan, and it does so by clearing the rule. Cancelling
       *    the *first visit* is a different act: a customer rescheduling out of one
       *    appointment has not cancelled their maintenance plan. Filtering on the parent's
       *    own status meant skipping one visit silently stopped the next year of them —
       *    the exact accidental-cancellation failure `cancelSeries` exists to avoid.
       */
      recurrenceRule: { $ne: null },
      /**
       * Completion is the whole filter.
       *
       * An earlier version also had `recurrenceGeneratedThrough: { $lt: horizon }`, which
       * reads like the obvious narrowing and excludes nothing: generation stops *at* the
       * horizon, so every unfinished series has a watermark at or before it, and the
       * horizon only ever moves forward. A clause that can never exclude a row is not a
       * filter, it is an assertion nobody can check.
       *
       * See the model field for why the watermark cannot tell a finished plan from an
       * unfinished one on its own.
       */
      recurrenceCompletedAt: null,
    })
      .select('_id businessId')
      .limit(500)
      .lean();

    let created = 0;
    let touched = 0;

    for (const parent of parents) {
      try {
        const result = await this.materialise(parent.businessId, parent._id);
        created += result.created;
        if (result.created) touched += 1;
      } catch (err: any) {
        // One bad series must not stop the rest. A 409 here just means a booking was in
        // flight; the next tick will pick it up.
        log.warn('series_topup_failed', {
          parentId: parent._id.toString(),
          error: err?.message,
        });
      }
    }

    /**
     * `examined` is reported, not just `created`.
     *
     * The two narrowing clauses on the query above — a rule must be present, and the
     * watermark must be inside the horizon — do not change what this job *produces*.
     * Dropping either still creates the right occurrences: a child has no rule so
     * `materialise` refuses it, and a finished series generates nothing. What changes is
     * the cost, and it changes by a lot: without them, every occurrence a business has
     * ever had becomes a candidate that takes the per-business booking lock, twice a day,
     * competing with live bookings for it.
     *
     * Counting candidates is what makes those clauses observable. A guard whose only
     * effect is on cost still deserves a test; it just needs the cost to be visible.
     */
    return { examined: parents.length, series: touched, created };
  }

  /**
   * Cancels the rest of a series from a given point, leaving history alone.
   *
   * Two things this deliberately does not do:
   *
   *  - **It does not touch occurrences that have already happened.** A completed visit is
   *    a record of work done and an invoice raised; cancelling it retroactively would
   *    rewrite the past. The default cut-off is now.
   *  - **It does not delete anything.** Cancelled occurrences stay visible and keep their
   *    reason, so "why did the November visit not happen" has an answer.
   *
   * The rule is cleared from the parent so the top-up job stops extending a series that
   * has been ended. Without that, the next tick would helpfully re-create everything just
   * cancelled.
   */
  public static async cancelSeries(
    businessId: Types.ObjectId | string,
    appointmentId: Types.ObjectId | string,
    /**
     * No `cancelledBy`. There is no field on `Appointment` to put it in — the model
     * records `cancellationReason` and nothing about who — so accepting the parameter
     * would have been a signature promising an audit trail that does not exist.
     */
    options: { from?: Date; reason?: string } = {}
  ): Promise<{ cancelled: number; parentId: string }> {
    const target = await Appointment.findOne({ _id: appointmentId, businessId });
    if (!target) throw new AppError('Appointment not found', 404);

    const parentId = target.recurrenceParentId ?? target._id;

    const parent = await Appointment.findOne({ _id: parentId, businessId });
    if (!parent || !parent.recurrenceRule) {
      throw new AppError('That appointment is not part of a repeating series.', 400);
    }

    const from = options.from ?? new Date();

    const result = await Appointment.updateMany(
      {
        /**
         * Redundant, and kept.
         *
         * `parentId` is derived from a document already fetched with this `businessId`, so
         * no other tenant's row can match — a mutation test confirms removing it changes
         * nothing. It stays because this is a bulk write: the invariant that makes it
         * unreachable lives in the lookup ten lines above, and a future refactor that moves
         * or loosens that lookup would turn a one-tenant update into an every-tenant one
         * with no test failing. Zero cost, and the failure it guards is unrecoverable.
         */
        businessId,
        $or: [{ _id: parentId }, { recurrenceParentId: parentId }],
        startAt: { $gte: from },
        // Completed and already-cancelled visits are left exactly as they are.
        status: { $nin: ['completed', 'cancelled'] },
      },
      {
        $set: {
          status: 'cancelled',
          cancellationReason: options.reason || 'Repeating series ended',
        },
      }
    );

    parent.recurrenceRule = null;
    await parent.save();

    log.info('series_cancelled', {
      parentId: parentId.toString(),
      cancelled: result.modifiedCount,
    });

    return { cancelled: result.modifiedCount, parentId: parentId.toString() };
  }

  /** Every occurrence of a series, parent first. */
  public static async listSeries(
    businessId: Types.ObjectId | string,
    appointmentId: Types.ObjectId | string
  ): Promise<IAppointment[]> {
    const target = await Appointment.findOne({ _id: appointmentId, businessId }).select(
      'recurrenceParentId'
    );
    if (!target) throw new AppError('Appointment not found', 404);

    const parentId = target.recurrenceParentId ?? target._id;

    return Appointment.find({
      businessId,
      $or: [{ _id: parentId }, { recurrenceParentId: parentId }],
    })
      .sort({ startAt: 1 })
      .populate('customerId', 'firstName lastName phone email address')
      .populate('serviceId', 'name durationMinutes startingPrice category');
  }

  /** The business timezone, defaulted the way every other caller defaults it. */
  public static async timezoneFor(businessId: Types.ObjectId | string): Promise<string> {
    const business = await Business.findById(businessId).select('timezone').lean();
    return business?.timezone || 'America/New_York';
  }
}
