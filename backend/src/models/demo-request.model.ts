import { Schema, model, Document, Types } from 'mongoose';

export type DemoTrade = 'hvac' | 'plumbing' | 'electrical' | 'roofing' | 'multi_trade';
export type DemoRequestStatus = 'new' | 'contacted' | 'demo_scheduled' | 'won' | 'lost';

/**
 * An inbound lead from the public marketing site.
 *
 * This is a lead for BlueCollar AI itself (not for a contractor tenant), so it
 * deliberately has no `businessId`. Before this model existed the booking form
 * validated its payload and then threw it away in a `console.log`, so every
 * demo request the marketing site collected was lost.
 */
export interface IDemoRequest extends Document {
  _id: Types.ObjectId;
  fullName: string;
  businessName: string;
  trade: DemoTrade;
  phone: string;
  email: string;
  monthlyCalls: string;
  status: DemoRequestStatus;
  notes?: string;
  /** Marketing attribution captured at submit time. */
  sourcePath?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  ipAddress?: string;
  userAgent?: string;
  contactedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const demoRequestSchema = new Schema<IDemoRequest>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    businessName: { type: String, required: true, trim: true, maxlength: 160 },
    trade: {
      type: String,
      enum: ['hvac', 'plumbing', 'electrical', 'roofing', 'multi_trade'],
      required: true,
    },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    monthlyCalls: { type: String, required: true, trim: true, maxlength: 40 },
    status: {
      type: String,
      enum: ['new', 'contacted', 'demo_scheduled', 'won', 'lost'],
      default: 'new',
      index: true,
    },
    notes: { type: String, maxlength: 4000 },
    sourcePath: { type: String, maxlength: 300 },
    referrer: { type: String, maxlength: 500 },
    utmSource: { type: String, maxlength: 120 },
    utmMedium: { type: String, maxlength: 120 },
    utmCampaign: { type: String, maxlength: 120 },
    ipAddress: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 400 },
    contactedAt: { type: Date },
  },
  { timestamps: true }
);

// Supports the sales inbox view (newest first, filtered by status).
demoRequestSchema.index({ status: 1, createdAt: -1 });
// Used to deduplicate repeat submissions from the same person.
demoRequestSchema.index({ email: 1, createdAt: -1 });

export const DemoRequest = model<IDemoRequest>('DemoRequest', demoRequestSchema);
