import type { DiscountInput, DiscountType } from './invoice';

/**
 * `expired` included, which it was not before.
 *
 * The server sets it lazily when a lapsed quote is next read, so it is a state the UI
 * genuinely receives. Leaving it out of the union meant any exhaustive check here was
 * reasoning about states that cannot happen while ignoring one that does.
 */
export type EstimateStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'approved'
  | 'rejected'
  | 'converted'
  | 'expired';

export interface EstimateItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface EstimateTier {
  tierId: 'good' | 'better' | 'best';
  name: string;
  badge?: string;
  description: string;
  items: EstimateItem[];
  subtotal: number;
  /**
   * Only these three vary between tiers. The diagnostic credit, the emergency and
   * travel fees and the tax *rate* belong to the job, not to the option the customer
   * picks — the same house, the same callout.
   *
   * Optional because a tier written before these fields existed carries neither.
   */
  discountAmount?: number;
  taxAmount?: number;
  totalAmount: number;
  isRecommended?: boolean;
}

export interface SignatureData {
  signedByName: string;
  signatureDataUrl: string;
  signedAt: string;
  ipAddress?: string;
}

export interface Estimate {
  _id: string;
  businessId: any;
  customerId: any;
  appointmentId?: any;
  estimateNumber: string;
  title: string;
  items: EstimateItem[];
  tiers?: EstimateTier[];
  selectedTierId?: 'good' | 'better' | 'best';
  subtotal: number;
  diagnosticFeeCredit: number;
  /** Also present as rows in `items`. See the same fields on `Invoice`. */
  emergencyFee: number;
  travelFee: number;
  discountType?: DiscountType;
  discountValue: number;
  discountAmount: number;
  discountReason?: string;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  terms: string;
  status: EstimateStatus;
  signature?: SignatureData;
  shareToken: string;
  sentAt?: string;
  viewedAt?: string;
  approvedAt?: string;
  expiresAt?: string;
  convertedInvoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEstimateInput {
  customerId: string;
  appointmentId?: string;
  title?: string;
  items: { description: string; quantity: number; unitPrice: number }[];
  tiers?: {
    tierId: 'good' | 'better' | 'best';
    name: string;
    badge?: string;
    description: string;
    items: { description: string; quantity: number; unitPrice: number }[];
    isRecommended?: boolean;
  }[];
  diagnosticFeeCredit?: number;
  /** A fraction — 0.0825 for 8.25%. Omit it and the business's configured rate applies. */
  taxRate?: number;
  /** Same overrides as `CreateInvoiceInput`, applied to every tier. */
  emergency?: boolean;
  emergencyFee?: number;
  travelFee?: number;
  discount?: DiscountInput;
  terms?: string;
  expiresInDays?: number;
}
