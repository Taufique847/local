import { Customer } from '../models/customer.model';
import { 
  CustomerDTO, 
  ICustomer, 
  CustomerInput, 
  CustomerQueryInput, 
  PaginatedCustomers 
} from '../types/customer.types';
import { AppError } from '../types';
import { buildCustomerQuery, sanitiseCustomerFilter } from './customer-filter';
import { encryptField, decryptField } from '../utils/crypto';

/**
 * Tags, normalised the same way everywhere.
 *
 * Upper-cased and deduplicated because tags are matched exactly by the segment
 * filter — `$in: ['VIP']` will not find a customer tagged `vip`, so two spellings of
 * one tag means a segment that silently misses half its audience. The 360 drawer
 * already upper-cases on input; this makes it true of every write path.
 */
const normaliseTags = (tags: string[] | undefined): string[] => {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const clean = String(tag).trim().toUpperCase().slice(0, 40);
    if (clean) seen.add(clean);
  }
  return [...seen].slice(0, 20);
};

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
      /**
       * Tags, lifetime value and last service date were all absent from this DTO.
       *
       * `tags` in particular is the whole basis of segmentation: the field was
       * indexed, editable in the 360 drawer and returned by nothing, so the list API
       * could not show a tag and the two tag dropdowns on the customers page had no
       * data to filter against.
       */
      tags: customer.tags ?? [],
      lifetimeValue: customer.lifetimeValue ?? 0,
      lastServiceAt: customer.lastServiceAt ?? null,
      isOptedOut: Boolean(customer.isOptedOut),
      optedOutAt: customer.optedOutAt,
      // The other consent, under the other law. Surfaced so the UI can show why a
      // customer is excluded from an email campaign audience.
      emailOptedOut: Boolean(customer.emailOptedOut),
      emailOptedOutAt: customer.emailOptedOutAt,
      marketingConsentGiven: Boolean(customer.marketingConsentGiven),
      marketingConsentTimestamp: customer.marketingConsentTimestamp ?? null,
      propertyType: customer.propertyType,
      // Access and property facts, decrypted for client view
      property: customer.property
        ? {
            ...customer.property,
            gateCode: decryptField(customer.property.gateCode),
          }
        : undefined,
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

    const property = input.property ? { ...input.property } : undefined;
    if (property?.gateCode && typeof property.gateCode === 'string') {
      property.gateCode = encryptField(property.gateCode);
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
      property,
      marketingConsentGiven: Boolean(input.marketingConsentGiven),
      marketingConsentTimestamp: input.marketingConsentGiven ? new Date() : null,
      // Accepted by the validation schema and then dropped here, so a customer
      // created with tags came back without them.
      tags: normaliseTags(input.tags),
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

    /**
     * Built by the shared filter builder, not assembled here.
     *
     * The ad-hoc list, a saved segment's live count and a campaign's audience must
     * resolve to the identical query — otherwise a segment reading "42 customers"
     * sends to 39, and nobody can tell which number was wrong.
     *
     * This also fixed an unescaped regex: the search term went straight into
     * `new RegExp(...)`, so searching for "(" threw and returned a 500.
     */
    const filter = await buildCustomerQuery(businessId, sanitiseCustomerFilter(queryInput));

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
    // Writable here as well as through the dedicated tags endpoint. The general
    // update accepted `tags` in its schema and then never applied them.
    if (input.tags !== undefined) customer.tags = normaliseTags(input.tags);

    if (input.marketingConsentGiven !== undefined) {
      customer.marketingConsentGiven = Boolean(input.marketingConsentGiven);
      customer.marketingConsentTimestamp = input.marketingConsentGiven ? new Date() : null;
    }

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
        else if (key === 'gateCode' && typeof value === 'string') {
          merged[key] = encryptField(value);
        } else {
          merged[key] = value;
        }
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
