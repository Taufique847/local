import { Types } from 'mongoose';
import { Appointment } from '../models/appointment.model';
import { BusinessPolicy } from '../models/business-policy.model';
import { Business } from '../models/business.model';
import { NotificationService } from './notification.service';
import { CommunicationService } from './communication.service';
import { AppointmentStatus } from '../types/appointment.types';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'appointment-reminders' });

/**
 * Appointment reminders.
 *
 * This is the piece that was simply missing. The `appointment_reminder` template
 * existed, the message type existed, and nothing anywhere in the codebase called
 * either — grep for the type and the only hits were its own definition. A
 * customer booked three weeks out heard nothing until the van arrived, and
 * no-shows were invisible and unpreventable.
 *
 * Runs cross-tenant from the scheduler, so every decision here is made per
 * business from that business's own policy and timezone.
 */
export class AppointmentReminderService {
  /**
   * Statuses worth reminding about.
   *
   * `rescheduled` is included: a moved appointment is still an appointment, and
   * excluding it would silently drop reminders for exactly the bookings most
   * likely to be forgotten. `completed`, `cancelled`, `no_show` and the in-flight
   * statuses (`en_route`, `arrived`, `in_progress`) are excluded — a reminder for
   * a job the technician is already standing in is worse than no reminder.
   */
  private static readonly REMINDABLE_STATUSES: AppointmentStatus[] = [
    'scheduled',
    'confirmed',
    'rescheduled',
  ];

  /**
   * Must match `BusinessPolicy.reminderLeadHours`'s `max`.
   *
   * Sizes the candidate query window. A business cannot configure a lead time
   * longer than this, so nothing outside the window can ever be due.
   */
  private static readonly MAX_REMINDER_LEAD_HOURS = 168;

  /** After this many claims, stop trying. Prevents a per-tick retry loop. */
  private static readonly MAX_ATTEMPTS = 3;

