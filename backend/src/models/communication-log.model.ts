import { Schema, model } from 'mongoose';
import { ICommunicationLog } from '../types/communication.types';

const communicationLogSchema = new Schema<ICommunicationLog>(
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
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      index: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      index: true,
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: ['sms'],
      default: 'sms',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'appointment_confirmation',
        'appointment_reminder',
        'appointment_rescheduled',
        'appointment_cancelled',
        'missed_call_followup',
        'lead_followup',
        'custom',
      ],
      default: 'custom',
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
      index: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1600,
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'failed', 'received'],
      default: 'queued',
      index: true,
    },
    twilioSid: {
      type: String,
      trim: true,
      index: true,
    },
    errorCode: {
      type: String,
      trim: true,
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
communicationLogSchema.index({ businessId: 1, createdAt: -1 });
communicationLogSchema.index({ businessId: 1, to: 1 });
communicationLogSchema.index({ businessId: 1, customerId: 1 });

export const CommunicationLog = model<ICommunicationLog>('CommunicationLog', communicationLogSchema);
