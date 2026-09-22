import { Estimate, CreateEstimateInput } from '../types/estimate';
import { apiClient } from '../lib/api-client';

export interface PaginatedEstimates {
  estimates: Estimate[];
  total: number;
  page: number;
  totalPages: number;
}

export class EstimateService {
  /**
   * Paginated estimate list.
   *
   * The unpaginated version returned every estimate the business had ever
   * raised, each with its full line items and populated customer, and the page
   * rendered all of them.
   */
  public static async getEstimates(
    params: { status?: string; search?: string; page?: number; limit?: number } = {}
  ): Promise<PaginatedEstimates> {
    const query = new URLSearchParams();
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    query.set('page', String(params.page ?? 1));
    query.set('limit', String(params.limit ?? 20));

    const json = await apiClient.get<Partial<PaginatedEstimates>>(
      `/api/estimates?${query.toString()}`
    );

    return {
      estimates: json.estimates ?? [],
      total: json.total ?? 0,
      page: json.page ?? 1,
      totalPages: json.totalPages ?? 1,
    };
  }

  public static async getEstimateById(id: string): Promise<Estimate> {
    const json = await apiClient.get<{ estimate: Estimate }>(`/api/estimates/${id}`);
    return json.estimate;
  }

  public static async createEstimate(input: CreateEstimateInput): Promise<Estimate> {
    const json = await apiClient.post<{ estimate: Estimate }>('/api/estimates', input);
    return json.estimate;
  }

  public static async convertToInvoice(id: string): Promise<{ estimate: Estimate; invoice: any }> {
    return apiClient.post<{ estimate: Estimate; invoice: any }>(`/api/estimates/${id}/convert`);
  }

  // --- Public customer portal. Authenticated by the share token in the URL. ---

  public static async getPublicEstimate(shareToken: string): Promise<any> {
    const json = await apiClient.get<{ estimate: any }>(`/api/portal/quotes/${shareToken}`);
    return json.estimate;
  }

  public static async approvePublicEstimate(
    shareToken: string,
    signature: { signedByName: string; signatureDataUrl: string; selectedTierId?: string }
  ): Promise<Estimate> {
    const json = await apiClient.post<{ estimate: Estimate }>(
      `/api/portal/quotes/${shareToken}/approve`,
      signature
    );
    return json.estimate;
  }
}
