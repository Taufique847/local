import mongoose, { Document, Schema, Types } from 'mongoose';

export type SubscriptionTier = 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
export type BillingInterval = 'month' | 'year';

/** Statuses that permit the AI receptionist to answer calls. */
export const ENTITLED_STATUSES: SubscriptionStatus[] = ['trialing', 'active'];

export interface IInvoiceRecord {
  invoiceId: string;
  amountPaid: number;
  currency: string;
  pdfUrl?: string;
  paidAt: Date;
  status: 'paid' | 'open' | 'failed';
}

export interface ISubscription extends Document {
  businessId: Types.ObjectId;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  billingInterval: BillingInterval;
  amountUsd: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  minutesAllocated: number;
  minutesUsed: number;
  phoneNumbersAllocated: number;
  /** When minutesUsed was last rolled over to a fresh billing period. */
  usageResetAt: Date;
  /** End of the free trial. Null once the business has paid. */
  trialEndsAt?: Date;
  invoicesHistory: IInvoiceRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceRecordSchema = new Schema<IInvoiceRecord>(
  {
    invoiceId: { type: String, required: true },
    amountPaid: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    pdfUrl: { type: String },
    paidAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['paid', 'open', 'failed'], default: 'paid' },
  },
  { _id: false }
);

const SubscriptionSchema = new Schema<ISubscription>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      unique: true,
      index: true,
    },
    stripeCustomerId: {
      type: String,
      required: true,
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      index: true,
    },
    stripePriceId: {
      type: String,
    },
    tier: {
      type: String,
      enum: ['starter', 'pro', 'enterprise'],
      default: 'starter',
      required: true,
    },
    status: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'canceled', 'incomplete'],
      // New businesses start on a trial, not a fabricated paid subscription.
      default: 'trialing',
      required: true,
      index: true,
    },
    billingInterval: {
      type: String,
      enum: ['month', 'year'],
      default: 'month',
      required: true,
    },
    amountUsd: {
      type: Number,
      default: 299,
      required: true,
    },
    currentPeriodStart: {
      type: Date,
      default: Date.now,
    },
    currentPeriodEnd: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    minutesAllocated: {
      type: Number,
      default: 250,
    },
    minutesUsed: {
      type: Number,
      default: 0,
    },
    phoneNumbersAllocated: {
      type: Number,
      default: 1,
    },
    usageResetAt: {
      type: Date,
      default: Date.now,
    },
    trialEndsAt: {
      type: Date,
      index: true,
    },
    invoicesHistory: {
      type: [InvoiceRecordSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
