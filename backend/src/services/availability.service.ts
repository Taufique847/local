import { Types } from 'mongoose';
import { Business } from '../models/business.model';
import { Service } from '../models/service.model';
import { Appointment } from '../models/appointment.model';
import { Technician } from '../models/technician.model';
import { TimeSlot } from '../types/appointment.types';
import { zonedParts, parseTimeOfDay, zonedWallClockToUtc } from '../utils/format';
import { AppError } from '../types';

/** Statuses that do not occupy a technician's time. */
const LIVE_STATUSES = { $nin: ['cancelled', 'no_show'] };

export interface SlotConflictOptions {
  /** Excluded from the overlap check — the appointment being rescheduled. */
  excludeAppointmentId?: Types.ObjectId | string | null;
  /**
   * The technician the job is assigned to. When given, only that person's diary is
   * consulted. When absent, the business's total capacity is.
   */
  technicianId?: Types.ObjectId | string | null;
}

export interface SlotConflictResult {
  conflict: boolean;
  reason?: string;
}

export class AvailabilityService {
  /**
   * Whether a time window can actually be served.
   *
   * This used to be a single business-wide overlap query: if *any* appointment
   * overlapped, the slot was taken. A five-technician company could therefore hold
   * exactly one job at a time — assigning different people to different addresses
   * made no difference, because nothing in this path read `technicianId`. For a
   * business with a crew, the product's core scheduling rule was wrong.
   *
   * Two cases now, because they are genuinely different questions:
   *
   *  - **A job assigned to someone** asks "is this person free?". Only their diary
   *    matters; four colleagues being busy is irrelevant.
   *  - **An unassigned job** asks "is there anyone left?". Nobody is named yet, so
   *    the constraint is capacity: the number of overlapping jobs against the number
   *    of active technicians. This is why it is not simply skipped — an unassigned
   *    job still needs a body, and accepting six of them for a crew of three is the
   *    same broken promise as double-booking one person.
   *
   * A business with no technician records is treated as a crew of one, which is the
   * one-person shop the old behaviour actually suited.
   */
  static async checkSlotConflictDetailed(
    businessId: Types.ObjectId | string,
    startAt: Date,
    endAt: Date,
    options: SlotConflictOptions = {}
  ): Promise<SlotConflictResult> {
    // Half-open on both sides, so back-to-back jobs touching at a boundary do not
    // collide. A 10:00–11:00 and an 11:00–12:00 are two jobs, not a conflict.
    const overlap: any = {
      businessId,
      status: LIVE_STATUSES,
      startAt: { $lt: endAt },
      endAt: { $gt: startAt },
    };

    if (options.excludeAppointmentId) {
      overlap._id = { $ne: options.excludeAppointmentId };
    }

    /**
     * A named booking has to clear **both** questions, not just the first.
     *
     * Asking only "is this person free?" leaves a real hole: with a crew of two and two
     * *unassigned* jobs already overlapping, neither of them is attached to Technician A,
     * so A looks free — and accepting the booking gives a two-person crew three concurrent
     * jobs. The unassigned work still needs both of them.
     *
     * So the person's own diary is checked, and then the same capacity question an
     * unassigned booking asks. Naming someone narrows who can do the job; it does not
     * conjure a third technician.
     */
    if (options.technicianId) {
      const clash = await Appointment.findOne({ ...overlap, technicianId: options.technicianId })
        .select('technicianName startAt')
        .lean();

      if (clash) {
        return {
          conflict: true,
          reason: clash.technicianName
            ? `${clash.technicianName} is already booked for that time.`
            : 'That technician is already booked for that time.',
        };
      }
    }

    const [overlapping, crewSize] = await Promise.all([
      Appointment.countDocuments(overlap),
      Technician.countDocuments({ businessId, active: true }),
    ]);

    const capacity = Math.max(1, crewSize);

    if (overlapping < capacity) return { conflict: false };

    return {
      conflict: true,
      reason:
        capacity === 1
          ? 'This time slot is already booked. Please choose another time.'
          : `All ${capacity} technicians are already booked for that time.`,
    };
  }

