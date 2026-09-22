export type CallDirection = 'inbound' | 'outbound';

export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'busy'
  | 'no_answer'
  | 'cancelled';

export interface PhoneNumberCapabilities {
  voice: boolean;
  sms: boolean;
}

export interface BusinessPhoneNumber {
  _id: string;
  id?: string;
  businessId: string;
  provider: 'twilio';
  phoneNumber: string;
  phoneNumberSid?: string;
  friendlyName?: string;
  country: string;
  capabilities: PhoneNumberCapabilities;
  status: 'active' | 'inactive';
  voiceWebhookUrl?: string;
  smsWebhookUrl?: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CallCustomer {
  _id: string;
  id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export interface CallPhoneNumber {
  _id: string;
  phoneNumber: string;
  friendlyName?: string;
}

export interface CallLog {
  _id: string;
  id?: string;
  businessId: string;
  phoneNumberId?: CallPhoneNumber | string;
  provider: 'twilio';
  providerCallSid: string;
  direction: CallDirection;
  from: string;
  to: string;
  status: CallStatus;
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  durationSeconds: number;
  customerId?: CallCustomer | string;
  leadId?: string;
  appointmentId?: string;
  notes?: string;
  recordingUrl?: string;
  outcome?: string;
  aiHandled?: boolean;
  /** Owner-initiated test call. Excluded from stats and the call history list. */
  isTest?: boolean;
  transcript?: Array<{ role: 'assistant' | 'user' | 'system'; text: string; timestamp: string }>;
  toolExecutions?: Array<{ toolName: string; arguments: any; result: any; durationMs: number; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CallAnalyticsData {
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  answeredCalls: number;
  missedCalls: number;
  answerRate: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  aiHandledCalls: number;
  aiHandledPercentage: number;
  conversions: {
    appointmentsBooked: number;
    leadsCaptured: number;
    emergencyTransferred: number;
    bookingRate: number;
    leadCaptureRate: number;
  };
  outcomeDistribution: Record<string, number>;
  sentimentDistribution: Record<string, number>;
  peakHours: Array<{ hour: number; count: number }>;
}

export interface CallQuery {
  page?: number;
  limit?: number;
  search?: string;
  direction?: string;
  status?: string;
  date?: string; // YYYY-MM-DD
}

export interface PaginatedCallsResponse {
  success: boolean;
  calls: CallLog[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CallStats {
  total: number;
  inbound: number;
  completed: number;
  missed: number;
}

export interface AvailablePhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  capabilities: PhoneNumberCapabilities;
}

export interface TwilioConnectionStatus {
  success: boolean;
  configured: boolean;
  connected: boolean;
  accountName?: string;
  status?: string;
  message: string;
}

/**
 * Whether the business can place a real test call right now.
 *
 * `blockers` is written for the contractor, not the developer: each entry names
 * the specific thing to fix. An empty list means `ready` is true.
 */
export interface TestCallReadiness {
  ready: boolean;
  blockers: string[];
  telephonyConfigured: boolean;
  voiceProvider: string;
  voiceEngineReady: boolean;
  aiPhoneNumber: string | null;
  /** The number the assistant will dial. Chosen server side. */
  destinationPhone: string | null;
  callsRemainingThisHour: number;
}

export interface StartedTestCall {
  callId: string;
  callSid: string;
  to: string;
  from: string;
}
