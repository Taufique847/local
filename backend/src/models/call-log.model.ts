import { Schema, model } from 'mongoose';
import { ICallLog } from '../types/telephony.types';

const callLogSchema = new Schema<ICallLog>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    phoneNumberId: {
      type: Schema.Types.ObjectId,
      ref: 'BusinessPhoneNumber',
    },
    provider: {
      type: String,
      enum: ['twilio'],
      default: 'twilio',
      required: true,
    },
    providerCallSid: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      default: 'inbound',
      required: true,
      index: true,
    },
    from: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    to: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        'initiated',
        'ringing',
        'in_progress',
        'completed',
        'failed',
        'busy',
        'no_answer',
        'cancelled',
      ],
      default: 'initiated',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    answeredAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    recordingUrl: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
callLogSchema.index({ businessId: 1, startedAt: -1 });
callLogSchema.index({ businessId: 1, status: 1 });
callLogSchema.index({ businessId: 1, from: 1 });

export const CallLog = model<ICallLog>('CallLog', callLogSchema);
