import { apiClient } from '../lib/api-client';

// ---------------------------------------------------------------------------
// Messages (SMS log)
// ---------------------------------------------------------------------------

export interface MessageLog {
  _id: string;
  direction: 'inbound' | 'outbound';
  channel: string;
  type: string;
  from: string;
  to: string;
  body: string;
  status: string;
  twilioSid?: string;
  /**
   * Populated when a send failed. `errorCode` is 'telephony_not_configured' for
   * a server misconfiguration, otherwise a Twilio error code.
   */
  errorCode?: string;
  errorMessage?: string;
  /** Email only. */
  subject?: string;
  /** Inbound only: nothing automated understood it, so a person has to read it. */
  needsAttention?: boolean;
  customerId?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
  } | string | null;
  createdAt: string;
}

export class MessageService {
  public static async list(
    params: { limit?: number; direction?: string; channel?: string } = {}
  ): Promise<{
    messages: MessageLog[];
    total: number;
  }> {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', String(params.limit));
    if (params.direction && params.direction !== 'all') query.set('direction', params.direction);
    if (params.channel && params.channel !== 'all') query.set('channel', params.channel);

    const json = await apiClient.get<{ messages?: MessageLog[]; total?: number }>(
      `/api/messages?${query.toString()}`
    );
    return { messages: json.messages ?? [], total: json.total ?? 0 };
  }

  public static async send(input: {
    to: string;
    body: string;
    customerId?: string;
  }): Promise<MessageLog> {
    const json = await apiClient.post<{ message: MessageLog }>('/api/messages/send', input);
    return json.message;
  }

  /**
   * Inbound messages no automated handler could answer.
   *
   * Its own endpoint rather than a filter on the list, because the point is that
   * it is short and can be emptied. These used to be logged and dropped: the
   * customer got no reply and nobody was told a question had been asked.
   */
  public static async needsAttention(): Promise<{ messages: MessageLog[]; total: number }> {
    const json = await apiClient.get<{ messages?: MessageLog[]; total?: number }>(
      '/api/messages/needs-attention'
    );
    return { messages: json.messages ?? [], total: json.total ?? 0 };
  }

  public static async resolveAttention(id: string): Promise<void> {
    await apiClient.post<{ success: boolean }>(`/api/messages/${id}/resolve-attention`, {});
  }
}

// ---------------------------------------------------------------------------
// Reschedule requests
// ---------------------------------------------------------------------------

export interface RescheduleRequestItem {
  _id: string;
  status: 'pending' | 'applied' | 'dismissed';
  source: 'sms' | 'email' | 'phone' | 'portal';
  requestText?: string;
  originalStartAt: string;
  offeredSlots: Array<{ startAt: string; endAt: string }>;
  appliedStartAt?: string | null;
  createdAt: string;
  customerId?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
  } | null;
  appointmentId?: {
    _id: string;
    title?: string;
    startAt: string;
    endAt: string;
    status: string;
    technicianName?: string;
  } | null;
}

export class RescheduleRequestService {
  public static async list(
    status: 'pending' | 'applied' | 'dismissed' | 'all' = 'pending'
  ): Promise<{ requests: RescheduleRequestItem[]; total: number }> {
    const json = await apiClient.get<{ requests?: RescheduleRequestItem[]; total?: number }>(
      `/api/reschedule-requests?status=${status}`
    );
    return { requests: json.requests ?? [], total: json.total ?? 0 };
  }

  /**
   * Applies a request by moving the appointment.
   *
   * Goes through the same reschedule endpoint the calendar uses, so the booking
   * lock, the conflict re-check, the opening-hours check and the reschedule history
   * all apply — and the customer is notified from the one place that sends it.
   */
  public static async apply(id: string, startAt: string, endAt?: string): Promise<void> {
    await apiClient.post<{ success: boolean }>(`/api/reschedule-requests/${id}/apply`, {
      startAt,
      ...(endAt ? { endAt } : {}),
    });
  }

  public static async dismiss(id: string): Promise<void> {
    await apiClient.post<{ success: boolean }>(`/api/reschedule-requests/${id}/dismiss`, {});
  }
}

// ---------------------------------------------------------------------------
// Speed-to-lead recovery
// ---------------------------------------------------------------------------

export type RecoveryStatus =
  | 'pending'
  | 'speed_to_lead_sent'
  | 'drip_step_2_sent'
  | 'drip_step_3_sent'
  | 'recovered_booked'
  | 'recovered_responded'
  | 'expired'
  | 'opted_out';

export interface RecoveryCampaign {
  _id: string;
  callerPhone: string;
  customerName?: string;
  status: RecoveryStatus;
  currentStep: number;
  speedToLeadSentAt?: string;
  nextFollowUpAt?: string;
  messages: Array<{ direction: 'inbound' | 'outbound'; text: string; sentAt: string }>;
  recoveredAppointmentId?: { startAt: string; title: string; status: string } | string | null;
  createdAt: string;
}

export interface RecoveryStats {
  totalInitiated: number;
  totalRecovered: number;
  recoveryRate: number;
  estimatedRevenueSaved: number;
  campaigns: RecoveryCampaign[];
}

