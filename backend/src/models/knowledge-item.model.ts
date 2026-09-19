import { Schema, model, Document, Types } from 'mongoose';

export type KnowledgeCategory =
  | 'faq'
  | 'policy'
  | 'service_area'
  | 'pricing_guide'
  | 'general';

export interface IKnowledgeItem extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  category: KnowledgeCategory;
  title: string;
  content: string;
  tags: string[];
  priority: number;
  isPublished: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const knowledgeItemSchema = new Schema<IKnowledgeItem>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['faq', 'policy', 'service_area', 'pricing_guide', 'general'],
      default: 'faq',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Knowledge item title is required'],
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: [true, 'Knowledge item content is required'],
      trim: true,
      maxlength: 5000,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: String,
      default: 'system',
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes and text search index
knowledgeItemSchema.index({ businessId: 1, category: 1 });
knowledgeItemSchema.index({ businessId: 1, isPublished: 1 });
knowledgeItemSchema.index(
  { title: 'text', content: 'text', tags: 'text' },
  { weights: { title: 5, tags: 3, content: 1 } }
);

export const KnowledgeItem = model<IKnowledgeItem>('KnowledgeItem', knowledgeItemSchema);
