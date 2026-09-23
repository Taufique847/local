import { Response, NextFunction } from 'express';
import { AppointmentReplyService } from '../services/appointment-reply.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

/**
 * The owner's reschedule queue.
 *
 * Every handler resolves the workspace by membership, so a dispatcher sees the
 * same queue as the owner and neither can reach another tenant's requests.
 */
export class RescheduleRequestController {
  private static async getBusinessId(userId: string): Promise<string> {
    const context = await BusinessContextService.resolve(userId);
    return context.businessId;
  }

  // GET /api/reschedule-requests
  public static async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await RescheduleRequestController.getBusinessId(req.user.id);
      const result = await AppointmentReplyService.listRequests(businessId, req.query as any);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/reschedule-requests/:id/apply
  public static async apply(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await RescheduleRequestController.getBusinessId(req.user.id);
      const result = await AppointmentReplyService.applyRequest(businessId, req.params.id, {
        startAt: req.body.startAt,
        endAt: req.body.endAt,
        resolvedBy: req.user.id,
      });
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/reschedule-requests/:id/dismiss
  public static async dismiss(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await RescheduleRequestController.getBusinessId(req.user.id);
      const request = await AppointmentReplyService.dismissRequest(
        businessId,
        req.params.id,
        req.user.id
      );
      sendSuccess(res, { success: true, request }, 200);
    } catch (error) {
      next(error);
    }
  }
}
