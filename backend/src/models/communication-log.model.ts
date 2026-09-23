import { Schema, model } from 'mongoose';
import {
  ICommunicationLog,
  MESSAGE_TYPES,
  MESSAGE_CHANNELS,
  CHANNEL_BODY_LIMIT,
  MessageChannel,
} from '../types/communication.types';

const communicationLogSchema = new Schema<ICommunicationLog>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      index: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      index: true,
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: MESSAGE_CHANNELS,
      default: 'sms',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: MESSAGE_TYPES,
      default: 'custom',
      index: true,
    },
    /**
     * A phone number on the SMS channel, an email address on the email channel.
     *
     * Both stay required: a log row that cannot say who a message went to or came
     * from is not an audit record, and every send path can resolve both before it
     * writes. Length is capped because an email address is the longest thing
     * either field legitimately holds.
     */
    from: {
      type: String,
      required: true,
      trim: true,
      maxlength: 320,
      index: true,
    },
    to: {
      type: String,
      required: true,
      trim: true,
      maxlength: 320,
      index: true,
    },
    subject: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      /**
       * Per-channel, not a single number.
       *
       * This was a flat `maxlength: 1600` — the Twilio segment ceiling — applied
       * to a log shared by every channel. Any email body of realistic length
       * failed validation, so widening the `channel` enum alone would not have
       * made the email channel loggable.
       */
      validate: {
        validator: function (this: any, value: string): boolean {
          if (typeof value !== 'string') return true;
          // `this` is the document on save and the query on a validated update;
          // fall back to the stricter SMS limit when the channel is unknowable.
          const channel: MessageChannel =
            (this?.channel as MessageChannel) ??
            (this?.getUpdate?.()?.$set?.channel as MessageChannel) ??
            'sms';
          const limit = CHANNEL_BODY_LIMIT[channel] ?? CHANNEL_BODY_LIMIT.sms;
          return value.length <= limit;
        },
        message: function (props: any): string {
          return `Message body is ${props.value?.length ?? 0} characters, which exceeds the limit for this channel.`;
        },
      },
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'failed', 'received'],
      default: 'queued',
      index: true,
    },
    twilioSid: {
      type: String,
      trim: true,
      index: true,
    },
    providerMessageId: {
      type: String,
      trim: true,
    },
    errorCode: {
      type: String,
      trim: true,
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    /**
     * Set on an inbound message that no handler claimed.
     *
     * Every inbound SMS was logged and, if it matched no consent keyword, no
     * rating and no recovery intent, silently dropped — the customer got no reply
     * and the owner was never told a question had been asked. A row in a list the
     * owner never opens is not an answer, so unclaimed messages are now flagged
     * and surfaced as a queue.
     */
    needsAttention: {
      type: Boolean,
      default: false,
    },
    attentionResolvedAt: {
      type: Date,
      default: null,
    },
    attentionResolvedBy: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
communicationLogSchema.index({ businessId: 1, createdAt: -1 });
communicationLogSchema.index({ businessId: 1, to: 1 });
communicationLogSchema.index({ businessId: 1, customerId: 1 });
// The owner's "needs attention" queue. Partial so it only indexes the handful of
// rows that are actually flagged, not every message ever sent.
communicationLogSchema.index(
  { businessId: 1, createdAt: -1 },
  { partialFilterExpression: { needsAttention: true }, name: 'needs_attention_queue' }
);

export const CommunicationLog = model<ICommunicationLog>('CommunicationLog', communicationLogSchema);
