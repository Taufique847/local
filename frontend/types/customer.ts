export type CustomerStatus = 'active' | 'inactive';

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

/**
 * Structured access and property facts.
 *
 * Every one of these was previously prose inside an `AgentMemory` value, which is
 * how the technician dispatch text came to print "Customer mentioned dogs/pets on
 * the property" in the field labelled Access/Gate.
 */
export interface CustomerProperty {
  /** Gate, lockbox or keypad code. Only ever shown to staff and the assigned tech. */
  gateCode?: string;
  accessInstructions?: string;
  /** Tri-state: `undefined` means nobody has asked, which is not "no pets". */
  hasPets?: boolean;
  petNotes?: string;
  parkingNotes?: string;
  propertyNotes?: string;
}

export type EquipmentType =
  | 'furnace'
  | 'air_conditioner'
  | 'heat_pump'
  | 'mini_split'
  | 'package_unit'
  | 'boiler'
  | 'air_handler'
  | 'water_heater'
  | 'thermostat'
  | 'other';

export type EquipmentLocation =
  | 'attic'
  | 'basement'
  | 'crawl_space'
  | 'garage'
  | 'roof'
  | 'closet'
  | 'side_yard'
  | 'utility_room'
  | 'exterior'
  | 'other';

export interface Equipment {
  _id: string;
  customerId: string;
  type: EquipmentType;
  brand?: string;
  /** Named `modelNumber`, not `model`, to avoid colliding with Mongoose's own. */
  modelNumber?: string;
  serialNumber?: string;
  installYear?: number;
  filterSize?: string;
  location?: EquipmentLocation;
  locationNotes?: string;
  warrantyExpiresAt?: string | null;
  notes?: string;
  isPrimary: boolean;
  active: boolean;
  /** 'manual', 'ai_call' or 'migrated_from_memory'. Shows how reliable it is. */
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export type EquipmentInput = Partial<Omit<Equipment, '_id' | 'customerId' | 'createdAt' | 'updatedAt' | 'type'>> & {
  type: EquipmentType;
};

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
  property?: CustomerProperty;
  /**
   * Upper-cased and deduplicated server-side, because segment filters match them
   * exactly — two spellings of one tag would mean a segment silently missing half its
   * audience.
   *
   * The list API omitted these from its response entirely until segments were built,
   * which is why the customers page had tag dropdowns with nothing to filter on.
   */
  tags?: string[];
  /** Total payments received. Maintained on the payment path. */
  lifetimeValue?: number;
  /** When work was last completed. Null when never serviced. */
  lastServiceAt?: string | null;
  /** True once the customer has texted STOP. They cannot be sent SMS. */
  isOptedOut?: boolean;
  optedOutAt?: string | null;
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
  /**
   * Sent as a partial object. The server merges it field by field, so a form that
   * posts only `gateCode` will not erase pet notes someone else recorded. An explicit
   * empty string clears a field.
   */
  property?: CustomerProperty;
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
