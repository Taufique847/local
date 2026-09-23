import { Customer } from '../models/customer.model';
import { 
  CustomerDTO, 
  ICustomer, 
  CustomerInput, 
  CustomerQueryInput, 
  PaginatedCustomers 
} from '../types/customer.types';
import { AppError } from '../types';

export class CustomerService {
  private static toDTO(customer: ICustomer): CustomerDTO {
    return {
      id: customer._id.toString(),
      businessId: customer.businessId.toString(),
      firstName: customer.firstName,
      lastName: customer.lastName,
      fullName: `${customer.firstName} ${customer.lastName}`.trim(),
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      notes: customer.notes,
      isOptedOut: Boolean(customer.isOptedOut),
      optedOutAt: customer.optedOutAt,
      propertyType: customer.propertyType,
      // Access and property facts, previously trapped in free-text memory rows.
      property: customer.property,
      status: customer.status,
      source: customer.source,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  // Create new customer for business
  public static async createCustomer(businessId: string, input: CustomerInput): Promise<CustomerDTO> {
    if (!input.firstName?.trim()) {
      throw new AppError('First name is required', 400);
    }
    if (!input.lastName?.trim()) {
      throw new AppError('Last name is required', 400);
    }
    if (!input.phone?.trim()) {
      throw new AppError('Phone number is required', 400);
    }

    const customer = await Customer.create({
      businessId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone.trim(),
      email: input.email ? input.email.trim().toLowerCase() : undefined,
      address: input.address,
      notes: input.notes?.trim(),
      status: input.status || 'active',
      source: input.source || 'manual',
      propertyType: input.propertyType,
      property: input.property,
    });

    return this.toDTO(customer);
  }

  // Get paginated customers for business with search & filter
  public static async getCustomers(
    businessId: string,
    queryInput: CustomerQueryInput
  ): Promise<PaginatedCustomers> {
    const page = Math.max(1, Number(queryInput.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(queryInput.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { businessId };

    // Status filter
    if (queryInput.status && ['active', 'inactive'].includes(queryInput.status)) {
      filter.status = queryInput.status;
    }

    /**
     * Property-type filter.
     *
     * The customers page has always sent this parameter. Nothing here read it, so
     * it was silently discarded and the dropdown appeared to do nothing.
     */
    if (
      queryInput.propertyType &&
      ['residential', 'commercial'].includes(queryInput.propertyType)
    ) {
      filter.propertyType = queryInput.propertyType;
    }

    // Search query (matches first name, last name, phone, or email)
    if (queryInput.search && queryInput.search.trim()) {
      const searchRegex = new RegExp(queryInput.search.trim(), 'i');
      filter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
      ];
    }

    const [customers, total] = await Promise.all([
      Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Customer.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      customers: customers.map((c) => this.toDTO(c)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  // Get single customer by ID (strictly isolated to businessId)
  public static async getCustomerById(businessId: string, customerId: string): Promise<CustomerDTO> {
    const customer = await Customer.findOne({ _id: customerId, businessId });
    if (!customer) {
      throw new AppError('Customer not found', 404);
    }
    return this.toDTO(customer);
  }

  // Update customer
  public static async updateCustomer(
    businessId: string,
    customerId: string,
    input: Partial<CustomerInput>
  ): Promise<CustomerDTO> {
    const customer = await Customer.findOne({ _id: customerId, businessId });
    if (!customer) {
      throw new AppError('Customer not found', 404);
    }

    if (input.firstName !== undefined) customer.firstName = input.firstName.trim();
    if (input.lastName !== undefined) customer.lastName = input.lastName.trim();
    if (input.phone !== undefined) customer.phone = input.phone.trim();
    if (input.email !== undefined) {
      customer.email = input.email ? input.email.trim().toLowerCase() : undefined;
    }
    if (input.address !== undefined) customer.address = { ...customer.address, ...input.address };
    if (input.notes !== undefined) customer.notes = input.notes.trim();
    if (input.status !== undefined) customer.status = input.status;
    if (input.propertyType !== undefined) customer.propertyType = input.propertyType;

    /**
     * Merged, not replaced, and field by field.
     *
     * A form that posts only `gateCode` must not wipe the pet notes someone else
     * recorded. An explicit empty string still clears a field, so a gate code that
     * changed can be removed — `undefined` means "not in this request" and `''` means
     * "delete it", and collapsing those two is how a partial update silently erases
     * data.
     */
    if (input.property !== undefined) {
      const merged = { ...((customer.property ?? {}) as Record<string, unknown>) };
      for (const [key, value] of Object.entries(input.property)) {
        if (value === undefined) continue;
        if (value === '') delete merged[key];
        else merged[key] = value;
      }
      customer.property = merged as any;
    }

    await customer.save();
    return this.toDTO(customer);
  }

  // Delete customer
  public static async deleteCustomer(businessId: string, customerId: string): Promise<void> {
    const result = await Customer.deleteOne({ _id: customerId, businessId });
    if (result.deletedCount === 0) {
      throw new AppError('Customer not found', 404);
    }
  }

  // Get statistics for dashboard overview
  public static async getCustomerStats(businessId: string): Promise<{ total: number; active: number }> {
    const [total, active] = await Promise.all([
      Customer.countDocuments({ businessId }),
      Customer.countDocuments({ businessId, status: 'active' }),
    ]);

    return { total, active };
  }
}
