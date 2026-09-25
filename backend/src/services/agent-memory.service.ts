import { Types } from 'mongoose';
import { AgentMemory, IAgentMemory, MemoryCategory } from '../models/agent-memory.model';
import { Customer } from '../models/customer.model';
import { Appointment } from '../models/appointment.model';
import { CallLog } from '../models/call-log.model';
import { Equipment, EquipmentType, EquipmentLocation } from '../models/equipment.model';
import { EquipmentService, EquipmentInput } from './equipment.service';
import { ICustomerProperty } from '../types/customer.types';

/**
 * Turns a transcript fragment like "Carrier 4T heat pump" into a structured unit.
 *
 * Returns `null` rather than guessing when the type cannot be identified — an
 * `Equipment` row whose type is "other" and whose only real content is a brand name
 * is the unqueryable free-text problem with a schema wrapped round it.
 */
export const parseEquipmentMention = (fragment: string): EquipmentInput | null => {
  const text = fragment.toLowerCase();

  const typeByKeyword: Array<[RegExp, EquipmentType]> = [
    [/mini[\s-]?split/, 'mini_split'],
    [/package unit/, 'package_unit'],
    [/heat pump/, 'heat_pump'],
    [/furnace/, 'furnace'],
    [/boiler/, 'boiler'],
    [/air handler/, 'air_handler'],
    [/water heater/, 'water_heater'],
    [/thermostat/, 'thermostat'],
    // Last: "ac" is a substring of many words, so only reach it if nothing else matched.
    [/\bair conditioner\b|\bac\b/, 'air_conditioner'],
  ];

  const matchedType = typeByKeyword.find(([pattern]) => pattern.test(text))?.[1];
  if (!matchedType) return null;

  const brandMatch = text.match(
    /\b(carrier|trane|lennox|goodman|rheem|ruud|york|daikin|bosch|bryant|mitsubishi|fujitsu)\b/
  );

  return {
    type: matchedType,
    // Title-cased so it reads as a brand rather than a lowercased transcript token.
    brand: brandMatch ? brandMatch[1][0].toUpperCase() + brandMatch[1].slice(1) : undefined,
    source: 'ai_call',
  };
};

