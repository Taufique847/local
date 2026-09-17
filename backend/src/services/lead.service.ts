import { Types } from 'mongoose';
import { Lead } from '../models/lead.model';
import { Customer } from '../models/customer.model';
import { 
  ILead, 
  CreateLeadInput, 
  UpdateLeadInput, 
  LeadQueryFilter, 
  LeadStatus 
} from '../types/lead.types';

export class LeadService {
  // Create a new lead tied to an authenticated business and verified customer
  public static async createLead(
    businessId: string | Types.ObjectId,
    input: CreateLeadInput
  ): Promise<ILead> {
    if (!Types.ObjectId.isValid(input.customerId)) {
      throw new Error('Invalid customer ID format');
    }

    // Verify the customer belongs to the authenticated business
    const customer = await Customer.findOne({
      _id: input.customerId,
      businessId,
    });

    if (!customer) {
      throw new Error('Customer does not exist or does not belong to your business');
    }

    const lead = await Lead.create({
      businessId,
      customerId: input.customerId,
      title: input.title.trim(),
      description: input.description?.trim(),
      service: input.service?.trim(),
      status: input.status || 'new',
      priority: input.priority || 'medium',
      source: input.source || 'manual',
      estimatedValue: input.estimatedValue !== undefined ? Number(input.estimatedValue) : undefined,
      notes: input.notes?.trim(),
    });

    return await lead.populate('customerId', 'firstName lastName phone email address');
  }

  // Get paginated leads with search and filter
  public static async getLeads(
    businessId: string | Types.ObjectId,
    query: LeadQueryFilter
  ): Promise<{
    leads: ILead[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { businessId };

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.priority && query.priority !== 'all') {
      filter.priority = query.priority;
    }

    if (query.source && query.source !== 'all') {
      filter.source = query.source;
    }

    if (query.customerId && Types.ObjectId.isValid(query.customerId)) {
      filter.customerId = query.customerId;
    }

    // Handle search across lead title, description, service, or customer name
    if (query.search && query.search.trim()) {
      const searchRegex = new RegExp(query.search.trim(), 'i');

      // Find matching customers first
      const matchingCustomers = await Customer.find({
        businessId,
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { phone: searchRegex },
          { email: searchRegex },
        ],
      }).select('_id');

      const customerIds = matchingCustomers.map((c) => c._id);

      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { service: searchRegex },
        { notes: searchRegex },
        { customerId: { $in: customerIds } },
      ];
    }

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .populate('customerId', 'firstName lastName phone email address')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Lead.countDocuments(filter),
    ]);

    return {
      leads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // Get single lead by ID
  public static async getLeadById(
    businessId: string | Types.ObjectId,
    leadId: string
  ): Promise<ILead | null> {
    if (!Types.ObjectId.isValid(leadId)) return null;

    return await Lead.findOne({
      _id: leadId,
      businessId,
    }).populate('customerId', 'firstName lastName phone email address propertyType notes');
  }

  // Update lead details
  public static async updateLead(
    businessId: string | Types.ObjectId,
    leadId: string,
    input: UpdateLeadInput
  ): Promise<ILead | null> {
    if (!Types.ObjectId.isValid(leadId)) return null;

    // If changing customer, verify the new customer belongs to the business
    if (input.customerId) {
      if (!Types.ObjectId.isValid(input.customerId)) {
        throw new Error('Invalid customer ID format');
      }
      const customerExists = await Customer.findOne({
        _id: input.customerId,
        businessId,
      });
      if (!customerExists) {
        throw new Error('Customer does not belong to your business');
      }
    }

    const updateData: Record<string, any> = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description.trim();
    if (input.service !== undefined) updateData.service = input.service.trim();
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.source !== undefined) updateData.source = input.source;
    if (input.estimatedValue !== undefined) {
      updateData.estimatedValue = input.estimatedValue !== null ? Number(input.estimatedValue) : undefined;
    }
    if (input.notes !== undefined) updateData.notes = input.notes.trim();
    if (input.customerId !== undefined) updateData.customerId = input.customerId;

    return await Lead.findOneAndUpdate(
      { _id: leadId, businessId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('customerId', 'firstName lastName phone email address propertyType notes');
  }

  // Update lead status
  public static async updateLeadStatus(
    businessId: string | Types.ObjectId,
    leadId: string,
    status: LeadStatus
  ): Promise<ILead | null> {
    if (!Types.ObjectId.isValid(leadId)) return null;

    const validStatuses: LeadStatus[] = [
      'new',
      'contacted',
      'qualified',
      'quoted',
      'won',
      'lost',
      'archived',
    ];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status "${status}". Allowed: ${validStatuses.join(', ')}`);
    }

    return await Lead.findOneAndUpdate(
      { _id: leadId, businessId },
      { $set: { status } },
      { new: true, runValidators: true }
    ).populate('customerId', 'firstName lastName phone email address propertyType notes');
  }

  // Archive lead (soft delete)
  public static async archiveLead(
    businessId: string | Types.ObjectId,
    leadId: string
  ): Promise<ILead | null> {
    return await this.updateLeadStatus(businessId, leadId, 'archived');
  }

  // Get lead statistics for dashboard and pipeline overview
  public static async getLeadStats(
    businessId: string | Types.ObjectId
  ): Promise<{
    total: number;
    active: number;
    byStatus: Record<LeadStatus, number>;
  }> {
    const counts = await Lead.aggregate([
      { $match: { businessId: new Types.ObjectId(businessId.toString()) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const byStatus: Record<LeadStatus, number> = {
      new: 0,
      contacted: 0,
      qualified: 0,
      quoted: 0,
      won: 0,
      lost: 0,
      archived: 0,
    };

    let total = 0;
    let active = 0;

    for (const item of counts) {
      const st = item._id as LeadStatus;
      if (byStatus[st] !== undefined) {
        byStatus[st] = item.count;
      }
      total += item.count;
      // Active leads: new, contacted, qualified, quoted
      if (['new', 'contacted', 'qualified', 'quoted'].includes(st)) {
        active += item.count;
      }
    }

    return { total, active, byStatus };
  }
}
