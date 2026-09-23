import { Document, Types } from 'mongoose';

export type MessageDirection = 'inbound' | 'outbound';
export type MessageChannel = 'sms' | 'email';
export type MessageType =
  | 'appointment_confirmation'
  | 'appointment_reminder'
  | 'appointment_rescheduled'
  | 'appointment_cancelled'
  | 'missed_call_followup'
  | 'lead_followup'
  /**
   * Customer-facing document and money notifications.
   *
   * These three had no sender at all: an estimate could be marked sent, an
   * invoice issued and a payment recorded without the customer ever being told,
   * and the share links that make the portal usable were only ever surfaced in
   * the owner's own UI.
   */
  | 'estimate_sent'
  | 'invoice_issued'
  | 'payment_receipt'
  | 'custom';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'received';

/** Every message type this platform can send, for iteration and validation. */
export const MESSAGE_TYPES: MessageType[] = [
  'appointment_confirmation',
  'appointment_reminder',
  'appointment_rescheduled',
  'appointment_cancelled',
  'missed_call_followup',
  'lead_followup',
  'estimate_sent',
  'invoice_issued',
  'payment_receipt',
  'custom',
];

export const MESSAGE_CHANNELS: MessageChannel[] = ['sms', 'email'];

/**
 * The longest body each channel will accept.
 *
 * SMS stays at the Twilio concatenated-segment ceiling. Email needs far more
 * room than that — the 1600 cap was an SMS constraint applied to the shared log,
 * so an email body of any realistic length failed schema validation and the
 * email channel could not be recorded.
 */
export const CHANNEL_BODY_LIMIT: Record<MessageChannel, number> = {
  sms: 1600,
  email: 20000,
};

export interface ICommunicationLog extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId?: Types.ObjectId;
  leadId?: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  direction: MessageDirection;
  channel: MessageChannel;
  type: MessageType;
  /** A phone number on the SMS channel, an email address on the email channel. */
  from: string;
  to: string;
  /** Email only. SMS has no subject line. */
  subject?: string;
  body: string;
  status: MessageStatus;
  /** SMS only. Twilio's message SID, which the delivery-status webhook keys on. */
  twilioSid?: string;
  /** Inbound only: no handler claimed this message, so a human has to read it. */
  needsAttention?: boolean;
  attentionResolvedAt?: Date | null;
  attentionResolvedBy?: string;
  /**
   * The email provider's message id.
   *
   * A separate field rather than reusing `twilioSid`: the delivery-status webhook
   * looks messages up by `twilioSid`, so putting a Resend id there would let an
   * inbound Twilio callback match an email row.
   */
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendMessageInput {
  customerId?: string;
  leadId?: string;
  appointmentId?: string;
  to: string;
  body: string;
  /** Email only; ignored on the SMS channel. */
  subject?: string;
  type?: MessageType;
  channel?: MessageChannel;
  bypassQuietHours?: boolean;
}

/**
 * The variables a rendered notification may reference.
 *
 * Deliberately a closed set rather than `Record<string, string>`: the renderer
 * and every call site have to agree on the names, and a typo in a template
 * variable should be a compile error, not a customer receiving the literal text
 * `undefined`.
 */
export interface NotificationVars {
  customerName?: string;
  businessName?: string;
  businessPhone?: string;
  businessEmail?: string;
  dateTime?: string;
  address?: string;
  serviceName?: string;
  technicianName?: string;
  /** Formatted for display, including the currency symbol. */
  amount?: string;
  documentNumber?: string;
  /** Absolute portal URL for an estimate or invoice. */
  link?: string;
  dueDate?: string;
  paymentMethod?: string;
}

/** Who a notification is going to, and which addresses are usable. */
export interface NotificationRecipient {
  customerId?: string;
  leadId?: string;
  appointmentId?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
}

export type NotificationChannelPreference = MessageChannel | 'both';

export interface SendNotificationOptions {
  /** Overrides the per-type default channel selection. */
  channels?: NotificationChannelPreference;
  bypassQuietHours?: boolean;
  /** Replaces the rendered body on both channels. Used by ad-hoc sends. */
  bodyOverride?: string;
  subjectOverride?: string;
}

/**
 * The outcome of one notification attempt per channel.
 *
 * A notification is not all-or-nothing: an SMS can be refused for opt-out while
 * the email still goes, and the caller needs to be able to tell the difference
 * between "sent", "deliberately skipped" and "failed". Returning this instead of
 * throwing is what lets a booking succeed even when the confirmation cannot be
 * delivered.
 */
export interface NotificationChannelResult {
  channel: MessageChannel;
  status: 'sent' | 'skipped' | 'failed';
  /** Present for 'skipped' and 'failed'. A machine-readable cause. */
  reason?: string;
  logId?: string;
}

export interface NotificationResult {
  type: MessageType;
  results: NotificationChannelResult[];
  /** True when at least one channel actually sent. */
  sentAny: boolean;
}
