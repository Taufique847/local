import { Schema, model, Document, Types } from 'mongoose';

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

export const EQUIPMENT_TYPES: EquipmentType[] = [
  'furnace',
  'air_conditioner',
  'heat_pump',
  'mini_split',
  'package_unit',
  'boiler',
  'air_handler',
  'water_heater',
  'thermostat',
  'other',
];

export const EQUIPMENT_LOCATIONS: EquipmentLocation[] = [
  'attic',
  'basement',
  'crawl_space',
  'garage',
  'roof',
  'closet',
  'side_yard',
  'utility_room',
  'exterior',
  'other',
];

export interface IEquipment extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  type: EquipmentType;
  brand?: string;
  /**
   * Model number.
   *
   * Named `modelNumber` and not `model` because `Document` already has a `model`
   * member — Mongoose's own `doc.model()` accessor — and shadowing it makes the
   * interface fail to extend `Document` at all.
   */
  modelNumber?: string;
  serialNumber?: string;
  installYear?: number;
  /** As written on the filter, e.g. "16x25x1". Free text because sizes are not a closed set. */
  filterSize?: string;
  location?: EquipmentLocation;
  /** Where it is, in the customer's own words, when the enum is not enough. */
  locationNotes?: string;
  warrantyExpiresAt?: Date | null;
  notes?: string;
  /**
   * The unit the AI and the dispatch SMS mention when they can only name one.
   *
   * A house with a furnace and an AC has two rows; the technician heading out needs
   * to be told which one the job is about, and absent a per-job link this is the
   * honest approximation.
   */
  isPrimary: boolean;
  /**
   * False once the unit is replaced or removed.
   *
   * Soft, not deleted: the service history references it, and a replaced unit is
   * exactly the thing a technician wants to know about when the new one fails.
   */
  active: boolean;
  /** 'manual' when a person entered it, 'ai_call' when extracted from a call. */
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Customer equipment as structured records.
 *
 * Feature #10 previously consisted of a 2000-character free-text `notes` field and
 * `AgentMemory` rows produced by five regexes. Nothing was queryable: you could
 * not answer "which customers have a Carrier unit out of warranty", and the
 * dispatch SMS derived its "Unit:" line by taking whichever `equipment` memory the
 * loop happened to see last.
 *
 * Attached to the customer rather than to a service address. `Customer.address` is
 * what every other part of the system treats as *the* address — the dispatch SMS,
 * the appointment, the invoice — and modelling equipment per address while nothing
 * else is per-address would create a join that no caller could populate correctly.
 * Multi-address equipment is a real feature and this is not it.
 */
const equipmentSchema = new Schema<IEquipment>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: EQUIPMENT_TYPES,
      required: true,
      index: true,
    },
    brand: {
      type: String,
      trim: true,
      maxlength: 60,
      index: true,
    },
    modelNumber: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    serialNumber: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    installYear: {
      type: Number,
      min: 1950,
      /**
       * Next year, not any year.
       *
       * A new build can legitimately have equipment installed ahead of the current
       * calendar year rolling over, but a four-digit typo like 2205 is a typo. The
       * bound is evaluated per save rather than frozen at module load, so this does
       * not start rejecting valid input in January.
       */
      validate: {
        validator: (value: number) => value <= new Date().getFullYear() + 1,
        message: 'Install year cannot be in the future.',
      },
    },
    filterSize: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    location: {
      type: String,
      enum: EQUIPMENT_LOCATIONS,
    },
    locationNotes: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    warrantyExpiresAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    source: {
      type: String,
      default: 'manual',
    },
  },
  { timestamps: true }
);

// The customer drawer's Equipment tab, and the voice prompt lookup.
equipmentSchema.index({ businessId: 1, customerId: 1, active: 1 });
// "Which customers have a Carrier unit?" — the query that was impossible before.
equipmentSchema.index({ businessId: 1, brand: 1 });
equipmentSchema.index({ businessId: 1, warrantyExpiresAt: 1 });

export const Equipment = model<IEquipment>('Equipment', equipmentSchema);
