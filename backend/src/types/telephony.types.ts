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
  createdAt: Date;
  updatedAt: Date;
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
