import {
  BusinessPhoneNumber,
  CallLog,
  CallQuery,
  CallStats,
  PaginatedCallsResponse,
  AvailablePhoneNumber,
  TwilioConnectionStatus,
  TestCallReadiness,
  StartedTestCall,
} from '../types/telephony';
import { apiClient } from '../lib/api-client';

/** Fallback used where an unavailable stats endpoint should not blank the page. */
const EMPTY_CALL_STATS: CallStats = { total: 0, inbound: 0, completed: 0, missed: 0 };

export class TelephonyService {
  public static async getPhoneNumbers(): Promise<BusinessPhoneNumber[]> {
    const json = await apiClient.get<{ phoneNumbers?: BusinessPhoneNumber[] }>(
      '/api/phone-numbers'
    );
    return json.phoneNumbers || [];
  }

  /** Null when the business has not connected a line yet, which is a normal state. */
  public static async getPrimaryPhoneNumber(): Promise<BusinessPhoneNumber | null> {
    try {
      const json = await apiClient.get<{ phoneNumber?: BusinessPhoneNumber }>(
        '/api/phone-numbers/primary'
      );
      return json.phoneNumber || null;
    } catch {
      return null;
    }
  }

  public static async getConnectionStatus(): Promise<TwilioConnectionStatus> {
    return apiClient.get<TwilioConnectionStatus>('/api/phone-numbers/status');
  }

  /**
   * Numbers available to buy.
   *
   * Errors now propagate: the backend refuses rather than inventing inventory
   * when Twilio is unconfigured, and the UI needs to show that reason.
   */
  public static async searchAvailableNumbers(
    country: string = 'US',
    areaCode?: string | number
  ): Promise<AvailablePhoneNumber[]> {
    const params = new URLSearchParams({ country });
    if (areaCode) params.set('areaCode', areaCode.toString());

    const json = await apiClient.get<{ availableNumbers?: AvailablePhoneNumber[] }>(
      `/api/phone-numbers/available?${params.toString()}`
    );
    return json.availableNumbers || [];
  }

  public static async provisionNumber(phoneNumber: string): Promise<BusinessPhoneNumber> {
    const json = await apiClient.post<{ phoneNumber: BusinessPhoneNumber }>(
      '/api/phone-numbers/provision',
      { phoneNumber }
    );
    return json.phoneNumber;
  }

  /** Registers a line the business already owns elsewhere. */
  public static async assignNumber(input: {
    phoneNumber: string;
    phoneNumberSid?: string;
    friendlyName?: string;
    isPrimary?: boolean;
  }): Promise<BusinessPhoneNumber> {
    const json = await apiClient.post<{ phoneNumber: BusinessPhoneNumber }>(
      '/api/phone-numbers',
      input
    );
    return json.phoneNumber;
  }

  public static async setPrimaryNumber(id: string): Promise<BusinessPhoneNumber> {
    const json = await apiClient.patch<{ phoneNumber: BusinessPhoneNumber }>(
      `/api/phone-numbers/${id}/primary`
    );
    return json.phoneNumber;
  }

  public static async deleteNumber(id: string): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/api/phone-numbers/${id}`);
  }

  public static async getCalls(params?: CallQuery): Promise<PaginatedCallsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.direction && params.direction !== 'all') {
      searchParams.set('direction', params.direction);
    }
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.date) searchParams.set('date', params.date);

    return apiClient.get<PaginatedCallsResponse>(`/api/calls?${searchParams.toString()}`);
  }

  public static async getCallStats(): Promise<CallStats> {
    try {
      const json = await apiClient.get<{ stats?: CallStats }>('/api/calls/stats');
      return json.stats || EMPTY_CALL_STATS;
    } catch {
      return EMPTY_CALL_STATS;
    }
  }

  public static async getCallById(id: string): Promise<CallLog> {
    const json = await apiClient.get<{ call: CallLog }>(`/api/calls/${id}`);
    return json.call;
  }

  /**
   * Whether a real test call can be placed, and what is missing if not.
   *
   * Replaces the old `simulateCall`, which posted a browser-invented transcript
   * to `/api/calls/simulate` and had it stored as a genuine AI-handled call.
   */
  public static async getTestCallReadiness(): Promise<TestCallReadiness> {
    const json = await apiClient.get<{ readiness: TestCallReadiness }>(
      '/api/calls/test-call/readiness'
    );
    return json.readiness;
  }

  /**
   * Places a real call from the business AI line to the owner's registered
   * number. The destination is chosen by the server, not the browser.
   */
  public static async startTestCall(): Promise<StartedTestCall> {
    return apiClient.post<StartedTestCall>('/api/calls/test-call', {});
  }

  public static async getCallTranscript(id: string): Promise<any> {
    return apiClient.get<any>(`/api/calls/${id}/transcript`);
  }

  public static async getAnalytics(days: number = 30): Promise<any> {
    const json = await apiClient.get<{ analytics: any }>(
      `/api/calls/analytics/summary?days=${days}`
    );
    return json.analytics;
  }

  /**
   * Conversation QA summary.
   *
   * Returns empty counters rather than throwing, because this feeds a secondary
   * panel that should not take down the calls page.
   */
  public static async getQASummary(): Promise<any> {
    try {
      const json = await apiClient.get<any>('/api/calls/qa/summary');
      return json.summary || json;
    } catch {
      return {
        totalEvaluated: 0,
        averageResolutionScore: null,
        complianceRate: null,
        flaggedCount: 0,
        recentFlagged: [],
      };
    }
  }

  public static async getQAReviews(flaggedOnly: boolean = false): Promise<any> {
    try {
      return await apiClient.get<any>(`/api/calls/qa?flaggedOnly=${flaggedOnly}&limit=20`);
    } catch {
      return { items: [], total: 0 };
    }
  }
}
