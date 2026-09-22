import { Invoice, InvoiceStats, CreateInvoiceInput } from '../types/invoice';
import { apiClient } from '../lib/api-client';

export interface PaginatedInvoices {
  invoices: Invoice[];
  total: number;
  page: number;
  totalPages: number;
}

export class InvoiceService {
  /**
   * Paginated invoice list.
   *
   * The unpaginated version returned every invoice ever raised, each with line
   * items and a populated customer, in one response.
   */
  public static async getInvoices(
    params: { status?: string; search?: string; page?: number; limit?: number } = {}
  ): Promise<PaginatedInvoices> {
    const query = new URLSearchParams();
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    query.set('page', String(params.page ?? 1));
    query.set('limit', String(params.limit ?? 20));

    const json = await apiClient.get<Partial<PaginatedInvoices>>(
      `/api/invoices?${query.toString()}`
    );

    return {
      invoices: json.invoices ?? [],
      total: json.total ?? 0,
      page: json.page ?? 1,
      totalPages: json.totalPages ?? 1,
    };
  }

  public static async getInvoiceStats(): Promise<InvoiceStats> {
    const json = await apiClient.get<{ stats: InvoiceStats }>('/api/invoices/stats');
    return json.stats;
  }

  public static async getInvoiceById(id: string): Promise<Invoice> {
    const json = await apiClient.get<{ invoice: Invoice }>(`/api/invoices/${id}`);
    return json.invoice;
  }

  public static async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    const json = await apiClient.post<{ invoice: Invoice }>('/api/invoices', input);
    return json.invoice;
  }

  public static async recordManualPayment(
    id: string,
    data: { amount?: number; paymentMethod: string; paymentReference?: string }
  ): Promise<Invoice> {
    const json = await apiClient.post<{ invoice: Invoice }>(`/api/invoices/${id}/payment`, data);
    return json.invoice;
  }

  // ---------------------------------------------------------------------------
  // Public customer portal
  //
  // The share token in the URL is the sole authorization factor, so these calls
  // are deliberately unauthenticated.
  // ---------------------------------------------------------------------------

  public static async getPublicInvoice(shareToken: string): Promise<any> {
    const json = await apiClient.get<{ invoice: any }>(`/api/portal/invoices/${shareToken}`);
    return json.invoice;
  }

  /**
   * Starts a real Stripe Checkout session for a card payment and returns the URL
   * to redirect the homeowner to.
   *
   * Replaces the old `POST /pay` endpoint, which simply mutated `amountPaid` and
   * marked the invoice paid without taking any money.
   */
  public static async createPortalCheckout(
    shareToken: string
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    const json = await apiClient.post<{ checkoutUrl: string; sessionId: string }>(
      `/api/portal/invoices/${shareToken}/checkout`
    );
    return { checkoutUrl: json.checkoutUrl, sessionId: json.sessionId };
  }

  /**
   * Tells the contractor the homeowner intends to pay by check / cash / transfer.
   *
   * This does NOT clear the balance — an unauthenticated caller must never be
   * able to mark money as received. The contractor confirms receipt from the
   * dashboard.
   */
  public static async declareOfflinePayment(
    shareToken: string,
    paymentMethod: 'cash' | 'check' | 'bank_transfer' | 'other'
  ): Promise<{ invoiceNumber: string; pendingMethod: string; balanceDue: number }> {
    return apiClient.post<{ invoiceNumber: string; pendingMethod: string; balanceDue: number }>(
      `/api/portal/invoices/${shareToken}/declare-offline-payment`,
      { paymentMethod }
    );
  }
}
