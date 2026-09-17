import { Types } from 'mongoose';
import { Business } from '../models/business.model';
import { Service } from '../models/service.model';
import { Appointment } from '../models/appointment.model';
import { TimeSlot } from '../types/appointment.types';
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
