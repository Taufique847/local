import { Business, ServiceItem, ServiceArea, DayHours, EmergencyService } from '../types/business';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export class BusinessService {
  // Fetch current user's business
  public static async getMyBusiness(): Promise<Business | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/business/me`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.business || null;
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
    const res = await fetch(`${API_BASE_URL}/api/onboarding/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to save business profile');
    return json.business;
  }

  // Step 2: Update services
  public static async updateServices(services: ServiceItem[]): Promise<Business> {
    const res = await fetch(`${API_BASE_URL}/api/onboarding/services`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ services }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update services');
    return json.business;
  }

  // Step 3: Update service area
  public static async updateServiceArea(serviceArea: ServiceArea): Promise<Business> {
    const res = await fetch(`${API_BASE_URL}/api/onboarding/service-area`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(serviceArea),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update service area');
    return json.business;
  }

  // Step 4: Update hours & emergency service
  public static async updateHours(
    businessHours: DayHours[],
    emergencyService?: EmergencyService
  ): Promise<Business> {
    const res = await fetch(`${API_BASE_URL}/api/onboarding/hours`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ businessHours, emergencyService }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to update business hours');
    return json.business;
  }

  // Step 5: Complete onboarding
  public static async completeOnboarding(): Promise<Business> {
    const res = await fetch(`${API_BASE_URL}/api/onboarding/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to complete onboarding');
    return json.business;
  }
}
