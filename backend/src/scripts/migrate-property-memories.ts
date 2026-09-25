/**
 * Moves the four extracted `AgentMemory` keys into structured fields.
 *
 *   npm run migrate:property-memories            # dry run, reports only
 *   npm run migrate:property-memories -- --apply # writes
 *
 * The memory rows are KEPT. They carry provenance — which call, what confidence,
 * what the customer actually said — and a regex-derived value whose source has been
 * deleted is a value nobody can check. This migration reads them and writes the
 * structured equivalent; it does not replace them.
 *
 * Nothing already filled in is overwritten. A gate code an office manager corrected
 * by hand outranks the one the customer misremembered on a call, and this script
 * runs after that correction, not before it.
 *
 * Dry run is the default deliberately: this touches customer records across every
 * tenant, and "what would change" has to be answerable before anything does.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/database';
import { AgentMemory } from '../models/agent-memory.model';
import { Customer } from '../models/customer.model';
import { Equipment } from '../models/equipment.model';
import {
  parseEquipmentMention,
  parseEquipmentLocation,
} from '../services/agent-memory.service';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'migrate-property-memories' });

const APPLY = process.argv.includes('--apply');

/** The four keys `extractMemoriesFromTranscript` writes. */
const MIGRATABLE_KEYS = [
  'access_code',
  'pets_on_property',
  'primary_equipment',
  'equipment_location',
];

/**
 * Pulls the code back out of "Gate/entry code is 1234".
 *
 * The stored value is a sentence the extractor built, not the raw capture, so the
 * digits have to be recovered. A value that does not match this shape is left alone
 * and reported rather than guessed at — a mangled gate code is worse than none,
 * because a technician will stand at a gate trying it.
 */
const parseGateCode = (value: string): string | null => {
  const match = value.match(/([#*]?\d{3,6})/);
  return match ? match[1] : null;
};

interface Counters {
  customersTouched: number;
  gateCodes: number;
  pets: number;
  equipmentCreated: number;
  locationsApplied: number;
  skippedAlreadySet: number;
  unparseable: number;
}

const run = async (): Promise<void> => {
  await connectDB();

  const counters: Counters = {
    customersTouched: 0,
    gateCodes: 0,
    pets: 0,
    equipmentCreated: 0,
    locationsApplied: 0,
    skippedAlreadySet: 0,
    unparseable: 0,
  };

  const memories = await AgentMemory.find({ key: { $in: MIGRATABLE_KEYS } }).lean();

  log.info('migration_scan', { memoryRows: memories.length, mode: APPLY ? 'apply' : 'dry-run' });

  // Grouped by customer so each record is read and written once, and so the
  // location memory can be applied after the equipment row it belongs to exists.
  const byCustomer = new Map<string, typeof memories>();
  for (const memory of memories) {
    const key = `${memory.businessId}:${memory.customerId}`;
    const list = byCustomer.get(key) ?? [];
    list.push(memory);
    byCustomer.set(key, list);
  }

  for (const [compositeKey, rows] of byCustomer) {
    const [businessId, customerId] = compositeKey.split(':');

    const customer = await Customer.findOne({ _id: customerId, businessId }).select('property');

    // A memory for a customer that no longer exists. Nothing to migrate onto.
    if (!customer) continue;

    const current = (customer.property ?? {}) as Record<string, unknown>;
    const propertyUpdates: Record<string, unknown> = {};
    let touched = false;

    // Deterministic order, so a dry run and the apply that follows report the same
    // numbers even if Mongo returns the rows differently.
    const ordered = [...rows].sort(
      (a, b) => MIGRATABLE_KEYS.indexOf(a.key) - MIGRATABLE_KEYS.indexOf(b.key)
    );

    for (const memory of ordered) {
      if (memory.key === 'access_code') {
        if (current.gateCode) {
          counters.skippedAlreadySet++;
          continue;
        }
        const code = parseGateCode(memory.value);
        if (!code) {
          counters.unparseable++;
          log.warn('gate_code_unparseable', {
            customerId,
            value: memory.value.slice(0, 80),
          });
          continue;
        }
        propertyUpdates['property.gateCode'] = code;
        counters.gateCodes++;
        touched = true;
      }

      if (memory.key === 'pets_on_property') {
        if (current.hasPets !== undefined) {
          counters.skippedAlreadySet++;
          continue;
        }
        propertyUpdates['property.hasPets'] = true;
        if (!current.petNotes) {
          propertyUpdates['property.petNotes'] =
            'Mentioned a dog on the property during a call. Knock or call before entering the yard.';
        }
        counters.pets++;
        touched = true;
      }

      if (memory.key === 'primary_equipment') {
        const parsed = parseEquipmentMention(memory.value);
        if (!parsed) {
          counters.unparseable++;
          log.warn('equipment_unparseable', {
            customerId,
            value: memory.value.slice(0, 80),
          });
          continue;
        }

        const existing = await Equipment.findOne({
          businessId,
          customerId,
          type: parsed.type,
          active: true,
        });

        if (existing) {
          counters.skippedAlreadySet++;
        } else {
          counters.equipmentCreated++;
          touched = true;

          if (APPLY) {
            const hasAny = await Equipment.exists({ businessId, customerId, active: true });
            await Equipment.create({
              businessId,
              customerId,
              type: parsed.type,
              brand: parsed.brand,
              // Marked as derived, so a later audit can tell a regex's guess from a
              // person's entry.
              source: 'migrated_from_memory',
              isPrimary: !hasAny,
            });
          }
        }
      }

      if (memory.key === 'equipment_location') {
        const location = parseEquipmentLocation(
          memory.value.replace(/^equipment located in\s*/i, '')
        );

        if (!location) {
          counters.unparseable++;
          continue;
        }

        /**
         * Applied to the primary unit, or the only unit. Never guessed between
         * several — a furnace in the basement and an AC on the roof are both
         * plausible and being wrong sends a technician to the wrong part of the house.
         */
        const units = await Equipment.find({ businessId, customerId, active: true });
        const target = units.find((u) => u.isPrimary) ?? (units.length === 1 ? units[0] : null);

        if (!target) continue;
        if (target.location) {
          counters.skippedAlreadySet++;
          continue;
        }

        counters.locationsApplied++;
        touched = true;

        if (APPLY) {
          target.location = location;
          await target.save();
        }
      }
    }

    if (Object.keys(propertyUpdates).length && APPLY) {
      await Customer.updateOne({ _id: customerId, businessId }, { $set: propertyUpdates });
    }

    if (touched) counters.customersTouched++;
  }

  log.info('migration_complete', { mode: APPLY ? 'apply' : 'dry-run', ...counters });

  if (!APPLY) {
    log.warn('migration_dry_run', {
      note: 'Nothing was written. Re-run with --apply once the numbers above look right.',
    });
  }

  await disconnectDB();
};

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    log.error('migration_failed', { err });
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
