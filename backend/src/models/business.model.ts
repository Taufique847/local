import { Schema, model } from 'mongoose';
import { IBusiness, IServiceItem, IDayHours } from '../types/business.types';

const serviceItemSchema = new Schema<IServiceItem>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const dayHoursSchema = new Schema<IDayHours>(
  {
    day: { type: String, required: true },
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, default: '08:00' },
    closeTime: { type: String, default: '18:00' },
  },
  { _id: false }
);

const defaultHVACServices: IServiceItem[] = [
  { id: 'ac_repair', name: 'AC Repair', description: 'Diagnose and fix air conditioning issues', enabled: true },
  { id: 'ac_install', name: 'AC Installation', description: 'Install new energy-efficient AC systems', enabled: true },
  { id: 'ac_tuneup', name: 'AC Maintenance & Tune-up', description: 'Seasonal AC tune-up and filter check', enabled: true },
  { id: 'heating_repair', name: 'Heating Repair', description: 'Fix furnace and heat pump malfunctions', enabled: true },
  { id: 'heating_install', name: 'Heating Installation', description: 'Install furnaces and heating units', enabled: true },
  { id: 'ductwork', name: 'Ductwork & Airflow', description: 'Duct cleaning, repair, and sealing', enabled: false },
  { id: 'indoor_air', name: 'Indoor Air Quality', description: 'Air purifiers, dehumidifiers, and UV lights', enabled: false },
  { id: 'emergency_hvac', name: 'Emergency HVAC Service', description: '24/7 urgent heating and cooling service', enabled: true },
];

const defaultHours: IDayHours[] = [
  { day: 'Monday', isOpen: true, openTime: '08:00', closeTime: '18:00' },
  { day: 'Tuesday', isOpen: true, openTime: '08:00', closeTime: '18:00' },
  { day: 'Wednesday', isOpen: true, openTime: '08:00', closeTime: '18:00' },
  { day: 'Thursday', isOpen: true, openTime: '08:00', closeTime: '18:00' },
  { day: 'Friday', isOpen: true, openTime: '08:00', closeTime: '18:00' },
  { day: 'Saturday', isOpen: true, openTime: '09:00', closeTime: '15:00' },
  { day: 'Sunday', isOpen: false, openTime: '09:00', closeTime: '15:00' },
];

const businessSchema = new Schema<IBusiness>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      maxlength: [120, 'Business name cannot exceed 120 characters'],
    },
    businessType: {
      type: String,
      enum: ['HVAC', 'Plumbing', 'Electrical', 'Roofing', 'Pest Control', 'Cleaning', 'General'],
      default: 'HVAC',
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    website: {
      type: String,
      trim: true,
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zip: { type: String, trim: true },
      country: { type: String, default: 'United States' },
    },
    services: {
      type: [serviceItemSchema],
      default: defaultHVACServices,
    },
    serviceArea: {
      primaryCity: { type: String, trim: true },
      state: { type: String, trim: true },
      zip: { type: String, trim: true },
      radiusMiles: { type: Number, default: 25 },
    },
    businessHours: {
      type: [dayHoursSchema],
      default: defaultHours,
    },
    timezone: {
      type: String,
      default: 'America/New_York',
      trim: true,
    },
    emergencyService: {
      offered: { type: Boolean, default: false },
      availability: {
        type: String,
        enum: ['24/7', 'after_hours', 'custom'],
        default: 'after_hours',
      },
      notes: { type: String, trim: true },
    },
    onboardingStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
      index: true,
    },
    onboardingStep: {
      type: String,
      enum: ['business', 'services', 'service_area', 'hours', 'review', 'completed'],
      default: 'business',
    },
  },
  {
    timestamps: true,
  }
);

export const Business = model<IBusiness>('Business', businessSchema);
