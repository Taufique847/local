export type BusinessType = 'HVAC' | 'Plumbing' | 'Electrical' | 'Roofing' | 'Pest Control' | 'Cleaning' | 'General';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';

/** Must stay in sync with backend/src/types/business.types.ts */
export type OnboardingStep =
  | 'business'
  | 'services'
  | 'service_area'
  | 'hours'
  | 'phone'
  | 'review'
  | 'completed';

export interface ServiceItem {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
}

export interface BusinessAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface ServiceArea {
  primaryCity?: string;
  state?: string;
  zip?: string;
  radiusMiles?: number;
}

export interface DayHours {
  day: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface EmergencyService {
  offered: boolean;
  availability?: '24/7' | 'after_hours' | 'custom';
  notes?: string;
}

export interface Business {
  id: string;
  ownerId: string;
  name: string;
  businessType: BusinessType;
  phone?: string;
  email?: string;
  website?: string;
  address: BusinessAddress;
  services: ServiceItem[];
  serviceArea: ServiceArea;
  businessHours: DayHours[];
  /**
   * IANA zone, e.g. `America/Chicago`. Stored on the business since the beginning and
   * missing from this type, which is part of why the dispatch calendar rendered its
   * hours in UTC: the one field that could have told it otherwise was not visible here.
   */
  timezone?: string;
  emergencyService: EmergencyService;
  /**
   * Full Google "write a review" URL including the real Place ID. Only sent to
   * customers who rate 4 or 5 stars; a slug-based URL is not a valid review link.
   */
  googleReviewUrl?: string;
  onboardingStatus: OnboardingStatus;
  onboardingStep: OnboardingStep;
  createdAt: string;
  updatedAt: string;
}
