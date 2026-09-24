export type InvoiceStatus = 'draft' | 'unpaid' | 'paid' | 'partially_paid' | 'cancelled';
export type PaymentMethod = 'card' | 'cash' | 'check' | 'bank_transfer' | 'other';

export type DiscountType = 'percentage' | 'fixed';

/**
 * A discount as entered by the owner.
 *
 * `value` is a percentage when `type` is 'percentage' and dollars when 'fixed'. The
 * server decides what that comes to: a percentage applies after the diagnostic credit
 * and before tax, and a fixed amount is capped at the bill rather than going negative.
 */
export interface DiscountInput {
  type: DiscountType;
  value: number;
  reason?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  _id: string;
  businessId: any;
  customerId: any;
  appointmentId?: any;
  estimateId?: any;
  invoiceNumber: string;
  title: string;
  items: InvoiceItem[];
  subtotal: number;
  diagnosticFeeCredit: number;
  /**
   * The emergency callout and travel charges also appear as their own rows in `items`,
   * which is what the customer reads. These fields are for reports that need to sum
   * them without parsing descriptions.
   */
  emergencyFee: number;
  travelFee: number;
  discountType?: DiscountType;
  /** The percentage or dollar figure as entered, kept for the audit trail. */
  discountValue: number;
  /** The dollars actually taken off, after the percentage or the cap was applied. */
  discountAmount: number;
  discountReason?: string;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
  dueDate: string;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  paidAt?: string;
  notes?: string;
  shareToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceStats {
  totalBilled: number;
  totalCollected: number;
  outstandingDue: number;
  paidCount: number;
  unpaidCount: number;
  totalCount: number;
}

export interface CreateInvoiceInput {
  customerId: string;
  appointmentId?: string;
  estimateId?: string;
  title?: string;
  items: { description: string; quantity: number; unitPrice: number }[];
  diagnosticFeeCredit?: number;
  /** A fraction — 0.0825 for 8.25%. Omit it and the business's configured rate applies. */
  taxRate?: number;
  /**
   * Overrides. Left unset, the emergency fee follows the appointment's priority and the
   * travel fee comes from the service zone covering the customer's ZIP.
   */
  emergency?: boolean;
  emergencyFee?: number;
  travelFee?: number;
  discount?: DiscountInput;
  dueDate?: string;
  notes?: string;
}
