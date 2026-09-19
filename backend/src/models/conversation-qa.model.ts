import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversationQA extends Document {
  callLogId: Types.ObjectId;
  businessId: Types.ObjectId;
  customerId?: Types.ObjectId;
  resolutionScore: number;       // 0 - 100
  clarityScore: number;          // 0 - 100
  sentimentScore: number;        // -1.0 to +1.0
  policyCompliance: boolean;
  missingInformation: string[];
  flaggedForReview: boolean;
  flagReason?: string;
  aiSummary: string;
  coachingNotes: string[];
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationQASchema = new Schema<IConversationQA>(
  {
    callLogId: {
      type: Schema.Types.ObjectId,
      ref: 'CallLog',
      required: true,
      index: true,
      unique: true,
    },
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
    resolutionScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    clarityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 90,
    },
    sentimentScore: {
      type: Number,
      min: -1.0,
      max: 1.0,
      default: 0.0,
    },
    policyCompliance: {
      type: Boolean,
      default: true,
    },
    missingInformation: {
      type: [String],
      default: [],
    },
    flaggedForReview: {
      type: Boolean,
      default: false,
      index: true,
    },
    flagReason: {
      type: String,
      trim: true,
    },
    aiSummary: {
      type: String,
      required: true,
      trim: true,
    },
    coachingNotes: {
      type: [String],
      default: [],
    },
    evaluatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

ConversationQASchema.index({ businessId: 1, createdAt: -1 });
ConversationQASchema.index({ businessId: 1, flaggedForReview: 1 });

export const ConversationQA = mongoose.model<IConversationQA>('ConversationQA', ConversationQASchema);
