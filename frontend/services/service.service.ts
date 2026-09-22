import {
  Service,
  CreateServiceInput,
  UpdateServiceInput,
  ServiceStats,
  ServiceQuery,
  ServiceStatus,
  PaginatedServicesResponse,
} from '../types/service';
import { apiClient } from '../lib/api-client';

const EMPTY_STATS: ServiceStats = {
  total: 0,
  active: 0,
  inactive: 0,
  emergencyServices: 0,
  byCategory: {},
};

export class ServiceService {
  public static async getServices(params?: ServiceQuery): Promise<PaginatedServicesResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.category && params.category !== 'all') {
      searchParams.set('category', params.category);
    }
    if (params?.sort) searchParams.set('sort', params.sort);

    return apiClient.get<PaginatedServicesResponse>(`/api/services?${searchParams.toString()}`);
  }

  /** Feeds a KPI tile, so an outage degrades to zeros rather than breaking the page. */
  public static async getServiceStats(): Promise<ServiceStats> {
    try {
      const json = await apiClient.get<{ stats?: ServiceStats }>('/api/services/stats');
      return json.stats ?? EMPTY_STATS;
    } catch {
      return EMPTY_STATS;
    }
  }

  public static async getServiceById(id: string): Promise<Service> {
    const json = await apiClient.get<{ service: Service }>(`/api/services/${id}`);
    return json.service;
  }

  public static async createService(input: CreateServiceInput): Promise<Service> {
    const json = await apiClient.post<{ service: Service }>('/api/services', input);
    return json.service;
  }

  public static async updateService(id: string, input: UpdateServiceInput): Promise<Service> {
    const json = await apiClient.patch<{ service: Service }>(`/api/services/${id}`, input);
    return json.service;
  }

  public static async updateServiceStatus(id: string, status: ServiceStatus): Promise<Service> {
    const json = await apiClient.patch<{ service: Service }>(`/api/services/${id}/status`, {
      status,
    });
    return json.service;
  }

  /** Archive is a soft delete: the record stays for historical invoices. */
  public static async archiveService(id: string): Promise<Service> {
    const json = await apiClient.delete<{ service: Service }>(`/api/services/${id}`);
    return json.service;
  }
}
