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
  /**
   * The dollars taken off this tier, and the tax charged on it.
   *
   * Only these three figures vary between tiers — the diagnostic credit, the
   * emergency and travel fees and the tax *rate* belong to the job, not to the
   * option the customer picks. They are stored because `approveEstimate` copies the
   * chosen tier onto the estimate, and it previously copied `subtotal` and
   * `totalAmount` while leaving `taxAmount` at the base items' value. The resulting
   * estimate, and the invoice converted from it, failed its own
   * `total === taxable + tax` check.
   */
  discountAmount: number;
  taxAmount: number;
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
  /** Emergency/after-hours callout charge. 0 when not an emergency job. */
  emergencyFee: number;
  /** Trip charge from the service zone matching the job zip. 0 when none applies. */
  travelFee: number;
  discountType?: 'percentage' | 'fixed';
  discountValue: number;
  discountAmount: number;
  /** Why the discount was given. A discount nobody can explain later is a write-off. */
  discountReason?: string;
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
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
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
    /**
     * Emergency and travel fees are stored alongside the line items that represent
     * them, not instead of them. The line item is what the customer reads; these
     * fields are what a report can sum without parsing descriptions.
     */
    emergencyFee: {
      type: Number,
      default: 0,
    },
    travelFee: {
      type: Number,
      default: 0,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
    },
    /** The percentage or dollar figure as entered, kept for the audit trail. */
    discountValue: {
      type: Number,
      default: 0,
    },
    /** The dollars actually taken off, after the percentage is applied or the cap hit. */
    discountAmount: {
      type: Number,
      default: 0,
    },
    discountReason: {
      type: String,
      trim: true,
      maxlength: 200,
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
