export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentPriority = 'low' | 'medium' | 'high' | 'urgent';

export type AppointmentSource = 'manual' | 'ai_call' | 'website' | 'referral' | 'other';

export interface AppointmentCustomer {
  _id: string;
  id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export interface AppointmentServiceItem {
  _id: string;
  id?: string;
  name: string;
  durationMinutes: number;
  startingPrice?: number;
  category?: string;
  description?: string;
}

export interface AppointmentLead {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
}

export interface Appointment {
  _id: string;
  id?: string;
  businessId: string;
  customerId: AppointmentCustomer | string;
  leadId?: AppointmentLead | string;
  serviceId: AppointmentServiceItem | string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  status: AppointmentStatus;
  priority: AppointmentPriority;
  source: AppointmentSource;
  /** Populated to `{ _id, name, phone }` by the list and detail endpoints. */
  technicianId?: { _id: string; name: string; phone?: string } | string | null;
  technicianName?: string;
  address?: string;
  customerNotes?: string;
  internalNotes?: string;
  cancellationReason?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentInput {
  customerId: string;
  leadId?: string;
  serviceId: string;
  startAt: string;
  description?: string;
  priority?: AppointmentPriority;
  source?: AppointmentSource;
  customerNotes?: string;
  internalNotes?: string;
  /** Technician record id. Omit to leave the job unassigned. */
  technicianId?: string;
  /** Recurring series rule. Materialises appointments up to 120-day horizon. */
  recurrence?: {
    frequency: 'weekly' | 'monthly';
    interval?: number;
    count?: number;
    until?: string;
  };
}

export interface UpdateAppointmentInput {
  serviceId?: string;
  startAt?: string;
  description?: string;
  priority?: AppointmentPriority;
  customerNotes?: string;
  internalNotes?: string;
  /** Pass `null` to unassign. */
  technicianId?: string | null;
}

export interface AppointmentQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  date?: string; // YYYY-MM-DD
  from?: string;
  to?: string;
  customerId?: string;
  serviceId?: string;
  /** Filter the board to one technician. */
  technicianId?: string;
}

export interface PaginatedAppointmentsResponse {
  success: boolean;
  appointments: Appointment[];
  total: number;
  page: number;
  totalPages: number;
}

export interface TimeSlot {
  startAt: string;
  endAt: string;
  available: boolean;
}

export interface AvailableSlotsResponse {
  success: boolean;
  date: string;
  timezone: string;
  durationMinutes: number;
  slots: TimeSlot[];
}
