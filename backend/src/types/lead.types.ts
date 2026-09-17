import { Types, Document } from 'mongoose';

export type LeadStatus = 
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'quoted'
  | 'won'
  | 'lost'
  | 'archived';

export type LeadPriority = 'low' | 'medium' | 'high' | 'urgent';

export type LeadSource = 'manual' | 'ai_call' | 'website' | 'referral' | 'other';

export interface ILead extends Document {
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  title: string;
  description?: string;
  service?: string;
  status: LeadStatus;
  priority: LeadPriority;
  source: LeadSource;
  estimatedValue?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLeadInput {
  customerId: string;
  title: string;
  description?: string;
  service?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  source?: LeadSource;
  estimatedValue?: number;
  notes?: string;
}

export interface UpdateLeadInput {
  title?: string;
  description?: string;
  service?: string;
  priority?: LeadPriority;
  source?: LeadSource;
  estimatedValue?: number;
  notes?: string;
  customerId?: string;
}

export interface LeadQueryFilter {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus | 'all';
  priority?: LeadPriority | 'all';
  source?: LeadSource | 'all';
  customerId?: string;
}
