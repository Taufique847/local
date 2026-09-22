import { Response, NextFunction } from 'express';
import { CallService } from '../services/call.service';
import { CallAnalyticsService } from '../services/call-analytics.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class CallController {
  /**
   * Resolves the caller's workspace by MEMBERSHIP, not by ownership.
   *
   * This used to be `getBusinessByOwnerId`, which answers "which business does
   * this person own" — correct for owners and empty for everyone else. Staff
   * accounts would have been told to complete a business profile they do not own.
   */
  private static async getBusinessId(userId: string): Promise<string> {
    const context = await BusinessContextService.resolve(userId);
    return context.businessId;
  }

  // GET /api/calls
  public static async getCalls(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CallController.getBusinessId(req.user.id);
      const result = await CallService.getCalls(businessId, req.query);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/calls/stats
  public static async getCallStats(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CallController.getBusinessId(req.user.id);
      const stats = await CallService.getCallStats(businessId);
      sendSuccess(res, { success: true, stats }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/calls/:id
  public static async getCallById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CallController.getBusinessId(req.user.id);
      const call = await CallService.getCallById(businessId, req.params.id);
      sendSuccess(res, { success: true, call }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/calls/test-call/readiness
  public static async getTestCallReadiness(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CallController.getBusinessId(req.user.id);
      const readiness = await CallService.getTestCallReadiness(businessId);
      sendSuccess(res, { success: true, readiness }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/calls/test-call
   *
   * Places a real call from the business AI line to the owner's registered
   * number. The destination is resolved server side on purpose — it is not
   * accepted from the request body — so this cannot be used as a general dialer.
   *
   * Replaces POST /api/calls/simulate, which wrote an invented conversation
   * straight into the call history.
   */
  public static async startTestCall(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CallController.getBusinessId(req.user.id);
      const result = await CallService.startTestCall(businessId);
      sendSuccess(res, { success: true, ...result }, 202);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/calls/:id/transcript
  public static async getTranscript(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CallController.getBusinessId(req.user.id);
      const data = await CallAnalyticsService.getCallTranscript(businessId, req.params.id);
      sendSuccess(res, { success: true, ...data }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/calls/analytics/summary
  public static async getAnalytics(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CallController.getBusinessId(req.user.id);
      const days = req.query.days ? Number(req.query.days) : 30;
      const analytics = await CallAnalyticsService.getAnalyticsSummary(businessId, days);
      sendSuccess(res, { success: true, analytics }, 200);
    } catch (error) {
      next(error);
    }
  }
}
