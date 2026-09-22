import { Response, NextFunction } from 'express';
import { ReviewReputationService } from '../services/review-reputation.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class ReviewController {
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

  // GET /api/reviews/stats
  public static async getReputationStats(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ReviewController.getBusinessId(req.user.id);
      const stats = await ReviewReputationService.getReputationStats(businessId);
      sendSuccess(res, { success: true, ...stats }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/reviews
  public static async listCampaigns(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ReviewController.getBusinessId(req.user.id);
      const { status, isShielded, page, limit } = req.query;

      const result = await ReviewReputationService.listCampaigns(businessId, {
        status: status as string,
        isShielded: isShielded !== undefined ? isShielded === 'true' : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/reviews/trigger
  public static async triggerSurvey(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const { appointmentId, bypassQuietHours } = req.body;

      if (!appointmentId) {
        throw new AppError('appointmentId is required', 400);
      }

      const campaign = await ReviewReputationService.triggerPostServiceSurvey(appointmentId, {
        bypassQuietHours: bypassQuietHours ?? true,
      });

      sendSuccess(res, { success: true, campaign }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/reviews/reply (For webhook or manual simulation)
  public static async handleRatingReply(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const { from, text } = req.body;
      if (!from || !text) {
        throw new AppError('from and text are required', 400);
      }

      // businessId is derived from the session, never taken from the request.
      const businessId = await ReviewController.getBusinessId(req.user.id);
      const result = await ReviewReputationService.handleCustomerRatingReply(businessId, from, text);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/reviews/:id/resolve
  public static async resolveReview(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ReviewController.getBusinessId(req.user.id);
      const { notes } = req.body;

      if (!notes) {
        throw new AppError('Resolution notes are required', 400);
      }

      const campaign = await ReviewReputationService.resolveShieldedReview(
        businessId,
        req.params.id,
        notes
      );

      sendSuccess(res, { success: true, campaign }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/reviews/check-sla
  public static async checkSlaBreaches(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ReviewController.getBusinessId(req.user.id);
      const breachedCount = await ReviewReputationService.checkSlaBreaches(businessId);
      sendSuccess(res, { success: true, breachedCount }, 200);
    } catch (error) {
      next(error);
    }
  }
}
