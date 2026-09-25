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

/**
 * A repeating schedule, stored on the first appointment of a series.
 *
 * Only `weekly` and `monthly`, with an `interval` multiplier. Fortnightly is weekly
 * every 2, quarterly is monthly every 3, annual is monthly every 12 — so the two
 * frequencies cover every real maintenance plan without adding enum values that would
 * then need their own date arithmetic and their own month-end edge cases. A `quarterly`
 * value would be a third way of writing something `monthly`/3 already says.
 *
 * `until` and `count` are alternatives, and at least one is required: see
 * `RecurrenceService` for why an unbounded series is refused rather than materialised
 * forever.
 */
const recurrenceRuleSchema = new Schema(
  {
    frequency: { type: String, enum: ['weekly', 'monthly'], required: true },
    interval: { type: Number, required: true, min: 1, max: 52, default: 1 },
    /** Total occurrences including the first. */
    count: { type: Number, min: 2, max: 260 },
    /** Last date an occurrence may start on, inclusive. */
    until: { type: Date },
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
    /**
     * Recurrence lives on the **parent only**, so the rule has exactly one home.
     *
     * Copying the rule onto every occurrence would mean a change to the plan had to be
     * written to every row, and a partial write would leave two occurrences of the same
     * series disagreeing about what the series is.
     */
    recurrenceRule: {
      type: recurrenceRuleSchema,
      default: null,
    },
    /**
     * The first appointment of the series, on every occurrence after it.
     *
     * Null on the parent itself rather than self-referential: "is this the parent" is
     * then a null check and not a comparison, and a query for a whole series is one
     * `$or` over id and parent.
     */
    recurrenceParentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true,
    },
    /**
     * How far the series has been materialised, on the parent.
     *
     * A series is generated to a horizon rather than in full, and the top-up job extends
     * it. Without this the job would have to re-derive "what have I already made" from
     * the occurrences themselves, which is the same question asked more expensively and
     * wrongly — a cancelled or manually deleted occurrence would look like a gap to fill.
     */
    recurrenceGeneratedThrough: {
      type: Date,
      default: null,
    },
    /**
     * Set once the series has no occurrences left to generate.
     *
     * The watermark alone cannot tell the top-up job this. A four-visit plan finishes with
     * its watermark three weeks out — comfortably inside the 120-day horizon — so the
     * query would select it on every tick forever, taking the per-business booking lock
     * each time to discover there is nothing to do. Recording *why* generation stopped is
     * what lets a finished plan be left alone.
     */
    recurrenceCompletedAt: {
      type: Date,
      default: null,
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
