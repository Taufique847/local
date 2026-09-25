import { Schema, model, Document, Types } from 'mongoose';
import type { CustomerFilterInput } from '../services/customer-filter';

export interface ICustomerSegment extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  name: string;
  description?: string;
  /**
   * The filter, stored as data.
   *
   * `Mixed` rather than a nested schema on purpose: the filter's shape is versioned by
   * `sanitiseCustomerFilter`, which is the single place that decides what a stored
   * filter may contain. Declaring it twice — here and there — would let the two drift,
   * and a Mongoose enum tightening would silently stop an older saved segment from
   * loading.
   */
  filter: CustomerFilterInput;
  /** Who created it, for an audit trail on a thing that can trigger a bulk send. */
  createdBy?: string;
  lastCampaignAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A named, saved customer filter.
 *
 * Feature #13 had tags that were indexed, editable and returned by nothing — the list
 * API omitted them from its DTO, so the two tag dropdowns on the customers page had
 * no data to filter against. There was no saved-segment concept anywhere.
 *
 * The count is deliberately NOT stored. A cached count is wrong the moment a customer
 * is added, and a segment showing a stale number next to a "send campaign" button is
 * how an operator texts a hundred people believing they were texting forty.
 */
const customerSegmentSchema = new Schema<ICustomerSegment>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    filter: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    createdBy: {
      type: String,
      trim: true,
    },
    lastCampaignAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * Names are unique per business, case-insensitively.
 *
 * Two segments called "VIP" and "vip" is a support ticket waiting to happen, given
 * one of them can trigger a bulk send.
 */
customerSegmentSchema.index(
  { businessId: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'unique_segment_name_per_business',
  }
);

export const CustomerSegment = model<ICustomerSegment>('CustomerSegment', customerSegmentSchema);
