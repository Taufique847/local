import { Response, NextFunction } from 'express';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class BusinessController {
  // GET /api/business/me or /api/onboarding/status
  public static async getMyBusiness(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const business = await BusinessService.getBusinessByOwnerId(req.user.id);
      sendSuccess(res, { success: true, business }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/business or POST /api/onboarding/business
  public static async saveProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
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