  /**
   * Sends every reminder that has come due.
   *
   * Returns counts rather than throwing, because the scheduler logs a job result
   * and one business's broken configuration must not stop the other tenants'
   * reminders.
   */
  public static async processDueReminders(): Promise<{
    sent: number;
    deferred: number;
    failed: number;
    undeliverable: number;
  }> {
    const now = new Date();
    const horizon = new Date(now.getTime() + this.MAX_REMINDER_LEAD_HOURS * 60 * 60 * 1000);

    /**
     * Candidates, widest window, cheapest filters.
     *
     * `startAt: { $gt: now }` matters as much as the upper bound: without it a job
     * that already started, or one in the past that was never reminded, would be
     * selected forever and the customer would get a reminder for an appointment
     * that has been and gone.
     *
     * `reminderSentAt: null` matches documents where the field is missing as well
     * as explicitly null, which is what makes this work on appointments created
     * before the field existed.
     *
     * Note that this particular clause is an optimisation, not the guard. It keeps
     * already-reminded appointments out of the scan and off the index, but
     * correctness rests on the conditional update in `claim()` — remove this line
     * and behaviour is unchanged, remove the condition in `claim()` and customers
     * get duplicate reminders. Both are kept deliberately; only one is
     * load-bearing.
     */
    const candidates = await Appointment.find({
      status: { $in: this.REMINDABLE_STATUSES },
      reminderSentAt: null,
      startAt: { $gt: now, $lte: horizon },
      $or: [
        { reminderAttempts: { $exists: false } },
        { reminderAttempts: { $lt: this.MAX_ATTEMPTS } },
      ],
    })
      .select('_id businessId startAt status reminderAttempts')
      .sort({ startAt: 1 })
      // Bounded so one tick cannot run unboundedly long and overrun its lock.
      // Anything left over is picked up on the next tick fifteen minutes later,
      // which is well inside any realistic lead time.
      .limit(500)
      .lean();

    /**
     * Only actionable outcomes are returned.
     *
     * The scheduler logs a job run whenever any number in the result is non-zero,
     * so including "examined" or "not due yet" here would emit a log line every
     * fifteen minutes forever — a business with a single booking next week keeps
     * those counts permanently non-zero. Those are tracked locally and logged at
     * debug level instead.
     */
    const counts = { sent: 0, deferred: 0, failed: 0, undeliverable: 0 };
    let notDue = 0;

    if (!candidates.length) return counts;

    // Policy and timezone are per business, and a tick typically spans a handful
    // of businesses with many appointments each, so they are fetched once.
    const settingsCache = new Map<
      string,
      { leadHours: number; enabled: boolean; timezone: string }
    >();

    const settingsFor = async (businessId: Types.ObjectId) => {
      const key = String(businessId);
      const cached = settingsCache.get(key);
      if (cached) return cached;

      const [policy, business] = await Promise.all([
        BusinessPolicy.findOne({ businessId })
          .select('reminderLeadHours appointmentRemindersEnabled')
          .lean(),
        Business.findById(businessId).select('timezone').lean(),
      ]);

      const resolved = {
        // A business with no policy row yet gets the documented defaults rather
        // than no reminders. `??` not `||`, so a deliberate 1 is not read as unset.
        leadHours: policy?.reminderLeadHours ?? 24,
        enabled: policy?.appointmentRemindersEnabled ?? true,
        timezone: business?.timezone || 'America/New_York',
      };

      settingsCache.set(key, resolved);
      return resolved;
    };

    for (const candidate of candidates) {
      try {
        const settings = await settingsFor(candidate.businessId);

        if (!settings.enabled) {
          notDue++;
          continue;
        }

        const dueAt = new Date(
          candidate.startAt.getTime() - settings.leadHours * 60 * 60 * 1000
        );

        // Not due yet for this business's lead time. The widest-window query is
        // deliberately over-inclusive; this is where it is narrowed.
        if (dueAt > now) {
          notDue++;
          continue;
        }

        /**
         * Quiet hours defer rather than cancel.
         *
         * Nothing is claimed and nothing is stamped, so the appointment is
         * reconsidered on the next tick. The due condition is
         * `startAt - lead <= now`, which only becomes *more* true as time passes,
         * so a reminder held overnight goes out as soon as the window opens at
         * 8am — it is not lost.
         *
         * A reminder is not exempt from quiet hours the way a confirmation is: the
         * customer did not just ask for it, so a 2am text is a cold contact.
         */
        if (CommunicationService.isWithinQuietHours(settings.timezone)) {
          counts.deferred++;
          continue;
        }

        const claimed = await this.claim(candidate._id);

        // Lost the race to another scheduler instance, or the appointment changed
        // underneath us. Either way it is not ours to send.
        if (!claimed) {
          notDue++;
          continue;
        }

        const result = await NotificationService.notifyAppointment(
          candidate.businessId,
          candidate._id,
          'appointment_reminder'
        );

        if (result.sentAny) {
          counts.sent++;
          continue;
        }

        /**
         * Nothing went out. Whether to release the claim depends on why.
         *
         * A `failed` channel is a provider problem that may not recur, so the
         * claim is released and the next tick tries again — up to MAX_ATTEMPTS,
         * which is what stops a permanently misconfigured provider from
         * generating four failed sends an hour until the appointment arrives.
         *
         * A purely `skipped` result is a settled fact about this customer — no
         * phone number, no email address, opted out of texts. Retrying would
         * produce the identical outcome, so the claim stands.
         */
        const anyFailed = result.results.some((r) => r.status === 'failed');

        if (anyFailed) {
          await this.releaseClaim(candidate._id);
          counts.failed++;
          log.warn('reminder_send_failed_will_retry', {
            appointmentId: String(candidate._id),
            attempts: (candidate.reminderAttempts ?? 0) + 1,
            reasons: result.results.map((r) => `${r.channel}:${r.status}:${r.reason ?? ''}`),
          });
        } else {
          counts.undeliverable++;
          log.info('reminder_not_deliverable', {
            appointmentId: String(candidate._id),
            reasons: result.results.map((r) => `${r.channel}:${r.reason ?? ''}`),
          });
        }
      } catch (err: any) {
        counts.failed++;
        log.error('reminder_candidate_error', {
          appointmentId: String(candidate._id),
          reason: err?.message,
        });
      }
    }

    log.debug('reminder_tick', { examined: candidates.length, notDue, ...counts });

    return counts;
  }

  /**
   * Takes exclusive ownership of one appointment's reminder.
   *
   * A single conditional update, so the check and the write cannot be split. Two
   * scheduler replicas ticking at the same second will both match the candidate
   * query, and exactly one will match `reminderSentAt: null` here — which is the
   * only thing standing between the customer and two identical reminder texts.
   * The per-job distributed lock makes this rare; it does not make it impossible,
   * because a lock can expire mid-run.
   */
  private static async claim(appointmentId: Types.ObjectId): Promise<boolean> {
    const claimed = await Appointment.findOneAndUpdate(
      { _id: appointmentId, reminderSentAt: null },
      { $set: { reminderSentAt: new Date() }, $inc: { reminderAttempts: 1 } },
      { new: true, projection: { _id: 1 } }
    ).lean();

    return Boolean(claimed);
  }

  /** Releases a claim after a transient failure. The attempt count is kept. */
  private static async releaseClaim(appointmentId: Types.ObjectId): Promise<void> {
    await Appointment.updateOne({ _id: appointmentId }, { $set: { reminderSentAt: null } });
  }
}
