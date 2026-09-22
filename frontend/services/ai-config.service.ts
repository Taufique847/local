import { apiClient } from '../lib/api-client';

// ---------------------------------------------------------------------------
// Knowledge base (the verified answers the AI is allowed to give)
// ---------------------------------------------------------------------------

export interface KnowledgeItem {
  _id: string;
  question: string;
  answer: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export class KnowledgeService {
  public static async list(): Promise<KnowledgeItem[]> {
    const json = await apiClient.get<{ items?: KnowledgeItem[] }>('/api/knowledge');
    return json.items ?? [];
  }

  public static async create(input: {
    question: string;
    answer: string;
    category?: string;
  }): Promise<KnowledgeItem> {
    const json = await apiClient.post<{ item: KnowledgeItem }>('/api/knowledge', input);
    return json.item;
  }

  public static async remove(id: string): Promise<void> {
    await apiClient.delete(`/api/knowledge/${id}`);
  }
}

// ---------------------------------------------------------------------------
// Guardrail policy
// ---------------------------------------------------------------------------

/**
 * Field names match backend/src/models/business-policy.model.ts exactly.
 *
 * This matters: the settings UI used to post `minAdvanceNoticeHours`, which is
 * not a field on that schema, so Mongoose silently discarded it on every save.
 */
export interface BusinessPolicy {
  minBookingNoticeHours: number;
  maxBookingHorizonDays: number;
  emergencyKeywords: string[];
  diagnosticFee: number;
  emergencyFee: number;
  requireDiagnosticBeforePricing?: boolean;
  afterHoursDispatchEnabled?: boolean;
  emergencyTransferPhone?: string;
  prohibitedClaims?: string[];
  /** Plays a spoken "automated assistant, call is recorded" notice before the AI answers. */
  aiDisclosureEnabled?: boolean;
  aiDisclosureText?: string;
}

export const POLICY_DEFAULTS: BusinessPolicy = {
  minBookingNoticeHours: 2,
  maxBookingHorizonDays: 30,
  emergencyKeywords: ['gas leak', 'carbon monoxide', 'sparks', 'smoke', 'flooding'],
  diagnosticFee: 89,
  emergencyFee: 149,
  aiDisclosureEnabled: true,
};

export class PolicyService {
  public static async get(): Promise<BusinessPolicy> {
    const json = await apiClient.get<{ policy?: Partial<BusinessPolicy> }>('/api/policies');
    const p = json.policy ?? {};

    return {
      minBookingNoticeHours: p.minBookingNoticeHours ?? POLICY_DEFAULTS.minBookingNoticeHours,
      maxBookingHorizonDays: p.maxBookingHorizonDays ?? POLICY_DEFAULTS.maxBookingHorizonDays,
      emergencyKeywords:
        p.emergencyKeywords && p.emergencyKeywords.length > 0
          ? p.emergencyKeywords
          : POLICY_DEFAULTS.emergencyKeywords,
      diagnosticFee: p.diagnosticFee ?? POLICY_DEFAULTS.diagnosticFee,
      emergencyFee: p.emergencyFee ?? POLICY_DEFAULTS.emergencyFee,
      requireDiagnosticBeforePricing: p.requireDiagnosticBeforePricing,
      afterHoursDispatchEnabled: p.afterHoursDispatchEnabled,
      emergencyTransferPhone: p.emergencyTransferPhone,
      prohibitedClaims: p.prohibitedClaims,
      // Defaults to on. Absent means the business has never saved policy, and
      // announcing is the safe default in all-party consent states.
      aiDisclosureEnabled: p.aiDisclosureEnabled ?? true,
      aiDisclosureText: p.aiDisclosureText,
    };
  }

  public static async update(policy: BusinessPolicy): Promise<BusinessPolicy> {
    const json = await apiClient.put<{ policy: BusinessPolicy }>('/api/policies', policy);
    return json.policy;
  }
}
