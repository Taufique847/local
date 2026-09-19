import mongoose, { Schema, Document, Types } from 'mongoose';

export type MemoryCategory = 'preference' | 'equipment' | 'instruction' | 'history' | 'unresolved_issue';

export interface IAgentMemory extends Document {
  businessId: Types.ObjectId;
  customerId: Types.ObjectId;
  category: MemoryCategory;
  key: string;
  value: string;
  confidence: number;
  sourceCallSid?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AgentMemorySchema = new Schema<IAgentMemory>(
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
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['preference', 'equipment', 'instruction', 'history', 'unresolved_issue'],
      required: true,
      default: 'preference',
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
    confidence: {
      type: Number,
      default: 1.0,
      min: 0,
      max: 1.0,
    },
    sourceCallSid: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

AgentMemorySchema.index({ businessId: 1, customerId: 1, key: 1 });
AgentMemorySchema.index({ businessId: 1, customerId: 1, category: 1 });

export const AgentMemory = mongoose.model<IAgentMemory>('AgentMemory', AgentMemorySchema);
