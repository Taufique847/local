import { Response, NextFunction } from 'express';
import { AppointmentService } from '../services/appointment.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class AppointmentController {
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
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
}
