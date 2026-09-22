import { Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { CallCostService } from '../services/call-cost.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class DashboardController {
  /** businessId is always derived from the session, never from the request. */
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
  }

  // GET /api/dashboard/overview
  public static async getOverview(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DashboardController.getBusinessId(req.user.id);
      const overview = await DashboardService.getOverview(businessId);
      sendSuccess(res, { success: true, ...overview }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/dashboard/costs?days=30
   *
   * Estimated provider spend for the period, derived from recorded per-call
   * usage. `CallLog.metrics` had been captured on every call since the real
   * voice pipeline landed but was never read, so unit economics were invisible.
   */
  public static async getCosts(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DashboardController.getBusinessId(req.user.id);

      const requested = Number(req.query.days);
      const days = Number.isFinite(requested)
        ? Math.min(365, Math.max(1, Math.trunc(requested)))
        : 30;

      const costs = await CallCostService.getCostSummary(businessId, days);
      sendSuccess(res, { success: true, costs }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/dashboard/activation
  public static async getActivation(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DashboardController.getBusinessId(req.user.id);
      const activation = await DashboardService.getActivationChecklist(businessId);
      sendSuccess(res, { success: true, activation }, 200);
    } catch (error) {
      next(error);
    }
  }
}
