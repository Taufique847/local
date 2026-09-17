import { CustomerAddress } from './customer';

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

export interface LeadCustomer {
  _id: string;
  id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  address?: CustomerAddress;
  propertyType?: string;
  notes?: string;
}

export interface Lead {
  _id: string;
  id?: string;
  businessId: string;
  customerId: LeadCustomer;
  title: string;
  description?: string;
  service?: string;
  status: LeadStatus;
  priority: LeadPriority;
  source: LeadSource;
  estimatedValue?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
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
  customerId?: string;
  title?: string;
  description?: string;
  service?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  source?: LeadSource;
  estimatedValue?: number;
  notes?: string;
}

export interface LeadStats {
  total: number;
  active: number;
  byStatus: Record<LeadStatus, number>;
}

export interface LeadQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  priority?: string;
  source?: string;
  customerId?: string;
}

export interface PaginatedLeadsResponse {
  success: boolean;
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
