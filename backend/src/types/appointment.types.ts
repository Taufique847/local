import { Document, Types } from 'mongoose';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'rescheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentPriority = 'low' | 'medium' | 'high' | 'urgent';

export type AppointmentSource = 'manual' | 'ai_call' | 'website' | 'referral' | 'other';

export interface TimeSlot {
  time?: string;
  startAt: string;
  endAt: string;
  available: boolean;
}

export interface IRescheduleRecord {
  previousStartAt: Date;
  previousEndAt: Date;
  newStartAt: Date;
  newEndAt: Date;
  reason?: string;
  changedAt: Date;
  changedBy: string;
}

export interface IAppointment extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  leadId?: Types.ObjectId;
  serviceId: Types.ObjectId;
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: AppointmentStatus;
  priority: AppointmentPriority;
  source: AppointmentSource;
  address?: string;
  technicianName?: string;
  customerNotes?: string;
  internalNotes?: string;
  cancellationReason?: string;
  rescheduleHistory: IRescheduleRecord[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAppointmentInput {
  customerId: string;
  leadId?: string;
  serviceId: string;
  startAt: string; // ISO string
  endAt?: string;
  description?: string;
  address?: string;
  technicianName?: string;
  priority?: AppointmentPriority;
  source?: AppointmentSource;
  customerNotes?: string;
  internalNotes?: string;
}

export interface UpdateAppointmentInput {
  serviceId?: string;
  startAt?: string;
  endAt?: string;
  description?: string;
  address?: string;
  technicianName?: string;
  priority?: AppointmentPriority;
  status?: AppointmentStatus;
  customerNotes?: string;
  internalNotes?: string;
}

export interface RescheduleAppointmentInput {
  startAt: string; // ISO string
  endAt?: string;
  reason?: string;
  changedBy?: string;
}

export interface AppointmentQueryFilter {
  page?: string | number;
  limit?: string | number;
  search?: string;
  status?: string;
  date?: string;    // YYYY-MM-DD for single day
  from?: string;    // YYYY-MM-DD range start
  to?: string;      // YYYY-MM-DD range end
  customerId?: string;
  technicianName?: string;
}
