import { Response, NextFunction } from 'express';
import { BusinessService } from '../services/business.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class BusinessController {
  /**
   * GET /api/business/me or /api/onboarding/status
   *
   * Resolved by MEMBERSHIP, not ownership. A dispatcher or technician needs to
   * read the workspace they work in — with an owner-only lookup this returned
   * null for them, which the frontend reads as "onboarding not finished" and
   * would bounce a staff member into the owner's setup wizard.
   *
   * Returns null rather than erroring when there is no workspace at all, because
   * that is the legitimate pre-onboarding state this endpoint is polled in.
   */
  public static async getMyBusiness(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);

      const context = await BusinessContextService.tryResolve(req.user.id);
      const business = context
        ? await BusinessService.getBusinessById(context.businessId)
        : null;

      sendSuccess(res, { success: true, business }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/business or POST /api/onboarding/business
   *
   * Upserts by ownerId, so it is both the onboarding create and the owner's
   * edit. That makes it the one mutation that cannot sit behind
   * `attachBusinessContext` — during onboarding there is no workspace yet.
   *
   * Hence the explicit guard: a staff member reaching this would not have leaked
   * anything, but the owner-scoped upsert would have found no business of their
   * own and cheerfully created a second workspace with them as its owner, leaving
   * them owning one workspace while working in another.
   */
  public static async saveProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);

      const context = await BusinessContextService.tryResolve(req.user.id);
      if (context && context.businessRole !== 'owner') {
        throw new AppError(
          'Only the workspace owner can change the business profile.',
          403
        );
      }

      const business = await BusinessService.saveBusinessProfile(req.user.id, req.body);
      sendSuccess(res, { success: true, message: 'Business profile saved', business }, 201);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/business/me
  public static async updateProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const business = await BusinessService.saveBusinessProfile(req.user.id, req.body);
      sendSuccess(res, { success: true, message: 'Business updated', business }, 200);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/onboarding/services
  public static async updateServices(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const business = await BusinessService.updateServices(req.user.id, req.body.services);
      sendSuccess(res, { success: true, message: 'Services updated', business }, 200);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/onboarding/service-area
  public static async updateServiceArea(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const business = await BusinessService.updateServiceArea(req.user.id, req.body.serviceArea || req.body);
      sendSuccess(res, { success: true, message: 'Service area updated', business }, 200);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/onboarding/phone
  public static async completePhoneStep(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const business = await BusinessService.completePhoneStep(req.user.id, req.body);
      sendSuccess(res, { success: true, message: 'Telephony setup saved', business }, 200);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/onboarding/hours
  public static async updateHours(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const { businessHours, emergencyService } = req.body;
      const business = await BusinessService.updateHours(req.user.id, businessHours, emergencyService);
      sendSuccess(res, { success: true, message: 'Hours updated', business }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/onboarding/complete or /api/business/onboarding/complete
  public static async completeOnboarding(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const business = await BusinessService.completeOnboarding(req.user.id);
      sendSuccess(res, { success: true, message: 'Onboarding completed successfully', business }, 200);
    } catch (error) {
      next(error);
    }
  }
}
