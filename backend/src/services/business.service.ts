import { Business } from '../models/business.model';
import { defaultServicesForTrade } from '../config/trade-catalogs';
import { 
  BusinessDTO, 
  IBusiness, 
  IServiceItem, 
  IServiceArea, 
  IDayHours, 
  IEmergencyService 
} from '../types/business.types';
import { AppError } from '../types';

export class BusinessService {
  // Convert Mongoose document to clean BusinessDTO
  private static toDTO(business: IBusiness): BusinessDTO {
    return {
      id: business._id.toString(),
      ownerId: business.ownerId.toString(),
      name: business.name,
      businessType: business.businessType,
      phone: business.phone,
      email: business.email,
      website: business.website,
      address: business.address,
      services: business.services,
      serviceArea: business.serviceArea,
      businessHours: business.businessHours,
      emergencyService: business.emergencyService,
      onboardingStatus: business.onboardingStatus,
      onboardingStep: business.onboardingStep,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    };
  }

  // Get current user's business
  public static async getBusinessByOwnerId(ownerId: string): Promise<BusinessDTO | null> {
    const business = await Business.findOne({ ownerId });
    if (!business) return null;
    return this.toDTO(business);
  }

  // Step 1: Create or update business profile
  public static async saveBusinessProfile(
    ownerId: string,
    data: {
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
        country?: string;
      };
    }
  ): Promise<BusinessDTO> {
    if (!data.name || !data.name.trim()) {
      throw new AppError('Business name is required', 400);
    }

    let business = await Business.findOne({ ownerId });

    if (!business) {
      const businessType = data.businessType || 'HVAC';

      business = new Business({
        ownerId,
        name: data.name.trim(),
        businessType,
        phone: data.phone?.trim(),
        email: data.email?.trim(),
        website: data.website?.trim(),
        address: data.address || {},
        // Passed explicitly so the starter catalogue matches the trade without
        // depending on Mongoose default-evaluation order. Every business used to
        // get the HVAC list, so a plumber's first job was deleting AC services —
        // and until they did, the voice assistant offered them to callers.
        services: defaultServicesForTrade(businessType),
        onboardingStatus: 'in_progress',
        onboardingStep: 'services',
      });
    } else {
      business.name = data.name.trim();
      if (data.businessType) business.businessType = data.businessType as any;
      if (data.phone !== undefined) business.phone = data.phone.trim();
      if (data.email !== undefined) business.email = data.email.trim();
      if (data.website !== undefined) business.website = data.website.trim();
      if (data.address) business.address = { ...business.address, ...data.address };
      if (business.onboardingStatus === 'not_started') {
        business.onboardingStatus = 'in_progress';
      }
      if (business.onboardingStep === 'business') {
        business.onboardingStep = 'services';
      }
    }

    await business.save();
    return this.toDTO(business);
  }

  // Step 2: Update services
  public static async updateServices(ownerId: string, services: IServiceItem[]): Promise<BusinessDTO> {
    const business = await Business.findOne({ ownerId });
    if (!business) {
      throw new AppError('Please configure your business profile first', 400);
    }

    business.services = services;
    if (business.onboardingStep === 'services') {
      business.onboardingStep = 'service_area';
    }

    await business.save();
    return this.toDTO(business);
  }

  // Step 3: Update service area
  public static async updateServiceArea(ownerId: string, serviceArea: IServiceArea): Promise<BusinessDTO> {
    const business = await Business.findOne({ ownerId });
    if (!business) {
      throw new AppError('Please configure your business profile first', 400);
    }

    business.serviceArea = { ...business.serviceArea, ...serviceArea };
    if (business.onboardingStep === 'service_area') {
      business.onboardingStep = 'hours';
    }

    await business.save();
    return this.toDTO(business);
  }

  // Step 4: Update business hours and emergency settings
  public static async updateHours(
    ownerId: string,
    businessHours: IDayHours[],
    emergencyService?: IEmergencyService
  ): Promise<BusinessDTO> {
    const business = await Business.findOne({ ownerId });
    if (!business) {
      throw new AppError('Please configure your business profile first', 400);
    }

    if (businessHours && businessHours.length > 0) {
      business.businessHours = businessHours;
    }

    if (emergencyService) {
      business.emergencyService = { ...business.emergencyService, ...emergencyService };
    }

    if (business.onboardingStep === 'hours') {
      business.onboardingStep = 'phone';
    }

    await business.save();
    return this.toDTO(business);
  }

  /**
   * Step 5: telephony setup.
   *
   * The phone number itself is provisioned through /api/phone-numbers; this step
   * records the human escalation number and advances onboarding. It is the step
   * that was missing entirely — onboarding used to complete with no line
   * connected, so a "finished" account still could not answer a call.
   */
  public static async completePhoneStep(
    ownerId: string,
    input: { emergencyTransferPhone?: string; googleReviewUrl?: string }
  ): Promise<BusinessDTO> {
    const business = await Business.findOne({ ownerId });
    if (!business) {
      throw new AppError('Please configure your business profile first', 400);
    }

    if (input.googleReviewUrl !== undefined) {
      business.googleReviewUrl = input.googleReviewUrl.trim() || undefined;
    }

    // The escalation number lives on the business policy, which is the single
    // source of truth the transfer_call tool reads.
    if (input.emergencyTransferPhone !== undefined) {
      const { PolicyGuardrailsService } = await import('./policy-guardrails.service');
      await PolicyGuardrailsService.updatePolicy(business._id, {
        emergencyTransferPhone: input.emergencyTransferPhone.trim() || undefined,
      } as any);
    }

    if (business.onboardingStep === 'phone' || business.onboardingStep === 'hours') {
      business.onboardingStep = 'review';
    }

    await business.save();
    return this.toDTO(business);
  }

  // Step 6: Complete onboarding
  public static async completeOnboarding(ownerId: string): Promise<BusinessDTO> {
    const business = await Business.findOne({ ownerId });
    if (!business) {
      throw new AppError('Business not found. Please complete setup.', 404);
    }

    if (!business.name) {
      throw new AppError('Business name is required to complete onboarding', 400);
    }

    const hasEnabledServices = business.services && business.services.some((s) => s.enabled);
    if (!hasEnabledServices) {
      throw new AppError('At least one active service must be enabled', 400);
    }

    business.onboardingStatus = 'completed';
    business.onboardingStep = 'completed';

    await business.save();
    return this.toDTO(business);
  }
}
