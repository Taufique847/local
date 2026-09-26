import mongoose, { Schema, Document, Types } from 'mongoose';

export type TechnicianStatus = 'available' | 'on_job' | 'off_duty';

export interface ITechnician extends Document {
  businessId: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  skills: string[];
  assignedZoneIds: Types.ObjectId[];
  status: TechnicianStatus;
  active: boolean;
  homeBase?: {
    address: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const TechnicianSchema = new Schema<ITechnician>(
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
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    skills: {
      type: [String],
      default: ['ac_repair', 'diagnostics'],
    },
    assignedZoneIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'ServiceZone',
      },
    ],
    status: {
      type: String,
      enum: ['available', 'on_job', 'off_duty'],
      default: 'available',
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    homeBase: {
      address: { type: String, trim: true },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },
  },
  {
    timestamps: true,
  }
);

TechnicianSchema.index({ businessId: 1, active: 1 });
TechnicianSchema.index({ businessId: 1, skills: 1 });

export const Technician = mongoose.model<ITechnician>('Technician', TechnicianSchema);
