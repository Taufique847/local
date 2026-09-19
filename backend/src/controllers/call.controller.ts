import { Response, NextFunction } from 'express';
import { CallService } from '../services/call.service';
import { CallAnalyticsService } from '../services/call-analytics.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class CallController {
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
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

  // POST /api/calls/simulate (Testing test call trigger)
  public static async simulateCall(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CallController.getBusinessId(req.user.id);
      const { callerPhone, durationSeconds, transcript, outcome, notes } = req.body;

      if (!callerPhone) {
        throw new AppError('callerPhone is required for simulated call', 400);
      }

      const call = await CallService.simulateInboundCall(
        businessId,
        callerPhone,
        durationSeconds || 45,
        { transcript, outcome, notes }
      );
      sendSuccess(res, { success: true, call }, 201);
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
