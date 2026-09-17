import { Types } from 'mongoose';
import { Appointment } from '../models/appointment.model';
import { Customer } from '../models/customer.model';
import { Service } from '../models/service.model';
import { Lead } from '../models/lead.model';
import { Business } from '../models/business.model';
import { AvailabilityService } from './availability.service';
import {
  CreateAppointmentInput,
  UpdateAppointmentInput,
  AppointmentQueryFilter,
  AppointmentStatus,
  IAppointment,
} from '../types/appointment.types';
import { AppError } from '../types';

export class AppointmentService {
  /**
   * Create a new appointment with double-booking check.
   */
  static async createAppointment(
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
    const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

    // Double-booking conflict check
    const hasConflict = await AvailabilityService.checkSlotConflict(businessId, startAt, endAt);
    if (hasConflict) {
      throw new AppError('This time slot is already booked. Please choose another time.', 409);
    }

    const title = `${service.name} - ${customer.firstName} ${customer.lastName}`.trim();
    const timezone = business.timezone || 'America/New_York';

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
      customerNotes: input.customerNotes,
      internalNotes: input.internalNotes,
      createdBy,
    });

    const populated = await Appointment.findById(appointment._id)
      .populate('customerId', 'firstName lastName phone email')
      .populate('serviceId', 'name durationMinutes startingPrice category')
      .populate('leadId', 'name phone email status');

    return populated!;
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

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.customerId) {
      query.customerId = filter.customerId;
    }

    if (filter.serviceId) {
      query.serviceId = filter.serviceId;
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
      if (filter.from) {
        query.startAt.$gte = new Date(filter.from);
      }
      if (filter.to) {
        query.startAt.$lte = new Date(filter.to);
      }
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
        .populate('customerId', 'firstName lastName phone email')
        .populate('serviceId', 'name durationMinutes startingPrice category')
        .populate('leadId', 'name phone email status'),
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
      .populate('leadId', 'name phone email status');

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    return appointment;
  }

  /**
   * Update appointment details with reschedule conflict check.
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

    let serviceId = appointment.serviceId;
    if (input.serviceId && input.serviceId !== appointment.serviceId.toString()) {
      const service = await Service.findOne({ _id: input.serviceId, businessId });
      if (!service) {
        throw new AppError('Service not found', 404);
      }
      serviceId = service._id;
    }

    let startAt = appointment.startAt;
    let endAt = appointment.endAt;

    if (input.startAt || input.serviceId) {
      const service = await Service.findById(serviceId);
      const durationMinutes = service?.durationMinutes || 60;

      if (input.startAt) {
        startAt = new Date(input.startAt);
        if (isNaN(startAt.getTime())) {
          throw new AppError('Invalid start date/time format', 400);
        }
      }

      endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

      // Check conflict excluding this appointment
      const hasConflict = await AvailabilityService.checkSlotConflict(
        businessId,
        startAt,
        endAt,
        appointment._id
      );

      if (hasConflict) {
        throw new AppError('This time slot is already booked. Please choose another time.', 409);
      }

      appointment.startAt = startAt;
      appointment.endAt = endAt;
      appointment.serviceId = serviceId;

      if (service) {
        const customer = await Customer.findById(appointment.customerId);
        if (customer) {
          appointment.title = `${service.name} - ${customer.firstName} ${customer.lastName}`.trim();
        }
      }
    }

    if (input.description !== undefined) appointment.description = input.description;
    if (input.priority !== undefined) appointment.priority = input.priority;
    if (input.customerNotes !== undefined) appointment.customerNotes = input.customerNotes;
    if (input.internalNotes !== undefined) appointment.internalNotes = input.internalNotes;

    await appointment.save();

    return this.getAppointmentById(businessId, id);
  }

  /**
   * Update appointment status (scheduled, confirmed, in_progress, completed, cancelled, no_show).
   */
  static async updateStatus(
    businessId: Types.ObjectId | string,
    id: string,
    status: AppointmentStatus,
    cancellationReason?: string
  ): Promise<IAppointment> {
    const appointment = await Appointment.findOne({ _id: id, businessId });
    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    const validStatuses: AppointmentStatus[] = [
      'scheduled',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
      'no_show',
    ];

    if (!validStatuses.includes(status)) {
      throw new AppError(`Invalid status: ${status}`, 400);
    }

    appointment.status = status;
    if (status === 'cancelled' && cancellationReason) {
      appointment.cancellationReason = cancellationReason;
    }

    await appointment.save();
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
   * Get today's appointments for dashboard / schedule overview.
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
      .populate('customerId', 'firstName lastName phone email')
      .populate('serviceId', 'name durationMinutes startingPrice category');
  }
}
