import { apiClient } from '../lib/api-client';

export interface DemoRequestPayload {
  fullName: string;
  businessName: string;
  trade: 'hvac' | 'plumbing' | 'electrical' | 'roofing' | 'multi_trade';
  phone: string;
  email: string;
  monthlyCalls: string;
  /** Honeypot: must stay empty. Bots that auto-fill every input get rejected. */
  companyWebsite?: string;
  sourcePath?: string;
}

export interface DemoRequestResponse {
  success: boolean;
  message: string;
  deduped: boolean;
}

export class MarketingService {
  /**
   * Submits a demo request from the public marketing site. This replaces the
   * previous behaviour where the form validated its input and then discarded it
   * in a console.log, so no lead ever reached the backend.
   */
  public static async submitDemoRequest(payload: DemoRequestPayload): Promise<DemoRequestResponse> {
    return apiClient.post<DemoRequestResponse>('/api/demo-requests', {
      ...payload,
      sourcePath:
        payload.sourcePath ??
        (typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined),
    });
  }
}
