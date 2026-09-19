import { Types, Document } from 'mongoose';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'unqualified'
  | 'appointment_pending'
  | 'appointment_booked'
  | 'quoted'
  | 'won'
  | 'completed'
  | 'lost'
  | 'archived';

export type LeadPriority = 'low' | 'medium' | 'high' | 'urgent';
export type LeadUrgency = 'low' | 'medium' | 'high' | 'emergency';
export type LeadSource = 'manual' | 'ai_call' | 'website' | 'referral' | 'missed_call_sms' | 'other';

export interface ILeadActivity {
  type: 'note' | 'status_change' | 'call_linked' | 'appointment_scheduled' | 'sms_sent';
  description: string;
  createdAt: Date;
  createdBy: string;
  metadata?: Record<string, any>;
}

export interface ILead extends Document {
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  title: string;
  description?: string;
  service?: string;
  serviceType?: string;
  serviceAddress?: string;
  status: LeadStatus;
  priority: LeadPriority;
  urgency?: LeadUrgency;
  source: LeadSource;
  estimatedValue?: number;
  notes?: string;
  aiIntent?: string;
  aiConfidence?: number;
  appointmentId?: Types.ObjectId;
  activities: ILeadActivity[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeadInput {
  customerId: string;
  title: string;
  description?: string;
  service?: string;
  serviceType?: string;
  serviceAddress?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  urgency?: LeadUrgency;
  source?: LeadSource;
  estimatedValue?: number;
  notes?: string;
  aiIntent?: string;
  aiConfidence?: number;
  appointmentId?: string;
}

export interface UpdateLeadInput {
  title?: string;
  description?: string;
  service?: string;
  serviceType?: string;
  serviceAddress?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  urgency?: LeadUrgency;
  source?: LeadSource;
  estimatedValue?: number;
  notes?: string;
  customerId?: string;
  appointmentId?: string;
  aiIntent?: string;
  aiConfidence?: number;
}

export interface LeadQueryFilter {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus | 'all';
  priority?: LeadPriority | 'all';
  source?: LeadSource | 'all';
  urgency?: LeadUrgency | 'all';
  customerId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
