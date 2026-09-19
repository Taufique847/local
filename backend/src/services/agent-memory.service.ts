import { Types } from 'mongoose';
import { AgentMemory, IAgentMemory, MemoryCategory } from '../models/agent-memory.model';
import { Customer } from '../models/customer.model';
import { Appointment } from '../models/appointment.model';
import { CallLog } from '../models/call-log.model';

export interface StoreMemoryDTO {
  businessId: Types.ObjectId | string;
  customerId: Types.ObjectId | string;
  category: MemoryCategory;
  key: string;
  value: string;
  confidence?: number;
  sourceCallSid?: string;
  expiresAt?: Date;
}

export class AgentMemoryService {
  /**
   * Stores or updates a specific customer memory record
   */
  public static async storeMemory(data: StoreMemoryDTO): Promise<IAgentMemory> {
    const memory = await AgentMemory.findOneAndUpdate(
      {
        businessId: new Types.ObjectId(data.businessId.toString()),
        customerId: new Types.ObjectId(data.customerId.toString()),
        key: data.key.trim().toLowerCase(),
      },
      {
        $set: {
          category: data.category,
          value: data.value.trim(),
          confidence: data.confidence ?? 1.0,
          sourceCallSid: data.sourceCallSid,
          expiresAt: data.expiresAt,
        },
      },
      { new: true, upsert: true, runValidators: true }
    );
    return memory;
  }

  /**
   * Lists active memories for a customer
   */
  public static async getMemoriesForCustomer(
    businessId: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    category?: MemoryCategory
  ): Promise<IAgentMemory[]> {
    const query: any = {
      businessId: new Types.ObjectId(businessId.toString()),
      customerId: new Types.ObjectId(customerId.toString()),
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    };

    if (category) {
      query.category = category;
    }

    return AgentMemory.find(query).sort({ updatedAt: -1 });
  }

  /**
   * Deletes a specific memory entry
   */
  public static async deleteMemory(
    businessId: Types.ObjectId | string,
    memoryId: Types.ObjectId | string
  ): Promise<boolean> {
    const result = await AgentMemory.deleteOne({
      _id: new Types.ObjectId(memoryId.toString()),
      businessId: new Types.ObjectId(businessId.toString()),
    });
    return result.deletedCount > 0;
  }

