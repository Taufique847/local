import { Schema, model, Document, Types } from 'mongoose';

export type CounterScope = 'invoice' | 'estimate';

export interface IDocumentCounter extends Document {
  businessId: Types.ObjectId;
  scope: CounterScope;
  /** Last number handed out. The next caller gets seq + 1. */
  seq: number;
}

/**
 * Monotonic per-business sequence for human-facing document numbers.
 *
 * Invoice and estimate numbers were derived from `countDocuments() + 1001`. That
 * is a read followed by a write, so two concurrent creations both read the same
 * count and produced the same number — and if a document was ever deleted, the
 * next one reused a number that had already been sent to a customer.
 *
 * `findOneAndUpdate` with `$inc` is a single atomic operation, so every caller
 * gets a distinct value regardless of concurrency.
 */
const documentCounterSchema = new Schema<IDocumentCounter>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    scope: {
      type: String,
      enum: ['invoice', 'estimate'],
      required: true,
    },
    seq: {
      type: Number,
      required: true,
      default: 1000,
    },
  },
  { timestamps: true }
);

// One counter per business per document type.
documentCounterSchema.index({ businessId: 1, scope: 1 }, { unique: true });

export const DocumentCounter = model<IDocumentCounter>('DocumentCounter', documentCounterSchema);
