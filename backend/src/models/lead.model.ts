import { Schema, model } from 'mongoose';
import { ILead } from '../types/lead.types';

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
      maxlength: [120, 'Title cannot exceed 120 characters'],
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
    status: {
      type: String,
      enum: ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'archived'],
      default: 'new',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true,
    },
    source: {
      type: String,
      enum: ['manual', 'ai_call', 'website', 'referral', 'other'],
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
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast multi-tenant queries
leadSchema.index({ businessId: 1, createdAt: -1 });
leadSchema.index({ businessId: 1, status: 1 });
leadSchema.index({ businessId: 1, customerId: 1 });

export const Lead = model<ILead>('Lead', leadSchema);
