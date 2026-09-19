import { Document, Types } from 'mongoose';

export type MessageDirection = 'inbound' | 'outbound';
export type MessageChannel = 'sms';
export type MessageType =
  | 'appointment_confirmation'
  | 'appointment_reminder'
  | 'appointment_rescheduled'
  | 'appointment_cancelled'
  | 'missed_call_followup'
  | 'lead_followup'
  | 'custom';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'received';

export interface ICommunicationLog extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId?: Types.ObjectId;
  leadId?: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  direction: MessageDirection;
  channel: MessageChannel;
  type: MessageType;
  from: string;
  to: string;
  body: string;
  status: MessageStatus;
  twilioSid?: string;
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
  type?: MessageType;
  bypassQuietHours?: boolean;
}
