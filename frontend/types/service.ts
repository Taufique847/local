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

export interface Service {
  _id: string;
  id?: string;
  businessId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  startingPrice?: number;
  category: ServiceCategory;
  isEmergencyService: boolean;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
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

export interface ServiceStats {
  total: number;
  active: number;
  inactive: number;
  emergencyServices: number;
  byCategory: Record<string, number>;
}

export interface ServiceQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ServiceStatus | 'all';
  category?: ServiceCategory | 'all';
  sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'price_low' | 'price_high';
}

export interface PaginatedServicesResponse {
  success: boolean;
  services: Service[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
