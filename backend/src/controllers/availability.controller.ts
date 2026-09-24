import { Response, NextFunction } from 'express';
import { AvailabilityService } from '../services/availability.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class AvailabilityController {
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

  // GET /api/availability/slots?serviceId=...&date=YYYY-MM-DD
  public static async getSlots(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AvailabilityController.getBusinessId(req.user.id);

      const { serviceId, date } = req.query;
      if (!serviceId || typeof serviceId !== 'string') {
        throw new AppError('serviceId query parameter is required', 400);
      }
      if (!date || typeof date !== 'string') {
        throw new AppError('date query parameter (YYYY-MM-DD) is required', 400);
      }

      /**
       * An optional technician narrows availability to one person's diary.
       *
       * Without it the answer is the business's remaining capacity, which is what
       * the booking modal wants before anyone has been picked.
       */
      const { technicianId } = req.query;

      const result = await AvailabilityService.getAvailableSlots(businessId, serviceId, date, {
        technicianId: typeof technicianId === 'string' && technicianId ? technicianId : null,
      });
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/availability/check-conflict
  public static async checkConflict(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AvailabilityController.getBusinessId(req.user.id);

      const { startAt, endAt, excludeAppointmentId, technicianId } = req.body;
      if (!startAt || !endAt) {
        throw new AppError('startAt and endAt are required', 400);
      }

      /**
       * Returns the reason as well as the boolean.
       *
       * "Already booked" is not actionable; "Dana is already booked for that time"
       * tells a dispatcher to pick someone else, which is the decision they are at
       * this screen to make.
       */
      const result = await AvailabilityService.checkSlotConflictDetailed(
        businessId,
        new Date(startAt),
        new Date(endAt),
        { excludeAppointmentId, technicianId }
      );

      sendSuccess(res, { success: true, hasConflict: result.conflict, reason: result.reason }, 200);
    } catch (error) {
      next(error);
    }
  }
}
