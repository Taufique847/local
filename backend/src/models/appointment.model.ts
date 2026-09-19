import { Schema, model } from 'mongoose';
import { IAppointment } from '../types/appointment.types';

const rescheduleRecordSchema = new Schema(
  {
    previousStartAt: { type: Date, required: true },
    previousEndAt: { type: Date, required: true },
    newStartAt: { type: Date, required: true },
    newEndAt: { type: Date, required: true },
    reason: { type: String, trim: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: String, default: 'system' },
  },
  { _id: false }
);

const appointmentSchema = new Schema<IAppointment>(
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
      required: [true, 'Customer is required'],
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
      index: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: 'Service',
      required: [true, 'Service is required'],
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    startAt: {
      type: Date,
      required: [true, 'Start time is required'],
      index: true,
    },
    endAt: {
      type: Date,
      required: [true, 'End time is required'],
      index: true,
    },
    timezone: {
      type: String,
      required: true,
      default: 'America/New_York',
    },
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'rescheduled', 'in_progress', 'completed', 'cancelled', 'no_show'],
      default: 'scheduled',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    source: {
      type: String,
      enum: ['manual', 'ai_call', 'website', 'referral', 'other'],
      default: 'manual',
    },
    address: {
      type: String,
      trim: true,
    },
    technicianName: {
      type: String,
      trim: true,
    },
    customerNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    internalNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    rescheduleHistory: {
      type: [rescheduleRecordSchema],
      default: [],
    },
    createdBy: {
      type: String,
      default: 'owner',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for conflict checking & scheduling queries
appointmentSchema.index({ businessId: 1, startAt: 1, endAt: 1 });
appointmentSchema.index({ businessId: 1, status: 1 });
appointmentSchema.index({ businessId: 1, customerId: 1 });
appointmentSchema.index({ businessId: 1, serviceId: 1 });

export const Appointment = model<IAppointment>('Appointment', appointmentSchema);
