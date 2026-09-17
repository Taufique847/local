import { 
  Lead, 
  CreateLeadInput, 
  UpdateLeadInput, 
  LeadQuery, 
  PaginatedLeadsResponse, 
  LeadStats, 
  LeadStatus 
} from '../types/lead';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export class LeadService {
  // Get paginated leads with optional search & status/priority filters
  public static async getLeads(params?: LeadQuery): Promise<PaginatedLeadsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.priority && params.priority !== 'all') searchParams.set('priority', params.priority);
    if (params?.source && params.source !== 'all') searchParams.set('source', params.source);
    if (params?.customerId) searchParams.set('customerId', params.customerId);

    const res = await fetch(`${API_BASE_URL}/api/leads?${searchParams.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch leads');
    return json;
  }

  // Get lead statistics for dashboard and pipeline overview
  public static async getLeadStats(): Promise<LeadStats> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/leads/stats`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });

      if (!res.ok) {
        return {
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
      }
      const json = await res.json();
      return json.stats;
    } catch {
      return {
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
    }
  }

  // Get single lead by ID
  public static async getLeadById(id: string): Promise<Lead> {
    const res = await fetch(`${API_BASE_URL}/api/leads/${id}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Lead not found');
    return json.lead;
  }

  // Create lead
  public static async createLead(input: CreateLeadInput): Promise<Lead> {
    const res = await fetch(`${API_BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to create lead');
    return json.lead;
  }

  // Update lead
  public static async updateLead(id: string, input: UpdateLeadInput): Promise<Lead> {
    const res = await fetch(`${API_BASE_URL}/api/leads/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update lead');
    return json.lead;
  }

  // Update lead status
  public static async updateLeadStatus(id: string, status: LeadStatus): Promise<Lead> {
    const res = await fetch(`${API_BASE_URL}/api/leads/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update lead status');
    return json.lead;
  }

  // Archive lead (soft delete)
  public static async archiveLead(id: string): Promise<Lead> {
    const res = await fetch(`${API_BASE_URL}/api/leads/${id}`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to archive lead');
    return json.lead;
  }
}
