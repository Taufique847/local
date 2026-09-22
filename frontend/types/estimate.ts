export type EstimateStatus = 'draft' | 'sent' | 'viewed' | 'approved' | 'rejected' | 'converted';

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
  taxRate?: number;
  terms?: string;
  expiresInDays?: number;
}
