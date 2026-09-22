import { Response, NextFunction } from 'express';
import { LeadRecoveryService } from '../services/lead-recovery.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class LeadRecoveryController {
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

  // GET /api/recovery/stats
  public static async getStats(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await LeadRecoveryController.getBusinessId(req.user.id);
      const stats = await LeadRecoveryService.getRecoveryStats(businessId);
      sendSuccess(res, { success: true, ...stats }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/recovery/trigger
  public static async triggerRecovery(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const { callLogId } = req.body;
      if (!callLogId) {
        throw new AppError('callLogId is required', 400);
      }

      const recovery = await LeadRecoveryService.triggerRecoveryForCall(callLogId);
      sendSuccess(res, { success: true, recovery, message: 'Recovery campaign initiated' }, 201);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/recovery/process-drips
  public static async processDrips(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await LeadRecoveryController.getBusinessId(req.user.id);
      const processedCount = await LeadRecoveryService.processDueDrips(businessId);
      sendSuccess(res, { success: true, processedCount, message: `Processed ${processedCount} due recovery drips` }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/recovery/reply
  public static async handleReply(
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

      // businessId is derived from the session, never taken from the request,
      // so this manual/simulation endpoint cannot touch another tenant.
      const businessId = await LeadRecoveryController.getBusinessId(req.user.id);
      const result = await LeadRecoveryService.handleInboundCustomerReply(businessId, from, text);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }
}
