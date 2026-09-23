import { Types } from 'mongoose';
import {
  Equipment,
  IEquipment,
  EquipmentType,
  EquipmentLocation,
  EQUIPMENT_TYPES,
  EQUIPMENT_LOCATIONS,
} from '../models/equipment.model';
import { Customer } from '../models/customer.model';
import { AppError } from '../types';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'equipment' });

export interface EquipmentInput {
  type: EquipmentType;
  brand?: string;
  modelNumber?: string;
  serialNumber?: string;
  installYear?: number;
  filterSize?: string;
  location?: EquipmentLocation;
  locationNotes?: string;
  warrantyExpiresAt?: string | Date | null;
  notes?: string;
  isPrimary?: boolean;
  active?: boolean;
  source?: string;
}

/** Human labels, used in the voice prompt and the dispatch SMS. */
export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  furnace: 'Furnace',
  air_conditioner: 'Air conditioner',
  heat_pump: 'Heat pump',
  mini_split: 'Mini split',
  package_unit: 'Package unit',
  boiler: 'Boiler',
  air_handler: 'Air handler',
  water_heater: 'Water heater',
  thermostat: 'Thermostat',
  other: 'Equipment',
};

export const EQUIPMENT_LOCATION_LABELS: Record<EquipmentLocation, string> = {
  attic: 'attic',
  basement: 'basement',
  crawl_space: 'crawl space',
  garage: 'garage',
  roof: 'roof',
  closet: 'closet',
  side_yard: 'side yard',
  utility_room: 'utility room',
  exterior: 'outside',
  other: 'on site',
};

