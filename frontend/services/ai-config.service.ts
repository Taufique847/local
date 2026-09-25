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
  /** Hours before an appointment that the reminder goes out. 1–168. */
  reminderLeadHours?: number;
  appointmentRemindersEnabled?: boolean;
}

export const POLICY_DEFAULTS: BusinessPolicy = {
  minBookingNoticeHours: 2,
  maxBookingHorizonDays: 30,
  emergencyKeywords: ['gas leak', 'carbon monoxide', 'sparks', 'smoke', 'flooding'],
  diagnosticFee: 89,
  emergencyFee: 149,
  aiDisclosureEnabled: true,
  reminderLeadHours: 24,
  appointmentRemindersEnabled: true,
};

// ---------------------------------------------------------------------------
// Per-business notification copy
// ---------------------------------------------------------------------------

export type MessageTemplateType =
  | 'appointment_confirmation'
  | 'appointment_reminder'
  | 'appointment_rescheduled'
  | 'appointment_cancelled'
  | 'missed_call_followup'
  | 'lead_followup'
  | 'estimate_sent'
  | 'invoice_issued'
  | 'payment_receipt';

export interface MessageTemplateRow {
  type: MessageTemplateType;
  channel: 'sms' | 'email';
  /** This business has saved its own copy or toggle for this pair. */
  customised: boolean;
  enabled: boolean;
  body: string;
  subject: string;
  /** The shipped wording, rendered with sample data. Read-only reference. */
  defaultPreview: string;
  defaultSubject: string;
  preview: string;
  previewSubject: string;
  /** False when the platform has no copy for this pair at all. */
  supported: boolean;
  onByDefault: boolean;
  variables: Array<{ name: string; label: string }>;
}

/** Human labels for each notification, and when it goes out. */
export const MESSAGE_TYPE_LABELS: Record<
  MessageTemplateType,
  { title: string; when: string }
> = {
  appointment_confirmation: {
    title: 'Booking confirmation',
    when: 'Immediately after an appointment is booked.',
  },
  appointment_reminder: {
    title: 'Appointment reminder',
    when: 'Ahead of the appointment, using the lead time below.',
  },
  appointment_rescheduled: {
    title: 'Appointment moved',
    when: 'When an appointment time changes.',
  },
  appointment_cancelled: {
    title: 'Appointment cancelled',
    when: 'When an appointment is cancelled.',
  },
  missed_call_followup: {
    title: 'Missed call follow-up',
    when: 'Within seconds of a call nobody answered. Text only.',
  },
  lead_followup: {
    title: 'New enquiry follow-up',
    when: 'After a new enquiry comes in. Text only.',
  },
  estimate_sent: { title: 'Quote sent', when: 'When a quote is created.' },
  invoice_issued: { title: 'Invoice sent', when: 'When an invoice is raised.' },
  payment_receipt: { title: 'Payment receipt', when: 'When a payment is recorded.' },
};

export class MessageTemplateService {
  public static async list(): Promise<MessageTemplateRow[]> {
    const json = await apiClient.get<{ templates?: MessageTemplateRow[] }>(
      '/api/message-templates'
    );
    return json.templates ?? [];
  }

  public static async save(input: {
    type: MessageTemplateType;
    channel: 'sms' | 'email';
    enabled: boolean;
    body?: string;
    subject?: string;
  }): Promise<void> {
    await apiClient.put<{ success: boolean }>('/api/message-templates', input);
  }

  /** Discards the override so the shipped wording applies again. */
  public static async reset(type: MessageTemplateType, channel: 'sms' | 'email'): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/api/message-templates/${type}/${channel}`);
  }

  /**
   * Renders draft copy with sample data.
   *
   * Server-side on purpose: it uses the same substitution the send path uses, so the
   * preview cannot disagree with what the customer receives the way a client-side
   * approximation eventually would.
   */
  public static async preview(input: {
    type: MessageTemplateType;
    body?: string;
    subject?: string;
  }): Promise<{ preview: string; previewSubject: string }> {
    const json = await apiClient.post<{ preview?: string; previewSubject?: string }>(
      '/api/message-templates/preview',
      input
    );
    return { preview: json.preview ?? '', previewSubject: json.previewSubject ?? '' };
  }
}

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
      // `??`, not `||`: a deliberate 1-hour lead time must not be read as unset.
      reminderLeadHours: p.reminderLeadHours ?? POLICY_DEFAULTS.reminderLeadHours,
      appointmentRemindersEnabled: p.appointmentRemindersEnabled ?? true,
    };
  }

  public static async update(policy: BusinessPolicy): Promise<BusinessPolicy> {
    const json = await apiClient.put<{ policy: BusinessPolicy }>('/api/policies', policy);
    return json.policy;
  }
}
