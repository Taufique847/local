import { Types } from 'mongoose';
import { Business } from '../models/business.model';
import { Service } from '../models/service.model';
import { Appointment } from '../models/appointment.model';
import { TimeSlot } from '../types/appointment.types';
import { zonedParts, parseTimeOfDay } from '../utils/format';
import { AppError } from '../types';

export class AvailabilityService {
  /**
   * Check if an appointment overlaps with existing non-cancelled appointments.
   */
  static async checkSlotConflict(
    businessId: Types.ObjectId | string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: Types.ObjectId | string
  ): Promise<boolean> {
    const filter: any = {
      businessId,
      status: { $nin: ['cancelled', 'no_show'] },
      startAt: { $lt: endAt },
      endAt: { $gt: startAt },
    };

    if (excludeAppointmentId) {
      filter._id = { $ne: excludeAppointmentId };
    }

    const conflicting = await Appointment.findOne(filter);
    return !!conflicting;
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
   */
  static async getAvailableSlots(
    businessId: Types.ObjectId | string,
    serviceId: string,
    dateStr: string
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

    const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[dateObj.getUTCDay()];

    const dayHours = business.businessHours?.find(
      (h) => h.day.toLowerCase() === dayOfWeek.toLowerCase()
    );

    if (!dayHours || !dayHours.isOpen) {
      return {
        date: dateStr,
        timezone,
        durationMinutes,
        slots: [],
      };
    }

    // Parse openTime & closeTime (HH:MM)
    const [openH, openM] = (dayHours.openTime || '08:00').split(':').map(Number);
    const [closeH, closeM] = (dayHours.closeTime || '18:00').split(':').map(Number);

    const openTotalMins = openH * 60 + openM;
    const closeTotalMins = closeH * 60 + closeM;

    // Fetch all existing non-cancelled appointments for this business on this day
    const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const existingAppointments = await Appointment.find({
      businessId,
      status: { $nin: ['cancelled', 'no_show'] },
      startAt: { $lt: dayEnd },
      endAt: { $gt: dayStart },
    });

    const slots: TimeSlot[] = [];
    const intervalMinutes = 30;

    for (let m = openTotalMins; m + durationMinutes <= closeTotalMins; m += intervalMinutes) {
      const slotStartH = Math.floor(m / 60);
      const slotStartM = m % 60;

      const slotStart = new Date(Date.UTC(year, month - 1, day, slotStartH, slotStartM, 0));
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

      // Check conflict
      const hasConflict = existingAppointments.some(
        (apt) => slotStart < apt.endAt && slotEnd > apt.startAt
      );

      // Check if slot is in past
      const isPast = slotStart.getTime() < Date.now();

      slots.push({
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        available: !hasConflict && !isPast,
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
