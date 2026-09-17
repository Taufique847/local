import { Types, Document } from 'mongoose';

export type ServiceStatus = 'active' | 'inactive';

export type ServiceCategory = 
  | 'Cooling'
  | 'Heating'
  | 'Maintenance'
  | 'Installation'
  | 'Indoor Air Quality'
  | 'Ductwork'
  | 'Emergency'
  | 'Other';

export interface IService extends Document {
  businessId: Types.ObjectId;
  name: string;
  description?: string;
  durationMinutes?: number;
  startingPrice?: number;
  category: ServiceCategory;
  isEmergencyService: boolean;
  status: ServiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServiceInput {
  name: string;
  description?: string;
  durationMinutes?: number;
  startingPrice?: number;
  category?: ServiceCategory;
  isEmergencyService?: boolean;
  status?: ServiceStatus;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string;
  durationMinutes?: number;
  startingPrice?: number;
  category?: ServiceCategory;
  isEmergencyService?: boolean;
  status?: ServiceStatus;
}

export interface ServiceQueryFilter {
  page?: number;
  limit?: number;
  search?: string;
  status?: ServiceStatus | 'all';
  category?: ServiceCategory | 'all';
  sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'price_low' | 'price_high';
}