  /**
   * Boolean form, kept because the conflict-check endpoint and the slot generator
   * only need the yes/no.
   */
  static async checkSlotConflict(
    businessId: Types.ObjectId | string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: Types.ObjectId | string,
    technicianId?: Types.ObjectId | string | null
  ): Promise<boolean> {
    const result = await this.checkSlotConflictDetailed(businessId, startAt, endAt, {
      excludeAppointmentId,
      technicianId,
    });
    return result.conflict;
  }

  /**
   * Whether a time window falls inside the business's published opening hours.
   *
   * `rescheduleAppointment` re-checked slot overlap and nothing else, so an
   * appointment could be moved to 3am, or onto a Sunday the business marks closed,
   * and the conflict check would happily report the slot free — it is free,
   * because nobody works then.
   *
   * Compared in the business's own timezone. The rest of this file still buckets
   * by UTC; that is a separate defect and this method is deliberately correct so
   * the fix has something to converge on.
   */
  static async isWithinBusinessHours(
    businessId: Types.ObjectId | string,
    startAt: Date,
    endAt: Date
  ): Promise<{ ok: boolean; reason?: string }> {
    const business = await Business.findById(businessId).select('businessHours timezone').lean();
    if (!business) throw new AppError('Business not found', 404);

    const timezone = business.timezone || 'America/New_York';

    // A business that has never configured hours is not treated as closed — that
    // would make every booking fail on a fresh account.
    if (!business.businessHours?.length) return { ok: true };

    const start = zonedParts(startAt, timezone);
    const end = zonedParts(endAt, timezone);
    if (!start || !end) return { ok: false, reason: 'Invalid appointment times' };

    const dayHours = business.businessHours.find(
      (h) => h.day.toLowerCase() === start.weekday.toLowerCase()
    );

    if (!dayHours || !dayHours.isOpen) {
      return { ok: false, reason: `${start.weekday} is outside your published opening hours.` };
    }

    const open = parseTimeOfDay(dayHours.openTime, 8 * 60);
    const close = parseTimeOfDay(dayHours.closeTime, 18 * 60);

    if (start.minutesOfDay < open) {
      return {
        ok: false,
        reason: `That start time is before you open on ${start.weekday} (${dayHours.openTime || '08:00'}).`,
      };
    }

    /**
     * A job that runs past closing is rejected, and a job that crosses midnight
     * into the next day with it — the end lands on a different calendar day, so
     * its minutes-of-day would compare as early morning and pass.
     */
    const endMinutes =
      end.day === start.day && end.month === start.month && end.year === start.year
        ? end.minutesOfDay
        : close + 1;

    if (endMinutes > close) {
      return {
        ok: false,
        reason: `That appointment would finish after you close on ${start.weekday} (${dayHours.closeTime || '18:00'}).`,
      };
    }

    return { ok: true };
  }

  /**
   * Generate available slots for a given business, service, and date (YYYY-MM-DD).
   *
   * Every instant here is built from the business's own wall clock, which it was not
   * before. The old version stamped `openTime` onto `Date.UTC(...)`, so a New York
   * shop open 08:00–18:00 was offered slots covering 03:00–13:00 Eastern; the booking
   * path compared the same hours in `business.timezone` and rejected most of them with
   * a 409. The endpoint that offers slots and the service that accepts them were
   * answering different questions, and this is where they now agree.
   *
   * Availability also matches the booking path's notion of "taken": a slot is free
   * while the business still has an unbooked technician, rather than as soon as any
   * one job overlaps.
   */
  static async getAvailableSlots(
    businessId: Types.ObjectId | string,
    serviceId: string,
    dateStr: string,
    options: { technicianId?: Types.ObjectId | string | null } = {}
  ): Promise<{
    date: string;
    timezone: string;
    durationMinutes: number;
    slots: TimeSlot[];
  }> {
    const business = await Business.findById(businessId);
    if (!business) {
      throw new AppError('Business not found', 404);
    }

    const service = await Service.findOne({ _id: serviceId, businessId });
    if (!service) {
      throw new AppError('Service not found', 404);
    }

    const durationMinutes = service.durationMinutes || 60;
    const timezone = business.timezone || 'America/New_York';

    // Parse date (YYYY-MM-DD)
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
    }

