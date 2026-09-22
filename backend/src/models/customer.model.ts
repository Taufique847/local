import { Schema, model } from 'mongoose';
import { ICustomer } from '../types/customer.types';

const customerSchema = new Schema<ICustomer>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [60, 'First name cannot exceed 60 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [60, 'Last name cannot exceed 60 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please enter a valid email address',
      ],
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zip: { type: String, trim: true },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    lifetimeValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    serviceAddresses: [
      {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        zip: { type: String, trim: true },
      },
    ],
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    source: {
      type: String,
      default: 'manual',
    },
    /**
     * Set when the customer's personal data was erased on request.
     *
     * The record itself is kept rather than deleted, because appointments and
     * invoices reference it and a business has to retain financial history. The
     * identifying fields are scrubbed; this timestamp records that it happened.
     */
    personalDataErasedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for business isolation and fast query performance
customerSchema.index({ businessId: 1, createdAt: -1 });
customerSchema.index({ businessId: 1, status: 1 });
customerSchema.index({ businessId: 1, phone: 1 });

export const Customer = model<ICustomer>('Customer', customerSchema);
