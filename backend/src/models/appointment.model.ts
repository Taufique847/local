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
      enum: ['scheduled', 'confirmed', 'rescheduled', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show'],
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
    technicianId: {
      type: Schema.Types.ObjectId,
      ref: 'Technician',
      default: null,
      index: true,
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
    /**
     * When the reminder for this appointment was claimed by the reminder job.
     *
     * Doubles as the idempotence key: the job claims an appointment with an atomic
     * conditional update on this field being null, so two scheduler instances
     * cannot both remind the same customer. Indexed together with `startAt`
     * because the job's selection query filters on exactly that pair.
     */
    reminderSentAt: {
      type: Date,
      default: null,
    },
    /**
     * How many times the reminder job has claimed this appointment.
     *
     * Bounds retries. A transient provider outage un-claims the appointment so the
     * next tick tries again, and without a counter that would retry every fifteen
     * minutes until the appointment started.
     */
    reminderAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    /**
     * Set when the customer themselves confirms, by replying to the reminder.
     *
     * Distinct from `status: 'confirmed'`, which the business sets. Knowing the
     * customer personally acknowledged is what makes a no-show preventable, and
     * the two are not interchangeable.
     */
    confirmedByCustomerAt: {
      type: Date,
      default: null,
    },
    rescheduleHistory: {
      type: [rescheduleRecordSchema],
      default: [],
    },
    checkIn: {
      timestamp: { type: Date },
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
    },
    checkOut: {
      timestamp: { type: Date },
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
    },
    checklist: [
      {
        item: { type: String, required: true },
        completed: { type: Boolean, default: false },
      },
    ],
    photos: [
      {
        url: { type: String, required: true },
        caption: { type: String },
        phase: { type: String, enum: ['before', 'after'], default: 'before' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    partsUsed: [
      {
        partName: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        unitCost: { type: Number, default: 0 },
        totalCost: { type: Number, default: 0 },
      },
    ],
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
// Serves the reminder job's selection query, which is cross-tenant by design and
// so cannot lead with businessId.
appointmentSchema.index({ reminderSentAt: 1, startAt: 1, status: 1 });

export const Appointment = model<IAppointment>('Appointment', appointmentSchema);