export class EquipmentService {
  /**
   * Confirms the customer belongs to this business before anything is written
   * against them.
   *
   * Equipment carries its own `businessId`, so a missing check here would let one
   * tenant attach a unit to another tenant's customer and have every subsequent
   * tenant-scoped read look perfectly consistent.
   */
  private static async assertCustomer(
    businessId: Types.ObjectId | string,
    customerId: string
  ): Promise<void> {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppError('Customer not found', 404);
    }
    const exists = await Customer.exists({ _id: customerId, businessId });
    if (!exists) throw new AppError('Customer not found', 404);
  }

  public static async listForCustomer(
    businessId: Types.ObjectId | string,
    customerId: string,
    options: { includeInactive?: boolean } = {}
  ): Promise<IEquipment[]> {
    await this.assertCustomer(businessId, customerId);

    const query: any = { businessId, customerId };
    if (!options.includeInactive) query.active = true;

    // Primary first, then newest install. A technician scanning this wants the unit
    // the job is probably about at the top.
    return Equipment.find(query).sort({ isPrimary: -1, installYear: -1, createdAt: -1 });
  }

  public static async create(
    businessId: Types.ObjectId | string,
    customerId: string,
    input: EquipmentInput
  ): Promise<IEquipment> {
    await this.assertCustomer(businessId, customerId);

    const created = await Equipment.create({
      businessId,
      customerId,
      ...this.sanitise(input),
    });

    // Enforced after the write, so the new row is included in the demotion.
    if (created.isPrimary) {
      await this.demoteOtherPrimaries(businessId, customerId, created._id);
    }

    return created;
  }

  public static async update(
    businessId: Types.ObjectId | string,
    equipmentId: string,
    input: Partial<EquipmentInput>
  ): Promise<IEquipment> {
    if (!Types.ObjectId.isValid(equipmentId)) {
      throw new AppError('Equipment not found', 404);
    }

    const equipment = await Equipment.findOne({ _id: equipmentId, businessId });
    if (!equipment) throw new AppError('Equipment not found', 404);

    Object.assign(equipment, this.sanitise(input));
    await equipment.save();

    if (equipment.isPrimary) {
      await this.demoteOtherPrimaries(businessId, String(equipment.customerId), equipment._id);
    }

    return equipment;
  }

  /**
   * Retires a unit rather than deleting it.
   *
   * A replaced unit is exactly what a technician wants to see when the new one
   * fails, and the service history references it. Hard deletion is offered
   * separately for a row created in error.
   */
  public static async retire(
    businessId: Types.ObjectId | string,
    equipmentId: string
  ): Promise<IEquipment> {
    if (!Types.ObjectId.isValid(equipmentId)) {
      throw new AppError('Equipment not found', 404);
    }

    const equipment = await Equipment.findOneAndUpdate(
      { _id: equipmentId, businessId },
      { $set: { active: false, isPrimary: false } },
      { new: true }
    );

    if (!equipment) throw new AppError('Equipment not found', 404);
    return equipment;
  }

  public static async remove(
    businessId: Types.ObjectId | string,
    equipmentId: string
  ): Promise<void> {
    if (!Types.ObjectId.isValid(equipmentId)) {
      throw new AppError('Equipment not found', 404);
    }
    const result = await Equipment.deleteOne({ _id: equipmentId, businessId });
    if (!result.deletedCount) throw new AppError('Equipment not found', 404);
  }

  /**
   * At most one primary unit per customer.
   *
   * Not a unique index, because "no primary" is valid and a partial unique index on
   * a boolean would make the common case (several units, none marked) awkward. Two
   * primaries would make the voice prompt's choice of unit depend on document order.
   */
  private static async demoteOtherPrimaries(
    businessId: Types.ObjectId | string,
    customerId: string | Types.ObjectId,
    keepId: Types.ObjectId
  ): Promise<void> {
    await Equipment.updateMany(
      { businessId, customerId, _id: { $ne: keepId }, isPrimary: true },
      { $set: { isPrimary: false } }
    );
  }

  /** Drops unknown keys and coerces the ones that need it. */
  private static sanitise(input: Partial<EquipmentInput>): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    if (input.type !== undefined) {
      if (!EQUIPMENT_TYPES.includes(input.type)) {
        throw new AppError(
          `Unknown equipment type. Expected one of: ${EQUIPMENT_TYPES.join(', ')}.`,
          400
        );
      }
      out.type = input.type;
    }

    if (input.location !== undefined) {
      // Empty string clears it; the enum would otherwise reject ''.
      if (input.location === null || (input.location as unknown) === '') {
        out.location = undefined;
      } else if (!EQUIPMENT_LOCATIONS.includes(input.location)) {
        throw new AppError(
          `Unknown location. Expected one of: ${EQUIPMENT_LOCATIONS.join(', ')}.`,
          400
        );
      } else {
        out.location = input.location;
      }
    }

    for (const key of [
      'brand',
      'modelNumber',
      'serialNumber',
      'filterSize',
      'locationNotes',
      'notes',
      'source',
    ] as const) {
      if (input[key] !== undefined) out[key] = input[key];
    }

    if (input.installYear !== undefined) {
      out.installYear = input.installYear === null ? undefined : Number(input.installYear);
    }

    if (input.warrantyExpiresAt !== undefined) {
      if (!input.warrantyExpiresAt) {
        out.warrantyExpiresAt = null;
      } else {
        const date = new Date(input.warrantyExpiresAt);
        if (isNaN(date.getTime())) {
          throw new AppError('Warranty expiry is not a valid date.', 400);
        }
        out.warrantyExpiresAt = date;
      }
    }

    if (input.isPrimary !== undefined) out.isPrimary = Boolean(input.isPrimary);
    if (input.active !== undefined) out.active = Boolean(input.active);

    return out;
  }

  /**
   * One-line description, for the voice prompt and the dispatch SMS.
   *
   * Built from the fields that exist rather than a fixed sentence, so a unit with
   * only a type reads "Furnace" instead of "undefined undefined Furnace".
   */
  public static describe(equipment: IEquipment): string {
    const parts: string[] = [];
    if (equipment.brand) parts.push(equipment.brand);
    if (equipment.modelNumber) parts.push(equipment.modelNumber);
    parts.push(EQUIPMENT_TYPE_LABELS[equipment.type] ?? 'Equipment');

    let text = parts.join(' ');

    if (equipment.installYear) text += ` (${equipment.installYear})`;
    if (equipment.location) {
      text += `, ${EQUIPMENT_LOCATION_LABELS[equipment.location]}`;
    }

    return text;
  }

  /**
   * Upserts a unit discovered during a call, without creating duplicates.
   *
   * Matched on type plus brand, because that is all a transcript reliably yields. A
   * caller mentioning their Carrier heat pump on three separate calls must not end
   * up with three rows — that would be the `AgentMemory` problem again with a
   * schema on top.
   */
  public static async upsertFromCall(
    businessId: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    input: EquipmentInput
  ): Promise<IEquipment | null> {
    try {
      const match: any = { businessId, customerId, type: input.type, active: true };
      // A brandless mention should attach to an existing brandless row of the same
      // type, not to the customer's known Carrier unit.
      match.brand = input.brand ? new RegExp(`^${escapeRegex(input.brand)}$`, 'i') : { $in: [null, ''] };

      const existing = await Equipment.findOne(match);

      if (existing) {
        // Only fills gaps. A value a person typed outranks one a regex inferred.
        let changed = false;
        for (const key of ['modelNumber', 'filterSize', 'location', 'locationNotes'] as const) {
          const incoming = (input as any)[key];
          if (incoming && !(existing as any)[key]) {
            (existing as any)[key] = incoming;
            changed = true;
          }
        }
        if (input.installYear && !existing.installYear) {
          existing.installYear = input.installYear;
          changed = true;
        }
        if (changed) await existing.save();
        return existing;
      }

      const hasAnyActive = await Equipment.exists({ businessId, customerId, active: true });

      return await Equipment.create({
        businessId,
        customerId,
        ...this.sanitise({ ...input, source: 'ai_call' }),
        // The first unit on file becomes primary; later ones do not silently
        // displace a choice someone made.
        isPrimary: !hasAnyActive,
      });
    } catch (err: any) {
      // Never let equipment capture break a call. The memory row is still written.
      log.warn('equipment_upsert_from_call_failed', {
        businessId: String(businessId),
        reason: err?.message,
      });
      return null;
    }
  }
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
