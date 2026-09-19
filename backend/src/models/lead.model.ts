import { Schema, model } from 'mongoose';
import { ILead } from '../types/lead.types';

const leadActivitySchema = new Schema(
  {
    type: {
      type: String,
      enum: ['note', 'status_change', 'call_linked', 'appointment_scheduled', 'sms_sent'],
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: String,
      default: 'system',
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { _id: true }
);

const leadSchema = new Schema<ILead>(
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
      required: [true, 'Customer is required for a lead'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Lead title is required'],
      trim: true,
      maxlength: [160, 'Title cannot exceed 160 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    service: {
      type: String,
      trim: true,
    },
    serviceType: {
      type: String,
      trim: true,
    },
    serviceAddress: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        'new',
        'contacted',
        'qualified',
        'unqualified',
        'appointment_pending',
        'appointment_booked',
        'quoted',
        'won',
        'completed',
        'lost',
        'archived',
      ],
      default: 'new',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true,
    },
    urgency: {
      type: String,
      enum: ['low', 'medium', 'high', 'emergency'],
      default: 'medium',
      index: true,
    },
    source: {
      type: String,
      enum: ['manual', 'ai_call', 'website', 'referral', 'missed_call_sms', 'other'],
      default: 'manual',
      index: true,
    },
    estimatedValue: {
      type: Number,
      min: [0, 'Estimated value cannot be negative'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    aiIntent: {
      type: String,
      trim: true,
    },
    aiConfidence: {
      type: Number,
      min: 0,
      max: 1,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    activities: {
      type: [leadActivitySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast multi-tenant queries
leadSchema.index({ businessId: 1, createdAt: -1 });
leadSchema.index({ businessId: 1, status: 1 });
leadSchema.index({ businessId: 1, customerId: 1 });
leadSchema.index({ businessId: 1, urgency: 1 });

export const Lead = model<ILead>('Lead', leadSchema);
