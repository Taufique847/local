import { Types } from 'mongoose';
import { Appointment } from '../models/appointment.model';
import { Customer } from '../models/customer.model';
import { Service } from '../models/service.model';
import { Lead } from '../models/lead.model';
import { Business } from '../models/business.model';
import { Technician } from '../models/technician.model';
import { AvailabilityService } from './availability.service';
import { LockService, LockAcquisitionError } from './lock.service';
import {
  CreateAppointmentInput,
  UpdateAppointmentInput,
  RescheduleAppointmentInput,
  AppointmentQueryFilter,
  AppointmentStatus,
  IAppointment,
} from '../types/appointment.types';
import { AppError } from '../types';

export class AppointmentService {
  /**
   * Lock held while a booking for one business is checked and written.
   *
   * Scoped per business so unrelated tenants never wait on each other.
   */
  private static bookingLockKey(businessId: Types.ObjectId | string): string {
    return `booking:${businessId.toString()}`;
  }

  /** Long enough to cover the conflict check plus the insert, short enough that a crash frees it quickly. */
  private static readonly BOOKING_LOCK_TTL_MS = 10_000;

  /**
   * Resolves an assignment to a technician record in THIS business.
   *
   * Returns the pair actually written to the appointment. Both fields are kept in
   * step deliberately: `technicianId` is the real reference the field app scopes
   * on, and `technicianName` is the denormalised copy the dispatch SMS lookup and
   * the existing list filter still read.
   *
   * Scoped by businessId, so an id belonging to another company's roster is a
   * 404 rather than a silent cross-tenant assignment.
   */
  private static async resolveTechnician(
    businessId: Types.ObjectId | string,
    technicianId: string | null | undefined,
    fallbackName?: string
  ): Promise<{ technicianId: Types.ObjectId | null; technicianName?: string } | null> {
    // `undefined` means "not supplied" — leave whatever is already there.
    if (technicianId === undefined) {
      return fallbackName === undefined
        ? null
        : { technicianId: null, technicianName: fallbackName };
    }

    // Explicit null means unassign.
    if (technicianId === null || technicianId === '') {
      return { technicianId: null, technicianName: fallbackName ?? undefined };
    }

    if (!Types.ObjectId.isValid(technicianId)) {
      throw new AppError('Technician not found', 404);
    }

    const technician = await Technician.findOne({
      _id: technicianId,
      businessId,
      active: true,
    });

    if (!technician) {
      throw new AppError('Technician not found', 404);
    }

    return { technicianId: technician._id, technicianName: technician.name };
  }

