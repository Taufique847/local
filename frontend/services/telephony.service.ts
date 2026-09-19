import {
  BusinessPhoneNumber,
  CallLog,
  CallQuery,
  CallStats,
  PaginatedCallsResponse,
  AvailablePhoneNumber,
  TwilioConnectionStatus,
} from '../types/telephony';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export class TelephonyService {
  // Get all phone numbers assigned to the business
  public static async getPhoneNumbers(): Promise<BusinessPhoneNumber[]> {
    const res = await fetch(`${API_BASE_URL}/api/phone-numbers`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch phone numbers');
    return json.phoneNumbers || [];
  }

  // Get primary phone number
  public static async getPrimaryPhoneNumber(): Promise<BusinessPhoneNumber | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/phone-numbers/primary`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });

      if (!res.ok) return null;
      const json = await res.json();
      return json.phoneNumber || null;
    } catch {
      return null;
    }
  }

  // Check Twilio connection status
  public static async getConnectionStatus(): Promise<TwilioConnectionStatus> {
    const res = await fetch(`${API_BASE_URL}/api/phone-numbers/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    return json;
  }

  // Search available numbers to buy/provision
  public static async searchAvailableNumbers(
    country: string = 'US',
    areaCode?: string | number
  ): Promise<AvailablePhoneNumber[]> {
    const params = new URLSearchParams({ country });
    if (areaCode) params.set('areaCode', areaCode.toString());

    const res = await fetch(`${API_BASE_URL}/api/phone-numbers/available?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to search phone numbers');
    return json.availableNumbers || [];
  }

  // Provision / Purchase phone number
  public static async provisionNumber(phoneNumber: string): Promise<BusinessPhoneNumber> {
    const res = await fetch(`${API_BASE_URL}/api/phone-numbers/provision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ phoneNumber }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to provision number');
    return json.phoneNumber;
  }

  // Manually connect an existing phone number
  public static async assignNumber(input: {
    phoneNumber: string;
    phoneNumberSid?: string;
    friendlyName?: string;
    isPrimary?: boolean;
  }): Promise<BusinessPhoneNumber> {
    const res = await fetch(`${API_BASE_URL}/api/phone-numbers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to connect phone number');
    return json.phoneNumber;
  }

  // Set primary phone number
  public static async setPrimaryNumber(id: string): Promise<BusinessPhoneNumber> {
    const res = await fetch(`${API_BASE_URL}/api/phone-numbers/${id}/primary`, {
      method: 'PATCH',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to set primary number');
    return json.phoneNumber;
  }

  // Delete phone number
  public static async deleteNumber(id: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/phone-numbers/${id}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to delete phone number');
  }

  // Get call logs with pagination & filters
  public static async getCalls(params?: CallQuery): Promise<PaginatedCallsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.direction && params.direction !== 'all') searchParams.set('direction', params.direction);
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params?.date) searchParams.set('date', params.date);

    const res = await fetch(`${API_BASE_URL}/api/calls?${searchParams.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch calls');
    return json;
  }

  // Get call statistics
  public static async getCallStats(): Promise<CallStats> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/calls/stats`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });

      if (!res.ok) return { total: 0, inbound: 0, completed: 0, missed: 0 };
      const json = await res.json();
      return json.stats || { total: 0, inbound: 0, completed: 0, missed: 0 };
    } catch {
      return { total: 0, inbound: 0, completed: 0, missed: 0 };
    }
  }

  // Get single call details
  public static async getCallById(id: string): Promise<CallLog> {
    const res = await fetch(`${API_BASE_URL}/api/calls/${id}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch call record');
    return json.call;
  }

  // Simulate an inbound test call
  public static async simulateCall(callerPhone: string, durationSeconds: number = 60): Promise<CallLog> {
    const res = await fetch(`${API_BASE_URL}/api/calls/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ callerPhone, durationSeconds }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to simulate call');
    return json.call;
  }

  // Get full call transcript and tool executions (M15)
  public static async getCallTranscript(id: string): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/calls/${id}/transcript`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch transcript');
    return json;
  }

  // Get conversation intelligence analytics (M15)
  public static async getAnalytics(days: number = 30): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/api/calls/analytics/summary?days=${days}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch call analytics');
    return json.analytics;
  }

  // M20/M25: Get AI Conversation QA Quality Summary
  public static async getQASummary(): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/calls/qa/summary`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });

      const json = await res.json();
      if (!res.ok) return { totalEvaluated: 0, averageResolutionScore: 100, complianceRate: 100, flaggedCount: 0, recentFlagged: [] };
      return json.summary || json;
    } catch {
      return { totalEvaluated: 0, averageResolutionScore: 100, complianceRate: 100, flaggedCount: 0, recentFlagged: [] };
    }
  }

  // M20/M25: List QA Reviews & Flagged Calls with Coaching Notes
  public static async getQAReviews(flaggedOnly: boolean = false): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/calls/qa?flaggedOnly=${flaggedOnly}&limit=20`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });

      const json = await res.json();
      if (!res.ok) return { items: [], total: 0 };
      return json;
    } catch {
      return { items: [], total: 0 };
    }
  }
}
