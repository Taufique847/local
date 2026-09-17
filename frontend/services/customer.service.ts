import { Customer, CustomerInput, PaginatedCustomersResponse } from '../types/customer';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export class CustomerService {
  // Get paginated customers with optional search & status filter
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

    const res = await fetch(`${API_BASE_URL}/api/customers?${searchParams.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch customers');
    return json;
  }

  // Get customer statistics for dashboard
  public static async getCustomerStats(): Promise<{ total: number; active: number }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/customers/stats`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });

      if (!res.ok) return { total: 0, active: 0 };
      const json = await res.json();
      return json.stats || { total: 0, active: 0 };
    } catch {
      return { total: 0, active: 0 };
    }
  }

  // Get single customer
  public static async getCustomerById(id: string): Promise<Customer> {
    const res = await fetch(`${API_BASE_URL}/api/customers/${id}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Customer not found');
    return json.customer;
  }

  // Create customer
  public static async createCustomer(input: CustomerInput): Promise<Customer> {
    const res = await fetch(`${API_BASE_URL}/api/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to create customer');
    return json.customer;
  }

  // Update customer
  public static async updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer> {
    const res = await fetch(`${API_BASE_URL}/api/customers/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update customer');
    return json.customer;
  }

  // Delete customer
  public static async deleteCustomer(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/customers/${id}`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to delete customer');
    }
  }
}
