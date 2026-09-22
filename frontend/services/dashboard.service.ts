import { apiClient } from '../lib/api-client';

export interface CallVolumePoint {
  day: string;
  date: string;
  inbound: number;
  aiBooked: number;
  smsRecovered: number;
}

export interface ServiceDistributionPoint {
  name: string;
  value: number;
}

export interface RevenueRecoveryPoint {
  week: string;
  revenueCollected: number;
  revenueRecovered: number;
}

export type ActivationStepId =
  | 'business_profile'
  | 'services'
  | 'phone_number'
  | 'knowledge_base'
  | 'test_call'
  | 'first_customer';

export interface ActivationStep {
  id: ActivationStepId;
  label: string;
  description: string;
  done: boolean;
  href: string;
}

export interface ActivationState {
  steps: ActivationStep[];
  completedCount: number;
  totalCount: number;
  isActivated: boolean;
}

export interface EntitlementState {
  allowed: boolean;
  reason?: 'subscription_inactive' | 'trial_expired' | 'minutes_exhausted';
  minutesUsed: number;
  minutesAllocated: number;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  trialEndsAt?: string;
}

/**
 * Measured operational KPIs. Any field may be null, which means "not enough
 * data yet" — the UI must render that state rather than substituting a number.
 */
export interface OperationalKpis {
  speedToLeadSeconds: number | null;
  aiResolutionRate: number | null;
  resolvedCalls: number;
  totalCalls: number;
  avgReviewRating: number | null;
  reviewResponses: number;
  shieldedNegativeCount: number;
  openEscalations: number;
  avgVoiceLatencyMs: number | null;
  telephonyConnected: boolean;
  voiceProvider: string;
}

export interface CallCostBreakdown {
  telephonyUsd: number;
  sttUsd: number;
  ttsUsd: number;
  llmUsd: number;
  totalUsd: number;
}

/**
 * Estimated provider spend. Derived from recorded usage times configured unit
 * prices, so it is an approximation of what the providers will bill, not an
 * invoice. Nullable fields mean "nothing to compute from yet".
 */
export interface CostSummary {
  periodDays: number;
  callCount: number;
  /** Calls with no usage counters recorded, so their cost is not represented. */
  callsMissingMetrics: number;
  totalMinutes: number;
  breakdown: CallCostBreakdown;
  avgCostPerCallUsd: number | null;
  avgCostPerMinuteUsd: number | null;
  planCostUsd: number | null;
  estimatedMarginUsd: number | null;
  currency: 'USD';
}

export interface DashboardOverview {
  callVolume: CallVolumePoint[];
  serviceDistribution: ServiceDistributionPoint[];
  revenueRecovery: RevenueRecoveryPoint[];
  activation: ActivationState;
  entitlement: EntitlementState;
  kpis: OperationalKpis;
}

export class DashboardService {
  /** Single round-trip for charts, activation checklist and entitlement state. */
  public static async getOverview(): Promise<DashboardOverview> {
    const json = await apiClient.get<{ success: boolean } & DashboardOverview>(
      '/api/dashboard/overview'
    );
    return {
      callVolume: json.callVolume ?? [],
      serviceDistribution: json.serviceDistribution ?? [],
      revenueRecovery: json.revenueRecovery ?? [],
      activation: json.activation,
      entitlement: json.entitlement,
      kpis: json.kpis,
    };
  }

  public static async getActivation(): Promise<ActivationState> {
    const json = await apiClient.get<{ success: boolean; activation: ActivationState }>(
      '/api/dashboard/activation'
    );
    return json.activation;
  }

  /** Estimated provider spend for the period, and how it compares with plan revenue. */
  public static async getCosts(days = 30): Promise<CostSummary> {
    const json = await apiClient.get<{ success: boolean; costs: CostSummary }>(
      `/api/dashboard/costs?days=${days}`
    );
    return json.costs;
  }
}
