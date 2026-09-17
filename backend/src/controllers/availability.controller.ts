import { Response, NextFunction } from 'express';
import { AvailabilityService } from '../services/availability.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class AvailabilityController {
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
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

      const result = await AvailabilityService.getAvailableSlots(businessId, serviceId, date);
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

      const { startAt, endAt, excludeAppointmentId } = req.body;
      if (!startAt || !endAt) {
        throw new AppError('startAt and endAt are required', 400);
      }

      const hasConflict = await AvailabilityService.checkSlotConflict(
        businessId,
        new Date(startAt),
        new Date(endAt),
        excludeAppointmentId
      );

      sendSuccess(res, { success: true, hasConflict }, 200);
    } catch (error) {
      next(error);
    }
  }
}
