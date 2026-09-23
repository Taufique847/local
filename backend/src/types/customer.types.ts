import { Document, Types } from 'mongoose';

export type CustomerStatus = 'active' | 'inactive';

export type CustomerPropertyType = 'residential' | 'commercial';

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
  /** Set when identifying fields were scrubbed in response to a deletion request. */
  personalDataErasedAt?: Date | null;
  /**
   * True once the customer has texted STOP (or another carrier opt-out keyword).
   *
   * This field did not exist. `communication.service.ts` wrote
   * `(customer as any).isOptedOut = true` and Mongoose — strict by default —
   * silently discarded it, so the opt-out never persisted and the guard in
   * `sendMessage` was always reading `undefined`. Texting STOP did nothing.
   */
  isOptedOut: boolean;
  /** When the opt-out was recorded. Kept as the compliance audit trail. */
  optedOutAt?: Date | null;
  /**
   * Residential or commercial.
   *
   * The UI has always collected this — a toggle in the customer form — and
   * displayed it in five places. It was never a field on this schema, so the
   * toggle's value was stripped on save and every one of those five places read
   * `undefined` and fell back to showing "Residential" for every customer.
   */
  propertyType?: CustomerPropertyType;
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
  /**
   * Surfaced so the UI can show that this customer cannot be texted, instead of
   * letting an operator compose a message that will be refused with a 409.
   */
  isOptedOut?: boolean;
  optedOutAt?: string | Date | null;
  propertyType?: CustomerPropertyType;
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
  propertyType?: CustomerPropertyType;
}

export interface CustomerQueryInput {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  tag?: string;
  propertyType?: string;
}

export interface PaginatedCustomers {
  customers: CustomerDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
