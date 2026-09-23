import { Schema, model, Document, Types } from 'mongoose';

export interface IBusinessPolicy extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  minBookingNoticeHours: number; // e.g. 2 hours notice
  maxBookingHorizonDays: number; // e.g. 30 days out max
  requireDiagnosticBeforePricing: boolean; // cannot give firm repair cost over phone
  emergencyKeywords: string[];
  prohibitedClaims: string[];
  afterHoursDispatchEnabled: boolean;
  emergencyTransferPhone?: string;
  /**
   * Standard trip/diagnostic fee the AI is allowed to quote on the phone.
   *
   * The settings UI has always collected this (and emergencyFee) but posted it
   * under field names that did not exist on this schema, so Mongoose silently
   * discarded them and the AI had no authorised price to quote.
   */
  diagnosticFee: number;
  emergencyFee: number;
  /**
   * Sales tax applied to invoices and estimates, as a fraction (0.0825 = 8.25%).
   *
   * Lives here because it was previously a literal in three separate files, and
   * in the technician's job-completion path it was not overridable at all — so a
   * business outside that one tax jurisdiction was silently billed the wrong
   * amount with no way to correct it.
   *
   * Still a single blended rate. Per-jurisdiction tax is a real feature and is
   * not this field.
   */
  taxRate: number;
  /**
   * Default hourly labour rate for additional time a technician logs on site.
   *
   * Was hardcoded to 95 in the job-completion path.
   */
  laborRate: number;
  /**
   * Whether callers hear a spoken notice that they are talking to an automated
   * assistant and that the conversation is captured, before the AI session
   * begins.
   *
   * Defaults to on. Several US states are all-party ("two-party") consent
   * jurisdictions for recording, and a growing number require disclosure of
   * synthetic voices, so the safe default is to announce. Turning this off is a
   * decision the business has to make deliberately.
   */
  aiDisclosureEnabled: boolean;
  /** Overrides the generated disclosure wording. */
  aiDisclosureText?: string;
  createdAt: Date;
  updatedAt: Date;
}

const businessPolicySchema = new Schema<IBusinessPolicy>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      unique: true,
      index: true,
    },
    minBookingNoticeHours: {
      type: Number,
      default: 2,
      min: 0,
      max: 48,
    },
    maxBookingHorizonDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 180,
    },
    requireDiagnosticBeforePricing: {
      type: Boolean,
      default: true,
    },
    emergencyKeywords: {
      type: [String],
      default: [
        'gas smell',
        'gas leak',
        'water leak',
        'freezing',
        'no heat',
        'sub zero',
        'elderly',
        'infant',
        'sparking',
        'burning odor',
        'carbon monoxide',
      ],
    },
    prohibitedClaims: {
      type: [String],
      default: [
        'guaranteed free repairs',
        'exact quote without diagnosis',
        'lifetime warranty on all parts',
        'we service uncertified equipment',
      ],
    },
    afterHoursDispatchEnabled: {
      type: Boolean,
      default: true,
    },
    emergencyTransferPhone: {
      type: String,
      trim: true,
    },
    diagnosticFee: {
      type: Number,
      default: 89,
      min: 0,
      max: 10000,
    },
    emergencyFee: {
      type: Number,
      default: 149,
      min: 0,
      max: 10000,
    },
    taxRate: {
      type: Number,
      // 8.25% — the literal that was previously hardcoded. Kept as the default
      // so existing businesses are billed exactly as before until they change it.
      default: 0.0825,
      min: 0,
      // A fraction, not a percentage. 1 would be 100% tax; anything above that
      // is a data-entry error, not a jurisdiction.
      max: 1,
    },
    laborRate: {
      type: Number,
      default: 95,
      min: 0,
      max: 10000,
    },
    aiDisclosureEnabled: {
      type: Boolean,
      default: true,
    },
    aiDisclosureText: {
      type: String,
      trim: true,
      maxlength: 400,
    },
  },
  {
    timestamps: true,
  }
);

export const BusinessPolicy = model<IBusinessPolicy>('BusinessPolicy', businessPolicySchema);
