import mongoose, { Document, Schema, Types } from 'mongoose';

export type SubscriptionTier = 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';
export type BillingInterval = 'month' | 'year';

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
      enum: ['active', 'past_due', 'canceled', 'incomplete'],
      default: 'active',
      required: true,
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
