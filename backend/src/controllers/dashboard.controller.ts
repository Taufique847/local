import { Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { CallCostService } from '../services/call-cost.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class DashboardController {
  /** businessId is always derived from the session, never from the request. */
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
