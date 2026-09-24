import { Schema, model, Document, Types } from 'mongoose';

export type InvoiceStatus = 'draft' | 'unpaid' | 'paid' | 'partially_paid' | 'cancelled';
export type PaymentMethod = 'card' | 'cash' | 'check' | 'bank_transfer' | 'other';

export interface IInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface IInvoice extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  estimateId?: Types.ObjectId;
  invoiceNumber: string;
  title: string;
  items: IInvoiceItem[];
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
  amountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
  dueDate: Date;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  paidAt?: Date;
  notes?: string;
  shareToken: string;
  /**
   * Stripe Checkout session created for the homeowner's card payment. The
   * balance is only cleared once Stripe confirms the charge through the
   * signature-verified webhook.
   */
  stripeCheckoutSessionId?: string;
  /**
   * Set when a homeowner declares from the portal that they intend to pay by
   * check / cash / transfer. This is a claim awaiting contractor confirmation,
   * never a cleared balance.
   */
  pendingOfflinePaymentMethod?: PaymentMethod;
  offlinePaymentDeclaredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceItemSchema = new Schema<IInvoiceItem>(
  {
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const invoiceSchema = new Schema<IInvoice>(
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
    estimateId: {
      type: Schema.Types.ObjectId,
      ref: 'Estimate',
      default: null,
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'HVAC Work Order & Service Invoice',
    },
    items: {
      type: [invoiceItemSchema],
      default: [],
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
      default: 0.0825,
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
    amountPaid: {
      type: Number,
      default: 0,
    },
    balanceDue: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'unpaid', 'paid', 'partially_paid', 'cancelled'],
      default: 'unpaid',
      index: true,
    },
    dueDate: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Net 14 days standard
    },
    paymentMethod: {
      type: String,
      enum: ['card', 'cash', 'check', 'bank_transfer', 'other'],
    },
    paymentReference: {
      type: String,
      trim: true,
    },
    paidAt: {
      type: Date,
    },
    notes: {
      type: String,
      default: 'Payment due upon completion. Thank you for your business!',
    },
    shareToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    stripeCheckoutSessionId: {
      type: String,
      trim: true,
    },
    pendingOfflinePaymentMethod: {
      type: String,
      enum: ['card', 'cash', 'check', 'bank_transfer', 'other'],
    },
    offlinePaymentDeclaredAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

invoiceSchema.index({ businessId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ businessId: 1, status: 1 });

export const Invoice = model<IInvoice>('Invoice', invoiceSchema);
