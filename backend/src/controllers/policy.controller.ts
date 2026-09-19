import { Response, NextFunction } from 'express';
import { PolicyGuardrailsService } from '../services/policy-guardrails.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class PolicyController {
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
  }

  // GET /api/policies
  public static async getPolicy(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await PolicyController.getBusinessId(req.user.id);
      const policy = await PolicyGuardrailsService.getPolicy(businessId);
      sendSuccess(res, { success: true, policy }, 200);
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/policies
  public static async updatePolicy(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await PolicyController.getBusinessId(req.user.id);
      const policy = await PolicyGuardrailsService.updatePolicy(businessId, req.body);
      sendSuccess(res, { success: true, policy, message: 'Business policies updated successfully' }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/policies/validate-booking
  public static async validateBooking(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await PolicyController.getBusinessId(req.user.id);
      const { startAt } = req.body;
      if (!startAt) {
        throw new AppError('startAt is required', 400);
      }
      const result = await PolicyGuardrailsService.validateBookingTime(businessId, new Date(startAt));
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/policies/check-emergency
  public static async checkEmergency(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await PolicyController.getBusinessId(req.user.id);
      const { text } = req.body;
      if (!text) {
        throw new AppError('text is required', 400);
      }
      const result = await PolicyGuardrailsService.checkEmergencyKeywords(businessId, text);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }
}
