import {
  Service,
  CreateServiceInput,
  UpdateServiceInput,
  ServiceStats,
  ServiceQuery,
  ServiceStatus,
  PaginatedServicesResponse,
} from '../types/service';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export class ServiceService {
  // Get paginated services with optional search, status, category filters
  public static async getServices(params?: ServiceQuery): Promise<PaginatedServicesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.category && params.category !== 'all') searchParams.set('category', params.category);
    if (params?.sort) searchParams.set('sort', params.sort);

    const res = await fetch(`${API_BASE_URL}/api/services?${searchParams.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch services');
    return json;
  }

  // Get service statistics for dashboard KPI
  public static async getServiceStats(): Promise<ServiceStats> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/services/stats`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });

      if (!res.ok) {
        return { total: 0, active: 0, inactive: 0, emergencyServices: 0, byCategory: {} };
      }
      const json = await res.json();
      return json.stats;
    } catch {
      return { total: 0, active: 0, inactive: 0, emergencyServices: 0, byCategory: {} };
    }
  }

  // Get single service by ID
  public static async getServiceById(id: string): Promise<Service> {
    const res = await fetch(`${API_BASE_URL}/api/services/${id}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Service not found');
    return json.service;
  }

  // Create a new service
  public static async createService(input: CreateServiceInput): Promise<Service> {
    const res = await fetch(`${API_BASE_URL}/api/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to create service');
    return json.service;
  }

  // Update an existing service
  public static async updateService(id: string, input: UpdateServiceInput): Promise<Service> {
    const res = await fetch(`${API_BASE_URL}/api/services/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update service');
    return json.service;
  }

  // Quick status toggle (active/inactive)
  public static async updateServiceStatus(id: string, status: ServiceStatus): Promise<Service> {
    const res = await fetch(`${API_BASE_URL}/api/services/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update service status');
    return json.service;
  }

  // Archive (soft-delete) a service
  public static async archiveService(id: string): Promise<Service> {
    const res = await fetch(`${API_BASE_URL}/api/services/${id}`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to archive service');
    return json.service;
  }
}
