import { Document, Types } from 'mongoose';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'rescheduled'
  | 'en_route'
  | 'arrived'
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

export interface ICheckInInfo {
  timestamp: Date;
  latitude?: number;
  longitude?: number;
  address?: string;
}

export interface IJobChecklistItem {
  item: string;
  completed: boolean;
}

export interface IJobPhoto {
  url: string;
  caption?: string;
  phase: 'before' | 'after';
  uploadedAt: Date;
}

export interface IPartUsed {
  partName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface IAppointment extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  leadId?: Types.ObjectId;
  serviceId: Types.ObjectId;
  technicianId?: Types.ObjectId;
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
  checkIn?: ICheckInInfo;
  checkOut?: ICheckInInfo;
  checklist?: IJobChecklistItem[];
  photos?: IJobPhoto[];
  partsUsed?: IPartUsed[];
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
  /**
   * The technician this job is assigned to.
   *
   * This is the real assignment. Nothing used to write `Appointment.technicianId`
   * at all — only the free-text `technicianName` below — so every appointment
   * carried `technicianId: null` and the field app's per-technician job scoping
   * silently matched everything.
   */
  technicianId?: string | null;
  /**
   * Display name, derived from `technicianId` when one is given.
   *
   * Kept because existing records and the dispatch SMS lookup use it, but it is
   * no longer the source of truth. Supplying it alone still works for a business
   * that has not created technician records yet.
   */
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
  /** Pass `null` to unassign. */
  technicianId?: string | null;
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
  /** Filter the board to one technician. Preferred over `technicianName`. */
  technicianId?: string;
  technicianName?: string;
}
