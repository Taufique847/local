import { Schema, model } from 'mongoose';
import { IBusinessPhoneNumber } from '../types/telephony.types';

const businessPhoneNumberSchema = new Schema<IBusinessPhoneNumber>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['twilio'],
      default: 'twilio',
      required: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true,
    },
    phoneNumberSid: {
      type: String,
      trim: true,
    },
    friendlyName: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      default: 'US',
      trim: true,
    },
    capabilities: {
      voice: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    voiceWebhookUrl: {
      type: String,
      trim: true,
    },
    smsWebhookUrl: {
      type: String,
      trim: true,
    },
    isPrimary: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
businessPhoneNumberSchema.index({ businessId: 1, isPrimary: 1 });
businessPhoneNumberSchema.index({ businessId: 1, status: 1 });
businessPhoneNumberSchema.index({ phoneNumber: 1, status: 1 });

export const BusinessPhoneNumber = model<IBusinessPhoneNumber>(
  'BusinessPhoneNumber',
  businessPhoneNumberSchema
);
