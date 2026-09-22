import { Schema, model, Document, Types } from 'mongoose';

/**
 * 'expired' is set lazily when a lapsed quote is next read, because `expiresAt`
 * was previously written and never enforced — a quote stayed signable forever.
 */
export type EstimateStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'approved'
  | 'rejected'
  | 'converted'
  | 'expired';

export interface IEstimateItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ISignatureData {
  signedByName: string;
  signatureDataUrl: string;
  signedAt: Date;
  ipAddress?: string;
}

export interface IEstimateTier {
  tierId: 'good' | 'better' | 'best';
  name: string;
  badge?: string;
  description: string;
  items: IEstimateItem[];
  subtotal: number;
  totalAmount: number;
  isRecommended?: boolean;
}

export interface IEstimate extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  leadId?: Types.ObjectId;
  estimateNumber: string;
  title: string;
  items: IEstimateItem[];
  tiers?: IEstimateTier[];
  selectedTierId?: 'good' | 'better' | 'best';
  subtotal: number;
  diagnosticFeeCredit: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  terms: string;
  status: EstimateStatus;
  signature?: ISignatureData;
  shareToken: string;
  sentAt?: Date;
  viewedAt?: Date;
  approvedAt?: Date;
  expiresAt?: Date;
  convertedInvoiceId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const estimateItemSchema = new Schema<IEstimateItem>(
  {
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const signatureSchema = new Schema<ISignatureData>(
  {
    signedByName: { type: String, required: true, trim: true },
    signatureDataUrl: { type: String, required: true },
    signedAt: { type: Date, default: Date.now },
    ipAddress: { type: String },
  },
  { _id: false }
);

const estimateTierSchema = new Schema<IEstimateTier>(
  {
    tierId: { type: String, enum: ['good', 'better', 'best'], required: true },
    name: { type: String, required: true },
    badge: { type: String },
    description: { type: String },
    items: { type: [estimateItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    isRecommended: { type: Boolean, default: false },
  },
  { _id: false }
);

const estimateSchema = new Schema<IEstimate>(
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
      default: null,
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    estimateNumber: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'HVAC Service & Repair Estimate',
    },
    items: {
      type: [estimateItemSchema],
      default: [],
    },
    tiers: {
      type: [estimateTierSchema],
      default: [],
    },
    selectedTierId: {
      type: String,
      enum: ['good', 'better', 'best', null],
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
    },
    subtotal: {
      type: Number,
      required: true,
      default: 0,
    },
    diagnosticFeeCredit: {
      type: Number,
      default: 0,
    },
    taxRate: {
      type: Number,
      default: 0.0825, // 8.25% standard default
    },
    taxAmount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    terms: {
      type: String,
      default: 'Estimate valid for 30 days. 100% of diagnostic fee credited upon approval. Includes 1-year workmanship warranty.',
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'viewed', 'approved', 'rejected', 'converted', 'expired'],
      default: 'sent',
      index: true,
    },
    signature: {
      type: signatureSchema,
      default: null,
    },
    shareToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sentAt: { type: Date, default: Date.now },
    viewedAt: { type: Date },
    approvedAt: { type: Date },
    convertedInvoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

estimateSchema.index({ businessId: 1, estimateNumber: 1 }, { unique: true });
estimateSchema.index({ businessId: 1, status: 1 });

export const Estimate = model<IEstimate>('Estimate', estimateSchema);
