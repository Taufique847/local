import { Customer, CustomerInput, PaginatedCustomersResponse } from '../types/customer';
import { apiClient } from '../lib/api-client';

export class CustomerService {
  public static async getCustomers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<PaginatedCustomersResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);

    return apiClient.get<PaginatedCustomersResponse>(`/api/customers?${searchParams.toString()}`);
  }

  /** Feeds a KPI tile, so it degrades to zeros rather than breaking the page. */
  public static async getCustomerStats(): Promise<{ total: number; active: number }> {
    try {
      const json = await apiClient.get<{ stats?: { total: number; active: number } }>(
        '/api/customers/stats'
      );
      return json.stats || { total: 0, active: 0 };
    } catch {
      return { total: 0, active: 0 };
    }
  }

  public static async getCustomerById(id: string): Promise<Customer> {
    const json = await apiClient.get<{ customer: Customer }>(`/api/customers/${id}`);
    return json.customer;
  }

  public static async createCustomer(input: CustomerInput): Promise<Customer> {
    const json = await apiClient.post<{ customer: Customer }>('/api/customers', input);
    return json.customer;
  }

  public static async updateCustomer(
    id: string,
    input: Partial<CustomerInput>
  ): Promise<Customer> {
    const json = await apiClient.patch<{ customer: Customer }>(`/api/customers/${id}`, input);
    return json.customer;
  }

  public static async deleteCustomer(id: string): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/api/customers/${id}`);
  }

  /** Unified profile: appointments, invoices, calls and memories in one call. */
  public static async getCustomer360(id: string): Promise<any> {
    return apiClient.get<any>(`/api/customers/${id}/360`);
  }

  public static async updateTags(id: string, tags: string[]): Promise<string[]> {
    const json = await apiClient.put<{ tags?: string[] }>(`/api/customers/${id}/tags`, { tags });
    return json.tags || [];
  }

  /**
   * Facts the assistant has learned about this customer.
   *
   * Returns an empty list on failure: this is supplementary context in a drawer,
   * not something worth failing the whole profile over.
   */
  public static async getCustomerMemories(id: string): Promise<any[]> {
    try {
      const json = await apiClient.get<{ memories?: any[] }>(`/api/customers/${id}/memories`);
      return json.memories || [];
    } catch {
      return [];
    }
  }

  /**
   * Permanently erases a customer's personal data.
   *
   * Used to satisfy a deletion request. Financial records are retained in
   * anonymised form because a business must keep them; see the backend for what
   * is kept versus scrubbed.
   */
  public static async erasePersonalData(
    id: string
  ): Promise<{ appointmentsAnonymised: number; invoicesAnonymised: number }> {
    return apiClient.post<{ appointmentsAnonymised: number; invoicesAnonymised: number }>(
      `/api/customers/${id}/erase`
    );
  }
}
