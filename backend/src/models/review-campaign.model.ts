import mongoose, { Document, Schema, Types } from 'mongoose';

export type ReviewCampaignStatus =
  | 'survey_sent'
  | 'positive_redirected'
  | 'negative_shielded'
  | 'resolved';

export interface IReviewCampaign extends Document {
  businessId: Types.ObjectId;
  appointmentId: Types.ObjectId;
  customerId: Types.ObjectId;
  customerPhone: string;
  customerName?: string;
  technicianId?: Types.ObjectId;
  technicianName?: string;
  rating?: number; // 1 to 5
  feedbackText?: string;
  status: ReviewCampaignStatus;
  surveySentAt: Date;
  respondedAt?: Date;
  googleReviewUrl?: string;
  isShielded: boolean;
  escalatedToOwner: boolean;
  escalationNotes?: string;
  slaDeadlineAt?: Date;
  slaBreached?: boolean;
  ownerAlertSent?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewCampaignSchema = new Schema<IReviewCampaign>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerPhone: {
      type: String,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
    },
    technicianId: {
      type: Schema.Types.ObjectId,
      ref: 'Technician',
    },
    technicianName: {
      type: String,
      trim: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    feedbackText: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['survey_sent', 'positive_redirected', 'negative_shielded', 'resolved'],
      default: 'survey_sent',
      index: true,
    },
    surveySentAt: {
      type: Date,
      default: Date.now,
    },
    respondedAt: {
      type: Date,
    },
    googleReviewUrl: {
      type: String,
      trim: true,
    },
    isShielded: {
      type: Boolean,
      default: false,
      index: true,
    },
    escalatedToOwner: {
      type: Boolean,
      default: false,
      index: true,
    },
    escalationNotes: {
      type: String,
      trim: true,
    },
    slaDeadlineAt: {
      type: Date,
      index: true,
    },
    slaBreached: {
      type: Boolean,
      default: false,
      index: true,
    },
    ownerAlertSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const ReviewCampaign = mongoose.model<IReviewCampaign>(
  'ReviewCampaign',
  ReviewCampaignSchema
);
