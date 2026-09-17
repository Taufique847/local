export type CustomerStatus = 'active' | 'inactive';

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface Customer {
  id: string;
  _id?: string;
  businessId: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  phone: string;
  email?: string;
  address?: CustomerAddress;
  notes?: string;
  status: CustomerStatus;
  propertyType?: 'residential' | 'commercial';
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  address?: CustomerAddress;
  notes?: string;
  status?: CustomerStatus;
  propertyType?: 'residential' | 'commercial';
}

export type CreateCustomerDto = CustomerInput;
export type UpdateCustomerDto = Partial<CustomerInput>;

export interface CustomerStats {
  total: number;
  active: number;
}

export interface CustomerListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  propertyType?: string;
}

export interface PaginatedCustomersResponse {
  success: boolean;
  customers: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