export class RecoveryService {
  /** Stats endpoint also returns the 20 most recent campaigns. */
  public static async getStats(): Promise<RecoveryStats> {
    const json = await apiClient.get<RecoveryStats & { success: boolean }>('/api/recovery/stats');
    return {
      totalInitiated: json.totalInitiated ?? 0,
      totalRecovered: json.totalRecovered ?? 0,
      recoveryRate: json.recoveryRate ?? 0,
      estimatedRevenueSaved: json.estimatedRevenueSaved ?? 0,
      campaigns: json.campaigns ?? [],
    };
  }

  /**
   * Runs the drip processor immediately instead of waiting for the scheduler's
   * next tick. Useful for verifying the flow.
   */
  public static async processDripsNow(): Promise<number> {
    const json = await apiClient.post<{ processedCount: number }>('/api/recovery/process-drips');
    return json.processedCount ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Reviews / reputation
// ---------------------------------------------------------------------------

export type ReviewCampaignStatus =
  | 'pending'
  | 'survey_sent'
  | 'positive_redirected'
  | 'negative_shielded'
  | 'resolved';

export interface ReviewCampaign {
  _id: string;
  customerPhone: string;
  customerName?: string;
  technicianName?: string;
  rating?: number;
  feedbackText?: string;
  status: ReviewCampaignStatus;
  scheduledAt?: string;
  surveySentAt?: string;
  respondedAt?: string;
  isShielded: boolean;
  escalatedToOwner: boolean;
  escalationNotes?: string;
  slaDeadlineAt?: string;
  slaBreached?: boolean;
  googleReviewUrl?: string;
  createdAt: string;
}

export interface ReputationStats {
  totalSurveysSent: number;
  totalResponses: number;
  responseRate: number;
  averageRating: number;
  positiveRedirectedCount: number;
  negativeShieldedCount: number;
  ratingBreakdown: {
    fiveStar: number;
    fourStar: number;
    threeStar: number;
    twoStar: number;
    oneStar: number;
  };
  resolvedCount: number;
}

export class ReviewService {
  public static async getStats(): Promise<ReputationStats | null> {
    try {
      const json = await apiClient.get<{ stats?: ReputationStats } & ReputationStats>(
        '/api/reviews/stats'
      );
      return (json.stats ?? json) as ReputationStats;
    } catch {
      return null;
    }
  }

  public static async list(): Promise<ReviewCampaign[]> {
    const json = await apiClient.get<{ campaigns?: ReviewCampaign[]; items?: ReviewCampaign[] }>(
      '/api/reviews'
    );
    return json.campaigns ?? json.items ?? [];
  }

  /**
   * Marks a shielded negative review as resolved by the owner.
   * The backend requires `notes` — it is the audit trail for how the complaint
   * was handled.
   */
  public static async resolve(id: string, notes: string): Promise<ReviewCampaign> {
    const json = await apiClient.post<{ campaign: ReviewCampaign }>(`/api/reviews/${id}/resolve`, {
      notes,
    });
    return json.campaign;
  }

  /** Re-runs the SLA breach sweep for this business. */
  public static async checkSla(): Promise<number> {
    const json = await apiClient.post<{ breachedCount: number }>('/api/reviews/check-sla');
    return json.breachedCount ?? 0;
  }

  /** Sends the post-service survey for an appointment immediately. */
  public static async triggerSurvey(appointmentId: string): Promise<void> {
    await apiClient.post('/api/reviews/trigger', { appointmentId });
  }
}

// ---------------------------------------------------------------------------
// Dispatch zones & technicians
// ---------------------------------------------------------------------------

export interface ServiceZone {
  _id: string;
  name: string;
  zipCodes: string[];
  travelBufferMinutes: number;
  active: boolean;
  createdAt: string;
}

export interface Technician {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  skills: string[];
  status: string;
  active: boolean;
}

export class DispatchService {
  public static async getZones(): Promise<ServiceZone[]> {
    const json = await apiClient.get<{ zones?: ServiceZone[] }>('/api/dispatch/zones');
    return json.zones ?? [];
  }

  public static async createZone(input: {
    name: string;
    zipCodes: string[];
    travelBufferMinutes?: number;
  }): Promise<ServiceZone> {
    const json = await apiClient.post<{ zone: ServiceZone }>('/api/dispatch/zones', input);
    return json.zone;
  }

  public static async deleteZone(id: string): Promise<void> {
    await apiClient.delete(`/api/dispatch/zones/${id}`);
  }

  public static async getTechnicians(): Promise<Technician[]> {
    const json = await apiClient.get<{ technicians?: Technician[] }>('/api/dispatch/technicians');
    return json.technicians ?? [];
  }

  public static async createTechnician(input: {
    name: string;
    phone: string;
    email?: string;
    skills?: string[];
  }): Promise<Technician> {
    const json = await apiClient.post<{ technician: Technician }>(
      '/api/dispatch/technicians',
      input
    );
    return json.technician;
  }
}
