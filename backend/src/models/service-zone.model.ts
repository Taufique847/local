import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IServiceZone extends Document {
  businessId: Types.ObjectId;
  name: string;
  zipCodes: string[];
  assignedTechnicianIds: Types.ObjectId[];
  travelBufferMinutes: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceZoneSchema = new Schema<IServiceZone>(
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
    zipCodes: {
      type: [String],
      default: [],
      index: true,
    },
    assignedTechnicianIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Technician',
      },
    ],
    travelBufferMinutes: {
      type: Number,
      default: 30,
      min: 0,
      max: 180,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

ServiceZoneSchema.index({ businessId: 1, zipCodes: 1 });

export const ServiceZone = mongoose.model<IServiceZone>('ServiceZone', ServiceZoneSchema);
