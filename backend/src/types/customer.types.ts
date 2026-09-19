import { Document, Types } from 'mongoose';

export type CustomerStatus = 'active' | 'inactive';

export interface ICustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface ICustomer extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  address?: ICustomerAddress;
  serviceAddresses: ICustomerAddress[];
  tags: string[];
  lifetimeValue: number;
  notes?: string;
  status: CustomerStatus;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerDTO {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email?: string;
  address?: ICustomerAddress;
  serviceAddresses?: ICustomerAddress[];
  tags?: string[];
  lifetimeValue?: number;
  notes?: string;
  status: CustomerStatus;
  source: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CustomerInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  address?: ICustomerAddress;
  serviceAddresses?: ICustomerAddress[];
  tags?: string[];
  lifetimeValue?: number;
  notes?: string;
  status?: CustomerStatus;
  source?: string;
}

export interface CustomerQueryInput {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  tag?: string;
}

export interface PaginatedCustomers {
  customers: CustomerDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