/** Maps the spoken location words the regex captures onto the enum. */
export const parseEquipmentLocation = (value: string): EquipmentLocation | null => {
  const map: Record<string, EquipmentLocation> = {
    attic: 'attic',
    basement: 'basement',
    'crawl space': 'crawl_space',
    roof: 'roof',
    'side yard': 'side_yard',
    garage: 'garage',
    closet: 'closet',
  };
  return map[value.trim().toLowerCase()] ?? null;
};

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
   * Rule-based extraction of key customer preferences and equipment from conversation text.
   *
   * Now writes to BOTH places, deliberately:
   *
   *  - The `AgentMemory` row stays, because it carries provenance — which call, what
   *    confidence, what the customer actually said. Dropping it would lose the audit
   *    trail for a value a regex guessed.
   *  - The structured field or `Equipment` row is what everything else reads. A gate
   *    code buried in the prose "Gate/entry code is 1234" is not queryable, and it is
   *    how the dispatch SMS came to print "Customer mentioned dogs/pets on the
   *    property" in the field labelled Access/Gate.
   *
   * Structured writes never overwrite a value a person entered — see
   * `applyPropertyFact` and `EquipmentService.upsertFromCall`.
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
      await this.applyPropertyFact(businessId, customerId, { gateCode: gateMatch[1] });
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
      await this.applyPropertyFact(businessId, customerId, {
        hasPets: true,
        petNotes: 'Mentioned a dog on the property during a call. Knock or call before entering the yard.',
      });
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

      const parsed = parseEquipmentMention(equipMatch[0]);
      if (parsed) {
        await EquipmentService.upsertFromCall(businessId, customerId, parsed);
      }
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

      const location = parseEquipmentLocation(locMatch[1]);
      if (location) {
        /**
         * Applied to the primary unit rather than creating a new one.
         *
         * "The unit is in the attic" names a location, not a unit. Creating an
         * `Equipment` row from it would leave a typeless record whose only content is
         * a location.
         */
        await this.applyLocationToPrimaryEquipment(businessId, customerId, location);
      }
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
   * Writes a property fact without clobbering what a person entered.
   *
   * A regex reading a transcript is a weaker source than an office manager typing
   * into a form. Only empty fields are filled, so a gate code the business corrected
   * by hand survives the customer misremembering it on the next call.
   */
  public static async applyPropertyFact(
    businessId: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    facts: Partial<ICustomerProperty>
  ): Promise<void> {
    try {
      const customer = await Customer.findOne({ _id: customerId, businessId }).select('property');
      if (!customer) return;

      const current = (customer.property ?? {}) as ICustomerProperty;
      const updates: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(facts)) {
        if (value === undefined || value === null || value === '') continue;
        const existing = (current as Record<string, unknown>)[key];
        // `hasPets: false` is a real answer, so `undefined` is the only empty state.
        if (existing !== undefined && existing !== null && existing !== '') continue;
        updates[`property.${key}`] = value;
      }

      if (!Object.keys(updates).length) return;

      await Customer.updateOne({ _id: customerId, businessId }, { $set: updates });
    } catch (err: any) {
      // Capture is best-effort; a failure must not break the call that produced it.
      console.warn('Could not apply property fact:', err?.message);
    }
  }

  /**
   * Records where the equipment lives, on the unit it most likely refers to.
   *
   * Prefers the primary unit, falls back to the only unit, and does nothing when
   * there are several and none is primary — guessing between a furnace in the
   * basement and an AC on the roof would be worse than leaving it unset.
   */
  private static async applyLocationToPrimaryEquipment(
    businessId: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    location: EquipmentLocation
  ): Promise<void> {
    try {
      const units = await Equipment.find({ businessId, customerId, active: true });
      if (!units.length) return;

      const target = units.find((u) => u.isPrimary) ?? (units.length === 1 ? units[0] : null);
      if (!target || target.location) return;

      target.location = location;
      await target.save();
    } catch (err: any) {
      console.warn('Could not apply equipment location:', err?.message);
    }
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

    /**
     * Structured fields first, and they replace rather than supplement the memory
     * rows they came from.
     *
     * The memory rows are prose a regex assembled — "Gate/entry code is 1234",
     * "Equipment located in attic". Feeding both to the model means the same fact
     * appears twice in different wordings, which is how an assistant ends up
     * repeating itself or reading out a stale value alongside the corrected one.
     */
    if (customer.propertyType) {
      lines.push(`- Property Type: ${customer.propertyType}`);
    }

    const property = (customer.property ?? {}) as ICustomerProperty;
    const propertyLines: string[] = [];

    if (property.gateCode) propertyLines.push(`Gate/entry code: ${property.gateCode}`);
    if (property.accessInstructions) propertyLines.push(`Access: ${property.accessInstructions}`);
    if (property.hasPets) {
      propertyLines.push(`Pets on site${property.petNotes ? `: ${property.petNotes}` : ''}`);
    }
    if (property.parkingNotes) propertyLines.push(`Parking: ${property.parkingNotes}`);
    if (property.propertyNotes) propertyLines.push(`Property: ${property.propertyNotes}`);

    if (propertyLines.length) {
      lines.push('- Access & Property Notes:');
      for (const line of propertyLines) lines.push(`  * ${line}`);
    }

    const equipment = await Equipment.find({ businessId: bId, customerId: cId, active: true }).sort({
      isPrimary: -1,
      installYear: -1,
    });

    if (equipment.length) {
      lines.push('- Equipment On File:');
      for (const unit of equipment) {
        const warranty = unit.warrantyExpiresAt
          ? unit.warrantyExpiresAt.getTime() > Date.now()
            ? ' [under warranty]'
            : ' [warranty expired]'
          : '';
        lines.push(
          `  * ${EquipmentService.describe(unit)}${unit.isPrimary ? ' (primary)' : ''}${warranty}${
            unit.filterSize ? `, filter ${unit.filterSize}` : ''
          }`
        );
      }
    }

    /**
     * Only the memories not now represented as structured data.
     *
     * The four extracted keys are excluded because they are the *source* of the
     * fields above. Everything else — unresolved issues, preferences a human noted —
     * still has nowhere structured to live and is passed through unchanged.
     */
    const supersededKeys = new Set([
      'access_code',
      'pets_on_property',
      'primary_equipment',
      'equipment_location',
    ]);
    const remainingMemories = memories.filter((m) => !supersededKeys.has(m.key));

    if (remainingMemories.length > 0) {
      lines.push('- Other Saved Facts:');
      for (const m of remainingMemories) {
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