  /**
   * Create a new appointment with double-booking check and lead synchronization.
   *
   * The conflict check and the insert run under a per-business lock. Without it
   * the two were separate round trips, so two callers reaching the assistant at
   * the same moment could both be told a slot was free and both be booked into
   * it — the worst failure an answering service can have, because a technician
   * gets promised to two addresses.
   */
  static async createAppointment(
    businessId: Types.ObjectId | string,
    input: CreateAppointmentInput,
    createdBy: string = 'owner'
  ): Promise<IAppointment> {
    try {
      return await LockService.withLock(
        AppointmentService.bookingLockKey(businessId),
        { ttlMs: AppointmentService.BOOKING_LOCK_TTL_MS, retries: 25, retryDelayMs: 120 },
        () => AppointmentService.createAppointmentUnlocked(businessId, input, createdBy)
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

  private static async createAppointmentUnlocked(
    businessId: Types.ObjectId | string,
    input: CreateAppointmentInput,
    createdBy: string = 'owner'
  ): Promise<IAppointment> {
    const business = await Business.findById(businessId);
    if (!business) {
      throw new AppError('Business not found', 404);
    }

    const customer = await Customer.findOne({ _id: input.customerId, businessId });
    if (!customer) {
      throw new AppError('Customer not found', 404);
    }

    const service = await Service.findOne({ _id: input.serviceId, businessId });
    if (!service) {
      throw new AppError('Service not found', 404);
    }

    if (input.leadId) {
      const lead = await Lead.findOne({ _id: input.leadId, businessId });
      if (!lead) {
        throw new AppError('Lead not found', 404);
      }
    }

    const startAt = new Date(input.startAt);
    if (isNaN(startAt.getTime())) {
      throw new AppError('Invalid start date/time format', 400);
    }

    const durationMinutes = service.durationMinutes || 60;
    const endAt = input.endAt
      ? new Date(input.endAt)
      : new Date(startAt.getTime() + durationMinutes * 60 * 1000);

    // Double-booking conflict check
    const hasConflict = await AvailabilityService.checkSlotConflict(businessId, startAt, endAt);
    if (hasConflict) {
      throw new AppError('This time slot is already booked. Please choose another time.', 409);
    }

    const title = `${service.name} - ${customer.firstName} ${customer.lastName}`.trim();
    const timezone = business.timezone || 'America/New_York';
    const address = input.address || customer.address;

    // Writes technicianId, which nothing did before. Without it every job stayed
    // unassigned and the field app could not scope to one person's work.
    const assignment = await AppointmentService.resolveTechnician(
      businessId,
      input.technicianId,
      input.technicianName
    );

    const appointment = await Appointment.create({
      businessId,
      customerId: input.customerId,
      leadId: input.leadId || null,
      serviceId: input.serviceId,
      title,
      description: input.description,
      startAt,
      endAt,
      timezone,
      status: 'scheduled',
      priority: input.priority || 'medium',
      source: input.source || 'manual',
      address,
      technicianId: assignment?.technicianId ?? null,
      technicianName: assignment?.technicianName ?? input.technicianName,
      customerNotes: input.customerNotes,
      internalNotes: input.internalNotes,
      createdBy,
    });

    // If linked to lead, update lead status to appointment_booked
    if (input.leadId) {
      await Lead.findOneAndUpdate(
        { _id: input.leadId, businessId },
        {
          $set: {
            appointmentId: appointment._id,
            status: 'appointment_booked',
          },
          $push: {
            activities: {
              type: 'appointment_scheduled',
              description: `Appointment scheduled for ${startAt.toLocaleString()}`,
              createdAt: new Date(),
              createdBy,
              metadata: { appointmentId: appointment._id },
            },
          },
        }
      );
    }

    const populated = await Appointment.findById(appointment._id)
      .populate('customerId', 'firstName lastName phone email address')
      .populate('serviceId', 'name durationMinutes startingPrice category')
      .populate('leadId', 'title status urgency');

    return populated!;
  }

  /**
   * Reschedule an existing appointment with conflict checking and history tracking (M13).
   */
  static async rescheduleAppointment(
    businessId: Types.ObjectId | string,
    id: string,
    input: RescheduleAppointmentInput
  ): Promise<IAppointment> {
    // Same race as creating: check-then-write against the same slot space.
    try {
      return await LockService.withLock(
        AppointmentService.bookingLockKey(businessId),
        { ttlMs: AppointmentService.BOOKING_LOCK_TTL_MS, retries: 25, retryDelayMs: 120 },
        () => AppointmentService.rescheduleAppointmentUnlocked(businessId, id, input)
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

  private static async rescheduleAppointmentUnlocked(
    businessId: Types.ObjectId | string,
    id: string,
    input: RescheduleAppointmentInput
  ): Promise<IAppointment> {
    const appointment = await Appointment.findOne({ _id: id, businessId });
    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    if (['completed', 'cancelled'].includes(appointment.status)) {
      throw new AppError(`Cannot reschedule an appointment that is already ${appointment.status}`, 400);
    }

    const newStartAt = new Date(input.startAt);
    if (isNaN(newStartAt.getTime())) {
      throw new AppError('Invalid new start date format', 400);
    }

    const durationMs = appointment.endAt.getTime() - appointment.startAt.getTime();
    const newEndAt = input.endAt ? new Date(input.endAt) : new Date(newStartAt.getTime() + durationMs);

    // Check conflict excluding this appointment
    const hasConflict = await AvailabilityService.checkSlotConflict(
      businessId,
      newStartAt,
      newEndAt,
      appointment._id
    );

    if (hasConflict) {
      throw new AppError('The requested reschedule time slot is already booked.', 409);
    }

    // Record reschedule history
    appointment.rescheduleHistory.push({
      previousStartAt: appointment.startAt,
      previousEndAt: appointment.endAt,
      newStartAt,
      newEndAt,
      reason: input.reason,
      changedAt: new Date(),
      changedBy: input.changedBy || 'system',
    });

    appointment.startAt = newStartAt;
    appointment.endAt = newEndAt;
    appointment.status = 'rescheduled';

    await appointment.save();

    // Notify linked lead if present
    if (appointment.leadId) {
      await Lead.findOneAndUpdate(
        { _id: appointment.leadId, businessId },
        {
          $push: {
            activities: {
              type: 'note',
              description: `Appointment rescheduled to ${newStartAt.toLocaleString()}${input.reason ? ` (${input.reason})` : ''}`,
              createdAt: new Date(),
              createdBy: input.changedBy || 'scheduling_engine',
            },
          },
        }
      );
    }

    return this.getAppointmentById(businessId, id);
  }

  /**
   * Cancel an appointment with mandatory or optional reason (M13).
   */
  static async cancelAppointment(
    businessId: Types.ObjectId | string,
    id: string,
    reason?: string,
    cancelledBy: string = 'user'
  ): Promise<IAppointment> {
    const appointment = await Appointment.findOne({ _id: id, businessId });
    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    if (appointment.status === 'completed') {
      throw new AppError('Cannot cancel an already completed appointment', 400);
    }

    appointment.status = 'cancelled';
    appointment.cancellationReason = reason || 'Cancelled by customer/business request';
    await appointment.save();

    if (appointment.leadId) {
      await Lead.findOneAndUpdate(
        { _id: appointment.leadId, businessId },
        {
          $push: {
            activities: {
              type: 'note',
              description: `Appointment cancelled: ${appointment.cancellationReason}`,
              createdAt: new Date(),
              createdBy: cancelledBy,
            },
          },
        }
      );
    }

    return this.getAppointmentById(businessId, id);
  }

  /**
   * Get calendar range appointments (for week or month views)
   */
  static async getCalendarAppointments(
    businessId: Types.ObjectId | string,
    from: string,
    to: string
  ): Promise<IAppointment[]> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    return Appointment.find({
      businessId,
      status: { $ne: 'cancelled' },
      startAt: { $gte: fromDate, $lte: toDate },
    })
      .sort({ startAt: 1 })
      .populate('customerId', 'firstName lastName phone email address')
      .populate('serviceId', 'name durationMinutes startingPrice category');
  }

  /**
   * List appointments with filtering, pagination, and date search.
   */
  static async getAppointments(
    businessId: Types.ObjectId | string,
    filter: AppointmentQueryFilter
  ): Promise<{
    appointments: IAppointment[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query: any = { businessId };

    if (filter.status && filter.status !== 'all') {
      query.status = filter.status;
    }

    if (filter.customerId) {
      query.customerId = filter.customerId;
    }

    // Preferred: filter on the real reference. Falls back to the name for
    // records created before technicianId was written.
    if (filter.technicianId && Types.ObjectId.isValid(filter.technicianId)) {
      query.technicianId = filter.technicianId;
    } else if (filter.technicianName) {
      query.technicianName = new RegExp(filter.technicianName, 'i');
    }

    // Specific day filter: YYYY-MM-DD
    if (filter.date) {
      const [year, month, day] = filter.date.split('-').map(Number);
      if (year && month && day) {
        const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        query.startAt = { $gte: startOfDay, $lte: endOfDay };
      }
    } else if (filter.from || filter.to) {
      query.startAt = {};
      if (filter.from) query.startAt.$gte = new Date(filter.from);
      if (filter.to) query.startAt.$lte = new Date(filter.to);
    }

    // Text search in title or customer
    if (filter.search) {
      const searchRegex = new RegExp(filter.search.trim(), 'i');
      const matchingCustomers = await Customer.find({
        businessId,
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { phone: searchRegex },
          { email: searchRegex },
        ],
      }).select('_id');

      const customerIds = matchingCustomers.map((c) => c._id);

      query.$or = [
        { title: searchRegex },
        { address: searchRegex },
        { customerNotes: searchRegex },
        { internalNotes: searchRegex },
        { customerId: { $in: customerIds } },
      ];
    }

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .sort({ startAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('customerId', 'firstName lastName phone email address')
        .populate('serviceId', 'name durationMinutes startingPrice category')
        .populate('leadId', 'title status urgency'),
      Appointment.countDocuments(query),
    ]);

    return {
      appointments,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get single appointment by ID.
   */
  static async getAppointmentById(
    businessId: Types.ObjectId | string,
    id: string
  ): Promise<IAppointment> {
    const appointment = await Appointment.findOne({ _id: id, businessId })
      .populate('customerId', 'firstName lastName phone email address')
      .populate('serviceId', 'name durationMinutes startingPrice category description')
      .populate('leadId', 'title status urgency');

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    return appointment;
  }

  /**
   * Update appointment details.
   */
  static async updateAppointment(
    businessId: Types.ObjectId | string,
    id: string,
    input: UpdateAppointmentInput
  ): Promise<IAppointment> {
    const appointment = await Appointment.findOne({ _id: id, businessId });
    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    if (input.description !== undefined) appointment.description = input.description;
    if (input.priority !== undefined) appointment.priority = input.priority;
    if (input.status !== undefined) appointment.status = input.status;
    if (input.address !== undefined) appointment.address = input.address;
    if (input.customerNotes !== undefined) appointment.customerNotes = input.customerNotes;
    if (input.internalNotes !== undefined) appointment.internalNotes = input.internalNotes;

    /**
     * Reassignment.
     *
     * Handled after the simple field copies because it can throw, and because
     * `technicianId` has to win over any `technicianName` sent alongside it — the
     * two disagreeing is how the denormalised copy drifts out of step with the
     * reference the field app actually scopes on.
     */
    if (input.technicianId !== undefined) {
      const assignment = await AppointmentService.resolveTechnician(
        businessId,
        input.technicianId,
        input.technicianName
      );
      appointment.technicianId = (assignment?.technicianId ?? undefined) as any;
      appointment.technicianName = assignment?.technicianName;
    } else if (input.technicianName !== undefined) {
      // Name-only update, for a business with no technician records yet.
      appointment.technicianName = input.technicianName;
    }

    await appointment.save();
    return this.getAppointmentById(businessId, id);
  }

  /**
   * Update appointment status.
   */
  static async updateStatus(
    businessId: Types.ObjectId | string,
    id: string,
    status: AppointmentStatus,
    cancellationReason?: string
  ): Promise<IAppointment> {
    if (status === 'cancelled') {
      return this.cancelAppointment(businessId, id, cancellationReason);
    }

    const appointment = await Appointment.findOne({ _id: id, businessId });
    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    if (!appointment.serviceId) {
      const Service = (await import('../models/service.model')).Service;
      const defaultService = await Service.findOne({ businessId, status: 'active' });
      if (defaultService) {
        appointment.serviceId = defaultService._id as any;
      }
    }
    if (!appointment.timezone) {
      appointment.timezone = 'America/New_York';
    }

    appointment.status = status;
    if (cancellationReason) {
      appointment.cancellationReason = cancellationReason;
    }
    await appointment.save();

    // Queue the CSAT survey rather than firing it instantly. The scheduler sends
    // it a couple of hours later, inside TCPA quiet hours, which both complies
    // with the rules and gets a much better response rate than texting the
    // customer while the technician is still in the driveway.
    if (status === 'completed') {
      try {
        const { ReviewReputationService } = await import('./review-reputation.service');
        await ReviewReputationService.schedulePostServiceSurvey(appointment._id).catch((err) => {
          console.warn('Error scheduling automated CSAT review survey:', err.message);
        });
      } catch (err: any) {
        console.warn('Error importing ReviewReputationService:', err.message);
      }
    }

    return this.getAppointmentById(businessId, id);
  }

  /**
   * Delete appointment.
   */
  static async deleteAppointment(
    businessId: Types.ObjectId | string,
    id: string
  ): Promise<boolean> {
    const result = await Appointment.deleteOne({ _id: id, businessId });
    if (result.deletedCount === 0) {
      throw new AppError('Appointment not found', 404);
    }
    return true;
  }

  /**
   * Get today's appointments.
   */
  static async getTodayAppointments(
    businessId: Types.ObjectId | string
  ): Promise<IAppointment[]> {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    return Appointment.find({
      businessId,
      status: { $nin: ['cancelled', 'no_show'] },
      startAt: { $gte: startOfDay, $lte: endOfDay },
    })
      .sort({ startAt: 1 })
      .populate('customerId', 'firstName lastName phone email address')
      .populate('serviceId', 'name durationMinutes startingPrice category');
  }
}
