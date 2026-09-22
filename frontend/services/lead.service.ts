import {
  Lead,
  CreateLeadInput,
  UpdateLeadInput,
  LeadQuery,
  PaginatedLeadsResponse,
  LeadStats,
  LeadStatus,
} from '../types/lead';
import { apiClient } from '../lib/api-client';

const EMPTY_STATS: LeadStats = {
  total: 0,
  active: 0,
  byStatus: {
    new: 0,
    contacted: 0,
    qualified: 0,
    quoted: 0,
    won: 0,
    lost: 0,
    archived: 0,
  },
};

export class LeadService {
  public static async getLeads(params?: LeadQuery): Promise<PaginatedLeadsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.priority && params.priority !== 'all') {
      searchParams.set('priority', params.priority);
    }
    if (params?.source && params.source !== 'all') searchParams.set('source', params.source);
    if (params?.customerId) searchParams.set('customerId', params.customerId);

    return apiClient.get<PaginatedLeadsResponse>(`/api/leads?${searchParams.toString()}`);
  }

  /** Feeds pipeline tiles, so it degrades to zeros rather than breaking the page. */
  public static async getLeadStats(): Promise<LeadStats> {
    try {
      const json = await apiClient.get<{ stats?: LeadStats }>('/api/leads/stats');
      return json.stats ?? EMPTY_STATS;
    } catch {
      return EMPTY_STATS;
    }
  }

  public static async getLeadById(id: string): Promise<Lead> {
    const json = await apiClient.get<{ lead: Lead }>(`/api/leads/${id}`);
    return json.lead;
  }

  public static async createLead(input: CreateLeadInput): Promise<Lead> {
    const json = await apiClient.post<{ lead: Lead }>('/api/leads', input);
    return json.lead;
  }

  public static async updateLead(id: string, input: UpdateLeadInput): Promise<Lead> {
    const json = await apiClient.patch<{ lead: Lead }>(`/api/leads/${id}`, input);
    return json.lead;
  }

  public static async updateLeadStatus(id: string, status: LeadStatus): Promise<Lead> {
    const json = await apiClient.patch<{ lead: Lead }>(`/api/leads/${id}/status`, { status });
    return json.lead;
  }

  /** Archive is a soft delete: the lead stays for pipeline history. */
  public static async archiveLead(id: string): Promise<Lead> {
    const json = await apiClient.delete<{ lead: Lead }>(`/api/leads/${id}`);
    return json.lead;
  }
}
