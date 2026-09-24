import { Response, NextFunction } from 'express';
import { AppointmentService } from '../services/appointment.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class AppointmentController {
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

  public static async getAppointments(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AppointmentController.getBusinessId(req.user.id);
      const result = await AppointmentService.getAppointments(businessId, req.query);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  public static async getTodayAppointments(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AppointmentController.getBusinessId(req.user.id);
      const appointments = await AppointmentService.getTodayAppointments(businessId);
      sendSuccess(res, { success: true, appointments }, 200);
    } catch (error) {
      next(error);
    }
  }

  public static async getAppointmentById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AppointmentController.getBusinessId(req.user.id);
      const appointment = await AppointmentService.getAppointmentById(businessId, req.params.id);
      sendSuccess(res, { success: true, appointment }, 200);
    } catch (error) {
      next(error);
    }
  }

  public static async createAppointment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AppointmentController.getBusinessId(req.user.id);
      const appointment = await AppointmentService.createAppointment(
        businessId,
        req.body,
        req.user.name || 'owner'
      );
      sendSuccess(res, { success: true, appointment }, 201);
    } catch (error) {
      next(error);
    }
  }

  public static async updateAppointment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AppointmentController.getBusinessId(req.user.id);
      const appointment = await AppointmentService.updateAppointment(
        businessId,
        req.params.id,
        req.body
      );
      sendSuccess(res, { success: true, appointment }, 200);
    } catch (error) {
      next(error);
    }
  }

  public static async updateStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AppointmentController.getBusinessId(req.user.id);
      const { status, cancellationReason } = req.body;
      const appointment = await AppointmentService.updateStatus(
        businessId,
        req.params.id,
        status,
        cancellationReason
      );
      sendSuccess(res, { success: true, appointment }, 200);
    } catch (error) {
      next(error);
    }
  }

  public static async deleteAppointment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AppointmentController.getBusinessId(req.user.id);
      await AppointmentService.deleteAppointment(businessId, req.params.id);
      sendSuccess(res, { success: true, message: 'Appointment deleted successfully' }, 200);
    } catch (error) {
      next(error);
    }
  }

  public static async rescheduleAppointment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AppointmentController.getBusinessId(req.user.id);
      /**
       * No manual `if (!startAt)` here. `rescheduleAppointmentSchema` requires it and
       * reports it against the field, which a form can highlight; the hand-rolled check
       * produced a sentence with nothing to attach it to, and two guards for one
       * condition meant neither could be tested independently of the other.
       */
      const { startAt, endAt, reason } = req.body;

      const appointment = await AppointmentService.rescheduleAppointment(businessId, req.params.id, {
        startAt,
        endAt,
        reason,
        changedBy: req.user.email || 'user',
      });

      sendSuccess(res, { success: true, message: 'Appointment rescheduled successfully', appointment }, 200);
    } catch (error) {
      next(error);
    }
  }

  public static async cancelAppointment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AppointmentController.getBusinessId(req.user.id);
      const { reason } = req.body;

      const appointment = await AppointmentService.cancelAppointment(
        businessId,
        req.params.id,
        reason,
        req.user.email || 'user'
      );

      sendSuccess(res, { success: true, message: 'Appointment cancelled successfully', appointment }, 200);
    } catch (error) {
      next(error);
    }
  }

  public static async getCalendar(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AppointmentController.getBusinessId(req.user.id);
      const { from, to } = req.query;

      if (!from || !to) {
        throw new AppError('from and to query parameters are required (YYYY-MM-DD)', 400);
      }

      const appointments = await AppointmentService.getCalendarAppointments(
        businessId,
        String(from),
        String(to)
      );

      sendSuccess(res, { success: true, appointments }, 200);
    } catch (error) {
      next(error);
    }
  }
}
