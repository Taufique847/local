import { Types } from 'mongoose';
import { Lead } from '../models/lead.model';
import { Customer } from '../models/customer.model';
import { AppError } from '../types';
import { 
  ILead, 
  CreateLeadInput, 
  UpdateLeadInput, 
  LeadQueryFilter, 
  LeadStatus,
  LeadUrgency,
  ILeadActivity
} from '../types/lead.types';

export class LeadService {
  /**
   * Allowed state transitions for M12 Lead State Machine
   */
  private static readonly VALID_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
    new: ['contacted', 'qualified', 'unqualified', 'appointment_pending', 'lost', 'archived'],
    contacted: ['qualified', 'unqualified', 'appointment_pending', 'lost', 'archived'],
    qualified: ['appointment_pending', 'appointment_booked', 'quoted', 'won', 'lost', 'unqualified', 'archived'],
    unqualified: ['new', 'contacted', 'archived'],
    appointment_pending: ['appointment_booked', 'qualified', 'lost', 'archived'],
    appointment_booked: ['completed', 'appointment_pending', 'lost', 'archived'],
    quoted: ['won', 'lost', 'qualified', 'archived'],
    won: ['completed', 'archived'],
    completed: ['archived'],
    lost: ['new', 'contacted', 'archived'],
    archived: ['new', 'contacted'],
  };

  /**
   * Validates if transition from currentStatus to nextStatus is permissible.
   */
  public static isValidTransition(current: LeadStatus, next: LeadStatus): boolean {
    if (current === next) return true;
    const allowed = this.VALID_TRANSITIONS[current] || [];
    return allowed.includes(next);
  }

  // Create a new lead tied to an authenticated business and verified customer
  public static async createLead(
    businessId: string | Types.ObjectId,
    input: CreateLeadInput
  ): Promise<ILead> {
    if (!Types.ObjectId.isValid(input.customerId)) {
      throw new AppError('That customer id is not valid.', 400);
    }

    // Verify customer belongs to business
    const customer = await Customer.findOne({
      _id: input.customerId,
      businessId,
    });

    if (!customer) {
      throw new AppError('Customer not found for this business', 404);
    }

    const initialActivity: ILeadActivity = {
      type: 'status_change',
      description: `Lead created with initial status: ${input.status || 'new'}`,
      createdAt: new Date(),
      createdBy: 'system',
      metadata: { source: input.source || 'manual' },
    };

    const lead = await Lead.create({
      businessId,
      customerId: input.customerId,
      title: input.title.trim(),
      description: input.description?.trim(),
      service: input.service?.trim(),
      serviceType: input.serviceType?.trim(),
      serviceAddress: input.serviceAddress?.trim() || customer.address,
      status: input.status || 'new',
      priority: input.priority || 'medium',
      urgency: input.urgency || 'medium',
      source: input.source || 'manual',
      estimatedValue: input.estimatedValue !== undefined ? Number(input.estimatedValue) : undefined,
      notes: input.notes?.trim(),
      aiIntent: input.aiIntent?.trim(),
      aiConfidence: input.aiConfidence,
      appointmentId: input.appointmentId,
      activities: [initialActivity],
    });

    return await lead.populate('customerId', 'firstName lastName phone email address');
  }

  /**
   * Finds recent active lead for customer (<48h) or creates a new one (duplicate avoidance for AI calls).
   */
  public static async findOrCreateFromCall(
    businessId: string | Types.ObjectId,
    customerId: string,
    data: {
      title: string;
      description?: string;
      serviceType?: string;
      urgency?: LeadUrgency;
      serviceAddress?: string;
      callSid?: string;
    }
  ): Promise<{ lead: ILead; isNew: boolean }> {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const existingLead = await Lead.findOne({
      businessId,
      customerId,
      createdAt: { $gte: twoDaysAgo },
      status: { $in: ['new', 'contacted', 'qualified', 'appointment_pending'] },
    }).sort({ createdAt: -1 });

    if (existingLead) {
      existingLead.activities.push({
        type: 'call_linked',
        description: `Follow-up call linked: ${data.description || 'Customer called again'}`,
        createdAt: new Date(),
        createdBy: 'ai_receptionist',
        metadata: { callSid: data.callSid },
      });
      if (data.urgency && data.urgency === 'emergency') {
        existingLead.urgency = 'emergency';
        existingLead.priority = 'urgent';
      }
      if (data.serviceType && !existingLead.serviceType) {
        existingLead.serviceType = data.serviceType;
      }
      await existingLead.save();
      return { lead: existingLead, isNew: false };
    }

    const newLead = await this.createLead(businessId, {
      customerId,
      title: data.title,
      description: data.description,
      serviceType: data.serviceType,
      serviceAddress: data.serviceAddress,
      urgency: data.urgency || 'medium',
      priority: data.urgency === 'emergency' ? 'urgent' : 'medium',
      source: 'ai_call',
      status: 'qualified',
      aiIntent: data.title,
      aiConfidence: 0.95,
    });

    return { lead: newLead, isNew: true };
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

    if (query.urgency && query.urgency !== 'all') {
      filter.urgency = query.urgency;
    }

    if (query.source && query.source !== 'all') {
      filter.source = query.source;
    }

    if (query.customerId && Types.ObjectId.isValid(query.customerId)) {
      filter.customerId = query.customerId;
    }

    if (query.search && query.search.trim()) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
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
        { serviceType: searchRegex },
        { notes: searchRegex },
        { customerId: { $in: customerIds } },
      ];
    }

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .populate('customerId', 'firstName lastName phone email address')
        .populate('appointmentId', 'startAt endAt status')
        .sort({ [sortField]: sortOrder })
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
    })
      .populate('customerId', 'firstName lastName phone email address propertyType notes')
      .populate('appointmentId', 'startAt endAt status');
  }

  // Update lead details
  public static async updateLead(
    businessId: string | Types.ObjectId,
    leadId: string,
    input: UpdateLeadInput
  ): Promise<ILead | null> {
    if (!Types.ObjectId.isValid(leadId)) return null;

    const updateData: Record<string, any> = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description.trim();
    if (input.service !== undefined) updateData.service = input.service.trim();
    if (input.serviceType !== undefined) updateData.serviceType = input.serviceType.trim();
    if (input.serviceAddress !== undefined) updateData.serviceAddress = input.serviceAddress.trim();
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.urgency !== undefined) updateData.urgency = input.urgency;
    if (input.source !== undefined) updateData.source = input.source;
    if (input.estimatedValue !== undefined) {
      updateData.estimatedValue = input.estimatedValue !== null ? Number(input.estimatedValue) : undefined;
    }
    if (input.notes !== undefined) updateData.notes = input.notes.trim();
    if (input.appointmentId !== undefined) updateData.appointmentId = input.appointmentId;
    if (input.aiIntent !== undefined) updateData.aiIntent = input.aiIntent;
    if (input.aiConfidence !== undefined) updateData.aiConfidence = input.aiConfidence;

    return await Lead.findOneAndUpdate(
      { _id: leadId, businessId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('customerId', 'firstName lastName phone email address propertyType notes');
  }

  // Update lead status with State Machine validation
  public static async updateLeadStatus(
    businessId: string | Types.ObjectId,
    leadId: string,
    status: LeadStatus,
    reason?: string,
    actor: string = 'user'
  ): Promise<ILead> {
    if (!Types.ObjectId.isValid(leadId)) {
      throw new AppError('That lead id is not valid.', 400);
    }

    const lead = await Lead.findOne({ _id: leadId, businessId });
    if (!lead) {
      throw new AppError('Lead not found', 404);
    }

    if (!this.isValidTransition(lead.status, status)) {
      // 409: the request is well formed, it just conflicts with the lead's
      // current state. Previously a 500.
      throw new AppError(
        `A lead cannot move from "${lead.status}" to "${status}".`,
        409
      );
    }

    const previousStatus = lead.status;
    lead.status = status;
    lead.activities.push({
      type: 'status_change',
      description: `Status changed from ${previousStatus} to ${status}${reason ? `: ${reason}` : ''}`,
      createdAt: new Date(),
      createdBy: actor,
      metadata: { previousStatus, nextStatus: status, reason },
    });

    await lead.save();
    return await lead.populate('customerId', 'firstName lastName phone email address');
  }

  // Add an activity record to a lead
  public static async addActivity(
    businessId: string | Types.ObjectId,
    leadId: string,
    activity: {
      type: ILeadActivity['type'];
      description: string;
      createdBy?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<ILead> {
    if (!Types.ObjectId.isValid(leadId)) {
      throw new AppError('That lead id is not valid.', 400);
    }

    const lead = await Lead.findOne({ _id: leadId, businessId });
    if (!lead) {
      throw new AppError('Lead not found', 404);
    }

    lead.activities.push({
      type: activity.type,
      description: activity.description,
      createdAt: new Date(),
      createdBy: activity.createdBy || 'system',
      metadata: activity.metadata,
    });

    await lead.save();
    return lead;
  }

  // Qualify lead with urgency and service categorization
  public static async qualifyLead(
    businessId: string | Types.ObjectId,
    leadId: string,
    qualification: {
      serviceType: string;
      urgency: LeadUrgency;
      estimatedValue?: number;
      notes?: string;
    }
  ): Promise<ILead> {
    const lead = await Lead.findOne({ _id: leadId, businessId });
    if (!lead) throw new AppError('Lead not found', 404);

    lead.status = 'qualified';
    lead.serviceType = qualification.serviceType;
    lead.urgency = qualification.urgency;
    if (qualification.urgency === 'emergency') {
      lead.priority = 'urgent';
    }
    if (qualification.estimatedValue) {
      lead.estimatedValue = qualification.estimatedValue;
    }
    if (qualification.notes) {
      lead.notes = qualification.notes;
    }

    lead.activities.push({
      type: 'note',
      description: `Lead qualified as ${qualification.serviceType} (Urgency: ${qualification.urgency})`,
      createdAt: new Date(),
      createdBy: 'lead_engine',
      metadata: qualification,
    });

    await lead.save();
    return await lead.populate('customerId', 'firstName lastName phone email address');
  }

  // Associate appointment with lead and advance state
  public static async convertToAppointment(
    businessId: string | Types.ObjectId,
    leadId: string,
    appointmentId: string
  ): Promise<ILead> {
    const lead = await Lead.findOne({ _id: leadId, businessId });
    if (!lead) throw new AppError('Lead not found', 404);

    lead.appointmentId = new Types.ObjectId(appointmentId);
    lead.status = 'appointment_booked';
    lead.activities.push({
      type: 'appointment_scheduled',
      description: `Appointment successfully booked (ID: ${appointmentId})`,
      createdAt: new Date(),
      createdBy: 'scheduling_engine',
      metadata: { appointmentId },
    });

    await lead.save();
    return lead;
  }

  // Archive lead (soft delete)
  public static async archiveLead(
    businessId: string | Types.ObjectId,
    leadId: string
  ): Promise<ILead | null> {
    return await this.updateLeadStatus(businessId, leadId, 'archived', 'Archived by user');
  }

  // Get lead statistics for dashboard and pipeline overview
  public static async getLeadStats(
    businessId: string | Types.ObjectId
  ): Promise<{
    total: number;
    active: number;
    byStatus: Record<LeadStatus, number>;
    byUrgency: Record<LeadUrgency, number>;
  }> {
    const counts = await Lead.aggregate([
      { $match: { businessId: new Types.ObjectId(businessId.toString()) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const urgencyCounts = await Lead.aggregate([
      { $match: { businessId: new Types.ObjectId(businessId.toString()) } },
      { $group: { _id: '$urgency', count: { $sum: 1 } } },
    ]);

    const byStatus: Record<LeadStatus, number> = {
      new: 0,
      contacted: 0,
      qualified: 0,
      unqualified: 0,
      appointment_pending: 0,
      appointment_booked: 0,
      quoted: 0,
      won: 0,
      completed: 0,
      lost: 0,
      archived: 0,
    };

    const byUrgency: Record<LeadUrgency, number> = {
      low: 0,
      medium: 0,
      high: 0,
      emergency: 0,
    };

    let total = 0;
    let active = 0;

    for (const item of counts) {
      const st = item._id as LeadStatus;
      if (byStatus[st] !== undefined) {
        byStatus[st] = item.count;
      }
      total += item.count;
      if (['new', 'contacted', 'qualified', 'appointment_pending', 'quoted'].includes(st)) {
        active += item.count;
      }
    }

    for (const item of urgencyCounts) {
      const urg = item._id as LeadUrgency;
      if (byUrgency[urg] !== undefined) {
        byUrgency[urg] = item.count;
      }
    }

    return { total, active, byStatus, byUrgency };
  }
}
