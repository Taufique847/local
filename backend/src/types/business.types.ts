import { Document, Types } from 'mongoose';

export type BusinessType = 'HVAC' | 'Plumbing' | 'Electrical' | 'Roofing' | 'Pest Control' | 'Cleaning' | 'General';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';

/**
 * `phone` was added because onboarding previously finished without ever
 * provisioning a phone number — leaving the product's core feature, the AI
 * receptionist, unable to answer anything.
 */
export type OnboardingStep =
  | 'business'
  | 'services'
  | 'service_area'
  | 'hours'
  | 'phone'
  | 'review'
  | 'completed';

export interface IServiceItem {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
}

export interface IBusinessAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface IServiceArea {
  primaryCity?: string;
  state?: string;
  zip?: string;
  radiusMiles?: number;
}

export interface IDayHours {
  day: string; // 'Monday', 'Tuesday', etc.
  isOpen: boolean;
  openTime: string; // e.g. '08:00'
  closeTime: string; // e.g. '18:00'
}

export interface IEmergencyService {
  offered: boolean;
  availability?: '24/7' | 'after_hours' | 'custom';
  notes?: string;
}

export interface IBusiness extends Document {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  businessType: BusinessType;
  phone?: string;
  email?: string;
  website?: string;
  address: IBusinessAddress;
  services: IServiceItem[];
  serviceArea: IServiceArea;
  businessHours: IDayHours[];
  timezone?: string;
  emergencyService: IEmergencyService;
  /**
   * Full Google "write a review" URL for this business, including its real
   * Place ID. Required because a slug-based URL is not a valid review link.
   */
  googleReviewUrl?: string;
  onboardingStatus: OnboardingStatus;
  onboardingStep: OnboardingStep;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessDTO {
  id: string;
  ownerId: string;
  name: string;
  businessType: BusinessType;
  phone?: string;
  email?: string;
  website?: string;
  address: IBusinessAddress;
  services: IServiceItem[];
  serviceArea: IServiceArea;
  businessHours: IDayHours[];
  timezone?: string;
  emergencyService: IEmergencyService;
  googleReviewUrl?: string;
  onboardingStatus: OnboardingStatus;
  onboardingStep: OnboardingStep;
  createdAt: string | Date;
  updatedAt: string | Date;
}
