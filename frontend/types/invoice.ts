export type InvoiceStatus = 'draft' | 'unpaid' | 'paid' | 'partially_paid' | 'cancelled';
export type PaymentMethod = 'card' | 'cash' | 'check' | 'bank_transfer' | 'other';

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
  taxRate?: number;
  dueDate?: string;
  notes?: string;
}
