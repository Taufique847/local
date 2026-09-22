import { Business, ServiceItem, ServiceArea, DayHours, EmergencyService } from '../types/business';
import { apiClient } from '../lib/api-client';

export class BusinessService {
  /**
   * Current user's business, or null when they have not created one yet.
   *
   * Errors are swallowed because "no business yet" is the normal state during
   * onboarding, and callers branch on null rather than catching.
   */
  public static async getMyBusiness(): Promise<Business | null> {
    try {
      const json = await apiClient.get<{ business?: Business }>('/api/business/me');
      return json.business || null;
    } catch {
      return null;
    }
  }

  // Step 1: Save or update business profile
  public static async saveProfile(data: {
    name: string;
    businessType?: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
  }): Promise<Business> {
    const json = await apiClient.post<{ business: Business }>('/api/onboarding/business', data);
    return json.business;
  }

  // Step 2: Update services
  public static async updateServices(services: ServiceItem[]): Promise<Business> {
    const json = await apiClient.patch<{ business: Business }>('/api/onboarding/services', {
      services,
    });
    return json.business;
  }

  // Step 3: Update service area
  public static async updateServiceArea(serviceArea: ServiceArea): Promise<Business> {
    const json = await apiClient.patch<{ business: Business }>(
      '/api/onboarding/service-area',
      serviceArea
    );
    return json.business;
  }

  // Step 4: Update hours & emergency service
  public static async updateHours(
    businessHours: DayHours[],
    emergencyService?: EmergencyService
  ): Promise<Business> {
    const json = await apiClient.patch<{ business: Business }>('/api/onboarding/hours', {
      businessHours,
      emergencyService,
    });
    return json.business;
  }

  /**
   * Step 5: telephony setup.
   *
   * The phone number itself is provisioned through TelephonyService; this call
   * records the human escalation number and advances the onboarding step.
   */
  public static async savePhoneSetup(data: {
    emergencyTransferPhone?: string;
    googleReviewUrl?: string;
  }): Promise<Business> {
    const json = await apiClient.patch<{ business: Business }>('/api/onboarding/phone', data);
    return json.business;
  }

  // Step 6: Complete onboarding
  public static async completeOnboarding(): Promise<Business> {
    const json = await apiClient.post<{ business: Business }>('/api/onboarding/complete');
    return json.business;
  }
}
