import { Document, Types } from 'mongoose';

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

export interface IPhoneNumberCapabilities {
  voice: boolean;
  sms: boolean;
}

export interface IBusinessPhoneNumber extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  provider: 'twilio';
  phoneNumber: string; // E.164 format: +1XXXXXXXXXX
  phoneNumberSid?: string;
  friendlyName?: string;
  country: string;
  capabilities: IPhoneNumberCapabilities;
  status: 'active' | 'inactive';
  voiceWebhookUrl?: string;
  smsWebhookUrl?: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CallOutcome =
  | 'appointment_booked'
  | 'lead_captured'
  | 'inquiry_answered'
  | 'emergency_transferred'
  | 'missed_call'
  | 'hangup_or_spam';

export type CallSentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';

export interface ITranscriptTurn {
  role: 'assistant' | 'user' | 'system';
  text: string;
  timestamp: Date;
}

export interface IToolExecutionAudit {
  toolName: string;
  arguments: Record<string, any>;
  result: Record<string, any>;
  durationMs: number;
  timestamp: Date;
}

export interface ICallLog extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  phoneNumberId?: Types.ObjectId;
  provider: 'twilio';
  providerCallSid: string;
  direction: CallDirection;
  from: string; // Caller phone number
  to: string;   // Called business phone number
  status: CallStatus;
  startedAt: Date;
  answeredAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  customerId?: Types.ObjectId;
  leadId?: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  notes?: string;
  recordingUrl?: string;
  outcome?: CallOutcome;
  sentiment?: CallSentiment;
  summary?: string;
  aiHandled?: boolean;
  transcript?: ITranscriptTurn[];
  toolExecutions?: IToolExecutionAudit[];
  metrics?: ICallMetrics;
  /**
   * True for owner-initiated test calls. These are real calls through the real
   * pipeline, but they are excluded from reporting so a contractor trying the
   * assistant does not inflate their own answer rate or booking numbers.
   */
  isTest?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Whether a business can currently place a test call, and what is missing if not.
 */
export interface TestCallReadiness {
  ready: boolean;
  blockers: string[];
  telephonyConfigured: boolean;
  voiceProvider: string;
  voiceEngineReady: boolean;
  aiPhoneNumber: string | null;
  /** Destination the test call will dial. */
  destinationPhone: string | null;
  callsRemainingThisHour: number;
}

/**
 * Measured voice-engine performance and provider usage for one call. Populated
 * by the realtime voice provider so latency and spend are observable instead of
 * assumed.
 */
export interface ICallMetrics {
  avgTurnLatencyMs?: number;
  maxTurnLatencyMs?: number;
  turnCount?: number;
  sttAudioSeconds?: number;
  llmRequests?: number;
  llmPromptTokens?: number;
  llmCompletionTokens?: number;
  ttsCharacters?: number;
  providerErrors?: number;
  bargeInCount?: number;
  endedReason?: string;
}

export interface AssignPhoneNumberInput {
  phoneNumber: string;
  phoneNumberSid?: string;
  friendlyName?: string;
  country?: string;
  isPrimary?: boolean;
}

export interface CallQueryFilter {
  page?: string | number;
  limit?: string | number;
  search?: string;
  direction?: string;
  status?: string;
  date?: string; // YYYY-MM-DD
  customerId?: string;
  /** Pass 'true' to include owner-initiated test calls in the results. */
  includeTest?: string | boolean;
}

export interface AvailablePhoneNumberDTO {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  capabilities: IPhoneNumberCapabilities;
}

export interface TwilioWebhookVoiceBody {
  CallSid: string;
  AccountSid?: string;
  From: string;
  To: string;
  CallStatus?: string;
  Direction?: string;
  FromCity?: string;
  FromState?: string;
  FromCountry?: string;
  Duration?: string;
  CallDuration?: string;
}
