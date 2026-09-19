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
  },
  {
    timestamps: true,
  }
);

export const BusinessPolicy = model<IBusinessPolicy>('BusinessPolicy', businessPolicySchema);
