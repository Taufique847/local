import { apiClient } from '../lib/api-client';

export type TagMatchMode = 'any' | 'all' | 'none';

/**
 * A customer filter, matching the backend's stored contract exactly.
 *
 * Kept in step with `backend/src/services/customer-filter.ts` by hand. The server
 * strips anything it does not recognise, so an extra field here is dropped silently
 * rather than saved — which is the safe direction, but it does mean a field added on
 * one side and not the other does nothing at all.
 */
export interface CustomerFilter {
  search?: string;
  status?: 'active' | 'inactive';
  propertyType?: 'residential' | 'commercial';
  tags?: string[];
  tagMode?: TagMatchMode;
  minLifetimeValue?: number;
  maxLifetimeValue?: number;
  /** ISO date. Last completed job on or after this. */
  servicedAfter?: string;
  /** ISO date. Last completed job on or before this — also matches never serviced. */
  servicedBefore?: string;
  neverServiced?: boolean;
  equipmentBrand?: string;
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
  filter: CustomerFilter;
  /** Recomputed server-side on every read, never cached. */
  count: number;
  lastCampaignAt?: string | null;
  createdAt: string;
}

export interface CampaignResult {
  audience: number;
  sent: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  /** Counts keyed by machine-readable reason, e.g. `customer_opted_out`. */
  reasons: Record<string, number>;
}

export interface SegmentPreview {
  count: number;
  customers: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    tags?: string[];
    lifetimeValue?: number;
    lastServiceAt?: string | null;
    isOptedOut?: boolean;
    emailOptedOut?: boolean;
  }>;
}

/** Human labels for why a recipient was not contacted. */
export const CAMPAIGN_REASON_LABELS: Record<string, string> = {
  customer_opted_out: 'Opted out of texts',
  email_unsubscribed: 'Unsubscribed from marketing email',
  quiet_hours: 'Outside texting hours',
  no_phone_number: 'No phone number',
  no_email_address: 'No email address',
  no_sending_number: 'No phone line connected',
  telephony_not_configured: 'Texting not configured on the server',
  email_not_configured: 'Email not configured on the server',
  channel_disabled_by_business: 'You have this channel switched off',
  no_template_for_channel: 'No message content',
  send_error: 'The provider rejected it',
  unexpected_error: 'Unexpected error',
};

export class SegmentService {
  public static async list(): Promise<Segment[]> {
    const json = await apiClient.get<{ segments?: Segment[] }>('/api/segments');
    return json.segments ?? [];
  }

  /**
   * Counts a filter that has not been saved.
   *
   * Uses the same query builder as the list and the campaign, so the number an
   * operator sees before pressing send is the number that gets sent to.
   */
  public static async count(filter: CustomerFilter): Promise<number> {
    const json = await apiClient.post<{ count?: number }>('/api/segments/count', { filter });
    return json.count ?? 0;
  }

  public static async create(input: {
    name: string;
    description?: string;
    filter: CustomerFilter;
  }): Promise<Segment> {
    const json = await apiClient.post<{ segment: Segment }>('/api/segments', input);
    return json.segment;
  }

  public static async update(
    id: string,
    input: { name?: string; description?: string; filter?: CustomerFilter }
  ): Promise<Segment> {
    const json = await apiClient.put<{ segment: Segment }>(`/api/segments/${id}`, input);
    return json.segment;
  }

  public static async remove(id: string): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/api/segments/${id}`);
  }

  public static async preview(id: string): Promise<SegmentPreview> {
    const json = await apiClient.get<SegmentPreview>(`/api/segments/${id}/preview`);
    return { count: json.count ?? 0, customers: json.customers ?? [] };
  }

  /**
   * Sends to everyone in the segment, one message per customer.
   *
   * Owner-only server-side. Quiet hours and the SMS opt-out are enforced per
   * recipient, so `sent` can legitimately be lower than `audience` — the reasons map
   * says why.
   */
  public static async sendCampaign(
    id: string,
    input: { channel: 'sms' | 'email'; body: string; subject?: string; dryRun?: boolean }
  ): Promise<CampaignResult> {
    const json = await apiClient.post<{ result: CampaignResult }>(
      `/api/segments/${id}/campaign`,
      input
    );
    return json.result;
  }
}
