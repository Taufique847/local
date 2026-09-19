import mongoose, { Schema, Document, Types } from 'mongoose';

export type RecoveryStatus =
  | 'pending'
  | 'speed_to_lead_sent'
  | 'drip_step_2_sent'
  | 'drip_step_3_sent'
  | 'recovered_booked'
  | 'recovered_responded'
  | 'expired'
  | 'opted_out';

export interface ILeadRecovery extends Document {
  businessId: Types.ObjectId;
  callLogId?: Types.ObjectId;
  leadId?: Types.ObjectId;
  customerId?: Types.ObjectId;
  callerPhone: string;
  customerName?: string;
  serviceRequested?: string;
  status: RecoveryStatus;
  currentStep: number; // 0: None, 1: Instant Speed-to-Lead, 2: 2h Alert, 3: 24h Offer
  speedToLeadSentAt?: Date;
  step2SentAt?: Date;
  step3SentAt?: Date;
  nextFollowUpAt?: Date;
  recoveredAppointmentId?: Types.ObjectId;
  messages: Array<{
    direction: 'outbound' | 'inbound';
    text: string;
    sentAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const LeadRecoverySchema = new Schema<ILeadRecovery>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    callLogId: {
      type: Schema.Types.ObjectId,
      ref: 'CallLog',
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
    },
    callerPhone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
    },
    serviceRequested: {
      type: String,
      trim: true,
      default: 'HVAC Service',
    },
    status: {
      type: String,
      enum: [
        'pending',
        'speed_to_lead_sent',
        'drip_step_2_sent',
        'drip_step_3_sent',
        'recovered_booked',
        'recovered_responded',
        'expired',
        'opted_out',
      ],
      default: 'pending',
      index: true,
    },
    currentStep: {
      type: Number,
      default: 0,
    },
    speedToLeadSentAt: {
      type: Date,
    },
    step2SentAt: {
      type: Date,
    },
    step3SentAt: {
      type: Date,
    },
    nextFollowUpAt: {
      type: Date,
      index: true,
    },
    recoveredAppointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
    },
    messages: [
      {
        direction: { type: String, enum: ['outbound', 'inbound'], required: true },
        text: { type: String, required: true },
        sentAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

LeadRecoverySchema.index({ businessId: 1, callerPhone: 1, status: 1 });
LeadRecoverySchema.index({ status: 1, nextFollowUpAt: 1 });

export const LeadRecovery = mongoose.model<ILeadRecovery>('LeadRecovery', LeadRecoverySchema);
