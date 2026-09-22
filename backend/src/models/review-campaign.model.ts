import mongoose, { Document, Schema, Types } from 'mongoose';

export type ReviewCampaignStatus =
  /** Queued for a delayed send; picked up by the scheduler. */
  | 'pending'
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
  /**
   * When the survey should go out. A survey sent the instant a technician marks
   * a job complete arrives while they are still on the driveway; a short delay
   * produces far better response rates.
   */
  scheduledAt?: Date;
  /** Undefined until the survey has actually been dispatched. */
  surveySentAt?: Date;
  /** Number of send attempts, so a permanently failing survey is abandoned. */
  surveyAttempts: number;
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
      // No `index: true` here — the unique index is declared below via
      // schema.index(). Declaring both makes Mongoose build two indexes on the
      // same key and log a duplicate-index warning on every boot.
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
      enum: ['pending', 'survey_sent', 'positive_redirected', 'negative_shielded', 'resolved'],
      default: 'pending',
      index: true,
    },
    scheduledAt: {
      type: Date,
      index: true,
    },
    surveySentAt: {
      type: Date,
    },
    surveyAttempts: {
      type: Number,
      default: 0,
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

// One campaign per appointment: makes the scheduler idempotent and prevents a
// customer being surveyed twice for the same job.
ReviewCampaignSchema.index({ appointmentId: 1 }, { unique: true });
// Drives the scheduler's "surveys due now" query.
ReviewCampaignSchema.index({ status: 1, scheduledAt: 1 });
// Drives the negative-feedback SLA breach sweep.
ReviewCampaignSchema.index({ status: 1, slaBreached: 1, slaDeadlineAt: 1 });

export const ReviewCampaign = mongoose.model<IReviewCampaign>(
  'ReviewCampaign',
  ReviewCampaignSchema
);
