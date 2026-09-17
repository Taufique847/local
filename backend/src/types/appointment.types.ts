import { Document, Types } from 'mongoose';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export type AppointmentPriority = 'low' | 'medium' | 'high' | 'urgent';

export type AppointmentSource = 'manual' | 'ai_call' | 'website' | 'referral' | 'other';

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
  customerNotes?: string;
  internalNotes?: string;
  cancellationReason?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAppointmentInput {
  customerId: string;
  leadId?: string;
  serviceId: string;
  startAt: string; // ISO string from frontend
  description?: string;
  priority?: AppointmentPriority;
  source?: AppointmentSource;
  customerNotes?: string;
  internalNotes?: string;
}

export interface UpdateAppointmentInput {
  serviceId?: string;
  startAt?: string;
  description?: string;
  priority?: AppointmentPriority;
  customerNotes?: string;
  internalNotes?: string;
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
  serviceId?: string;
}

export interface TimeSlot {
  startAt: string; // ISO string
  endAt: string;   // ISO string
  available: boolean;
}