    /**
     * The weekday of the requested date, which needs no timezone.
     *
     * Worth stating because it looks like it should. `dateStr` is a calendar date, not
     * an instant, and the 3rd of January 2027 is a Sunday everywhere — so the weekday
     * is pure calendar arithmetic and the noon anchor is only there to keep `Date.UTC`
     * clear of its own day boundary. Routing it through the business timezone would
     * imply a zone-dependence that does not exist, and an earlier draft did exactly
     * that: two `Intl` calls producing a value indistinguishable from this one.
     *
     * The timezone matters for the slot *instants* below, which is where the bug was.
     */
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekday = dayNames[new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()];

    const dayHours = business.businessHours?.find(
      (h) => h.day.toLowerCase() === weekday.toLowerCase()
    );

    if (!dayHours || !dayHours.isOpen) {
      return {
        date: dateStr,
        timezone,
        durationMinutes,
        slots: [],
      };
    }

    // The same parser `isWithinBusinessHours` uses, rather than a second inline split
    // that could disagree with it about a malformed value.
    const openTotalMins = parseTimeOfDay(dayHours.openTime, 8 * 60);
    const closeTotalMins = parseTimeOfDay(dayHours.closeTime, 18 * 60);

    /**
     * Existing appointments over the **local** day, not the UTC one.
     *
     * The old window ran UTC midnight to midnight, which for a Dallas business is
     * 19:00 the previous evening to 19:00. An 8 PM job was outside it and so never
     * blocked a slot on the day it actually falls on.
     *
     * Widened by a day on each side because a job that starts the previous local
     * evening can still overlap this morning's first slot.
     */
    const windowStart = zonedWallClockToUtc(year, month, day - 1, 0, timezone);
    const windowEnd = zonedWallClockToUtc(year, month, day + 2, 0, timezone);

    const appointmentFilter: any = {
      businessId,
      status: LIVE_STATUSES,
      startAt: { $lt: windowEnd },
      endAt: { $gt: windowStart },
    };

    if (options.technicianId) appointmentFilter.technicianId = options.technicianId;

    /**
     * Capacity: one when a specific person was asked about, otherwise the crew size.
     *
     * Matches `checkSlotConflictDetailed`, so an offered slot is one the booking path
     * will accept. A business with no technician records is a crew of one — the
     * one-person shop the old business-wide behaviour actually suited.
     */
    const [existingAppointments, capacity] = await Promise.all([
      Appointment.find(appointmentFilter).select('startAt endAt').lean(),
      options.technicianId
        ? Promise.resolve(1)
        : Technician.countDocuments({ businessId, active: true }).then((n) => Math.max(1, n)),
    ]);

    const slots: TimeSlot[] = [];
    const intervalMinutes = 30;
    const now = Date.now();

    for (let m = openTotalMins; m + durationMinutes <= closeTotalMins; m += intervalMinutes) {
      const slotStart = zonedWallClockToUtc(year, month, day, m, timezone);

      /**
       * Skip a local time that does not exist.
       *
       * On a spring-forward day the clock jumps 02:00 → 03:00, so 02:30 never
       * happens. `zonedWallClockToUtc` returns the instant the clock actually
       * reached, which reads back as 03:30 — offering that as a "02:30" slot would
       * book a customer an hour later than they were told. Round-tripping and
       * dropping the mismatch says "no such time today", which is the truth.
       */
      const readBack = zonedParts(slotStart, timezone);
      if (!readBack || readBack.minutesOfDay !== m) continue;

      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

      const overlapping = existingAppointments.filter(
        (apt) => slotStart < apt.endAt && slotEnd > apt.startAt
      ).length;

      const isPast = slotStart.getTime() < now;

      slots.push({
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        available: overlapping < capacity && !isPast,
      });
    }

    return {
      date: dateStr,
      timezone,
      durationMinutes,
      slots,
    };
  }
}
