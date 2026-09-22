import { Schema, model } from 'mongoose';
import { ICallLog } from '../types/telephony.types';

const callLogSchema = new Schema<ICallLog>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    phoneNumberId: {
      type: Schema.Types.ObjectId,
      ref: 'BusinessPhoneNumber',
    },
    provider: {
      type: String,
      enum: ['twilio'],
      default: 'twilio',
      required: true,
    },
    providerCallSid: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      default: 'inbound',
      required: true,
      index: true,
    },
    from: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    to: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        'initiated',
        'ringing',
        'in_progress',
        'completed',
        'failed',
        'busy',
        'no_answer',
        'cancelled',
      ],
      default: 'initiated',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    answeredAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    recordingUrl: {
      type: String,
      trim: true,
    },
    outcome: {
      type: String,
      enum: [
        'appointment_booked',
        'lead_captured',
        'inquiry_answered',
        'emergency_transferred',
        'missed_call',
        'hangup_or_spam',
      ],
      index: true,
    },
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative', 'frustrated'],
      default: 'neutral',
    },
    summary: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    aiHandled: {
      type: Boolean,
      default: false,
    },
    /**
     * Owner-initiated test call. Real telephony and a real AI session, but kept
     * out of stats so trying the assistant does not skew the business's own
     * answer rate, booking rate or call volume.
     */
    isTest: {
      type: Boolean,
      default: false,
    },
    transcript: [
      {
        role: { type: String, enum: ['assistant', 'user', 'system'], required: true },
        text: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    toolExecutions: [
      {
        toolName: { type: String, required: true },
        arguments: { type: Schema.Types.Mixed },
        result: { type: Schema.Types.Mixed },
        durationMs: { type: Number, default: 0 },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    /**
     * Measured per-call voice engine performance and provider usage.
     *
     * Latency and cost were previously invisible: the dashboard displayed a
     * hardcoded "<280ms" and there was no record of token or audio spend.
     */
    metrics: {
      avgTurnLatencyMs: { type: Number },
      maxTurnLatencyMs: { type: Number },
      turnCount: { type: Number, default: 0 },
      sttAudioSeconds: { type: Number, default: 0 },
      llmRequests: { type: Number, default: 0 },
      llmPromptTokens: { type: Number, default: 0 },
      llmCompletionTokens: { type: Number, default: 0 },
      ttsCharacters: { type: Number, default: 0 },
      providerErrors: { type: Number, default: 0 },
      bargeInCount: { type: Number, default: 0 },
      endedReason: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
callLogSchema.index({ businessId: 1, startedAt: -1 });
callLogSchema.index({ businessId: 1, status: 1 });
callLogSchema.index({ businessId: 1, from: 1 });
// Reporting reads always filter out test calls, so isTest leads the key.
callLogSchema.index({ businessId: 1, isTest: 1, startedAt: -1 });

export const CallLog = model<ICallLog>('CallLog', callLogSchema);