  /**
   * Rule-based extraction of key customer preferences and equipment from conversation text
   */
  public static async extractMemoriesFromTranscript(
    businessId: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    transcriptText: string,
    callSid?: string
  ): Promise<IAgentMemory[]> {
    const memories: IAgentMemory[] = [];
    const text = transcriptText.toLowerCase();

    // 1. Gate / Access Code
    const gateMatch = transcriptText.match(/(?:gate|door|entry|lockbox)\s+(?:code|combo)\s+(?:is\s+)?([#*]?\d{3,6})/i);
    if (gateMatch && gateMatch[1]) {
      const mem = await this.storeMemory({
        businessId,
        customerId,
        category: 'instruction',
        key: 'access_code',
        value: `Gate/entry code is ${gateMatch[1]}`,
        sourceCallSid: callSid,
      });
      memories.push(mem);
    }

    // 2. Pets / Dogs Warning
    if (/(?:dog|dogs|puppy|pitbull|mastiff|shepherd|barking)\b/i.test(text)) {
      const mem = await this.storeMemory({
        businessId,
        customerId,
        category: 'instruction',
        key: 'pets_on_property',
        value: 'Customer mentioned dogs/pets on the property; knock or call prior to entering yard',
        sourceCallSid: callSid,
      });
      memories.push(mem);
    }

    // 3. HVAC Equipment Mentions
    const equipMatch = text.match(/(carrier|trane|lennox|goodman|rheem|ruud|york|daikin|bosch|bryant|mitsubishi|fujitsu)\s+([a-z0-9\- ]+)?(?:heat pump|ac|air conditioner|furnace|mini split|package unit)/i);
    if (equipMatch) {
      const mem = await this.storeMemory({
        businessId,
        customerId,
        category: 'equipment',
        key: 'primary_equipment',
        value: equipMatch[0].trim(),
        sourceCallSid: callSid,
      });
      memories.push(mem);
    }

    // 4. Equipment Location
    const locMatch = text.match(/(?:unit|furnace|handler|condenser)\s+(?:is\s+)?(?:in\s+the|on\s+the)\s+(attic|crawl space|basement|roof|side yard|garage|closet)/i);
    if (locMatch && locMatch[1]) {
      const mem = await this.storeMemory({
        businessId,
        customerId,
        category: 'equipment',
        key: 'equipment_location',
        value: `Equipment located in ${locMatch[1]}`,
        sourceCallSid: callSid,
      });
      memories.push(mem);
    }

    // 5. Unresolved issues or follow-up mentions
    if (/(?:still not working|callback|didn't fix it|came back|second time calling|warranty claim)/i.test(text)) {
      const mem = await this.storeMemory({
        businessId,
        customerId,
        category: 'unresolved_issue',
        key: 'recurring_issue',
        value: 'Customer indicated recurring or unresolved problem requiring priority attention',
        sourceCallSid: callSid,
      });
      memories.push(mem);
    }

    return memories;
  }

  /**
   * Assembles a unified customer context block for AI prompt injection
   */
  public static async assembleCustomerContext(
    businessId: Types.ObjectId | string,
    customerIdOrPhone: string
  ): Promise<{
    customer: any | null;
    memories: IAgentMemory[];
    formattedContext: string;
  }> {
    let customer = null;
    const bId = new Types.ObjectId(businessId.toString());

    if (Types.ObjectId.isValid(customerIdOrPhone) && customerIdOrPhone.length === 24) {
      customer = await Customer.findOne({ _id: new Types.ObjectId(customerIdOrPhone), businessId: bId });
    } else {
      customer = await Customer.findOne({ phone: customerIdOrPhone, businessId: bId });
    }

    if (!customer) {
      return {
        customer: null,
        memories: [],
        formattedContext: 'CALLER STATUS: New Caller (No prior CRM records found). Greet professionally and gather their name and service address.',
      };
    }

    const cId = customer._id;
    const memories = await this.getMemoriesForCustomer(bId, cId);

    // Fetch recent 2 appointments
    const recentAppointments = await Appointment.find({ businessId: bId, customerId: cId })
      .sort({ startAt: -1 })
      .limit(2);

    // Fetch recent 2 calls
    const recentCalls = await CallLog.find({ businessId: bId, customerId: cId })
      .sort({ createdAt: -1 })
      .limit(2);

    // Build formatted string
    const lines: string[] = [];
    lines.push('CUSTOMER RELATIONSHIP MEMORY (RETURNING CALLER):');
    lines.push(`- Name: ${customer.firstName} ${customer.lastName}`);
    lines.push(`- Phone: ${customer.phone}`);
    if (customer.tags && customer.tags.length > 0) {
      lines.push(`- Customer Tags: ${customer.tags.join(', ')}`);
    }
    if (customer.lifetimeValue) {
      lines.push(`- Lifetime Value: $${customer.lifetimeValue}`);
    }

    if (memories.length > 0) {
      lines.push('- Saved Facts & Equipment Context:');
      for (const m of memories) {
        lines.push(`  * [${m.category.toUpperCase()}]: ${m.value}`);
      }
    }

    if (recentAppointments.length > 0) {
      lines.push('- Recent Appointments:');
      for (const apt of recentAppointments) {
        const dateStr = new Date(apt.startAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        lines.push(`  * ${dateStr}: ${apt.title || 'HVAC Service'} (Status: ${apt.status})`);
      }
    }

    if (recentCalls.length > 0) {
      lines.push('- Recent Call History:');
      for (const cl of recentCalls) {
        const dateStr = new Date(cl.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        lines.push(`  * ${dateStr}: Outcome was "${cl.outcome || 'completed'}"`);
      }
    }

    lines.push('INSTRUCTION: Acknowledge that you see they are a returning customer if relevant, and reference their known equipment or preferences naturally to deliver a VIP experience.');

    return {
      customer,
      memories,
      formattedContext: lines.join('\n'),
    };
  }
}
