import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IServiceZone extends Document {
  businessId: Types.ObjectId;
  name: string;
  zipCodes: string[];
  assignedTechnicianIds: Types.ObjectId[];
  travelBufferMinutes: number;
  /** Trip charge for this zone, in dollars. 0 means no travel charge. */
  travelFee: number;
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
    /**
     * Trip charge for jobs in this zone, in dollars.
     *
     * Defaults to 0, so an existing zone bills exactly as it did before this field
     * existed. A business that charges the same everywhere leaves them all at zero.
     */
    travelFee: {
      type: Number,
      default: 0,
      min: 0,
      max: 10000,
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
