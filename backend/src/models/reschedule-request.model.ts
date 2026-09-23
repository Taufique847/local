import { Schema, model, Document, Types } from 'mongoose';

export type RescheduleRequestStatus = 'pending' | 'applied' | 'dismissed';
export type RescheduleRequestSource = 'sms' | 'email' | 'phone' | 'portal';

export interface IOfferedSlot {
  startAt: Date;
  endAt: Date;
}

export interface IRescheduleRequest extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  appointmentId: Types.ObjectId;
  status: RescheduleRequestStatus;
  source: RescheduleRequestSource;
  /** The customer's own words, verbatim. */
  requestText?: string;
  /** The appointment time at the moment the request was raised. */
  originalStartAt: Date;
  /** Slots offered back to the customer, so the owner sees what was promised. */
  offeredSlots: IOfferedSlot[];
  appliedStartAt?: Date | null;
  resolvedAt?: Date | null;
  /** User id, or 'customer' when resolved by the customer's own action. */
  resolvedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A customer asking to move an appointment.
 *
 * Its own record rather than a status on the appointment, for two reasons. The
 * request and the appointment have different lifecycles — a customer can ask
 * twice, and the owner can decline — and the offered slots have to be stored
 * somewhere: the customer was texted three specific times, and an owner who
 * cannot see which ones will offer a fourth.
 *
 * Before this, an inbound "can we move this?" reached `handleInboundSms`, matched
 * no keyword, no rating and no recovery intent, and was dropped. It was logged,
 * and nothing surfaced it.
 */
const rescheduleRequestSchema = new Schema<IRescheduleRequest>(
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
      required: true,
      index: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      // Indexed below rather than here. `index: true` auto-names the index
      // `appointmentId_1`, which collides with the partial unique index on the
      // same key — Mongo rejects the second one outright, so index sync fails.
    },
    status: {
      type: String,
      enum: ['pending', 'applied', 'dismissed'],
      default: 'pending',
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['sms', 'email', 'phone', 'portal'],
      default: 'sms',
      required: true,
    },
    requestText: {
      type: String,
      trim: true,
      maxlength: 1600,
    },
    originalStartAt: {
      type: Date,
      required: true,
    },
    offeredSlots: {
      type: [
        new Schema<IOfferedSlot>(
          {
            startAt: { type: Date, required: true },
            endAt: { type: Date, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    appliedStartAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// The owner's queue: pending requests for one business, oldest first.
rescheduleRequestSchema.index({ businessId: 1, status: 1, createdAt: 1 });
/**
 * Stops a customer texting R three times from opening three requests for the
 * same appointment. Partial, so an applied or dismissed request does not block a
 * genuine second request later.
 */
rescheduleRequestSchema.index(
  { appointmentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'one_pending_request_per_appointment',
  }
);
/**
 * No separate plain index on `appointmentId`.
 *
 * A partial index only serves queries that provably match its filter, so it looks
 * like an unqualified `findOne({ appointmentId })` would need its own. Every
 * production read here is `{ appointmentId, status: 'pending' }`, which the index
 * above covers; the unqualified form appears only in tests, and adding a second
 * index for them would cost a write on every insert and trip Mongoose's
 * duplicate-index warning.
 */

export const RescheduleRequest = model<IRescheduleRequest>(
  'RescheduleRequest',
  rescheduleRequestSchema
);
