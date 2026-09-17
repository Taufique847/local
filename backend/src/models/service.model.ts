import { Schema, model } from 'mongoose';
import { IService } from '../types/service.types';

const serviceSchema = new Schema<IService>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
      maxlength: [100, 'Service name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    durationMinutes: {
      type: Number,
      min: [1, 'Duration must be at least 1 minute'],
      default: 60,
    },
    startingPrice: {
      type: Number,
      min: [0, 'Starting price cannot be negative'],
    },
    category: {
      type: String,
      enum: [
        'Cooling',
        'Heating',
        'Maintenance',
        'Installation',
        'Indoor Air Quality',
        'Ductwork',
        'Emergency',
        'Other',
      ],
      default: 'Other',
      index: true,
    },
    isEmergencyService: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for business isolation and query efficiency
serviceSchema.index({ businessId: 1, name: 1 });
serviceSchema.index({ businessId: 1, status: 1 });
serviceSchema.index({ businessId: 1, category: 1 });
serviceSchema.index({ businessId: 1, createdAt: -1 });

export const Service = model<IService>('Service', serviceSchema);
