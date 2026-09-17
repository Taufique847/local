import { Response, NextFunction } from 'express';
import { ServiceService } from '../services/service.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class ServiceController {
  // Helper to ensure authenticated user has an active business
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
  }

  // GET /api/services
  public static async getServices(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ServiceController.getBusinessId(req.user.id);
      const result = await ServiceService.getServices(businessId, req.query);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/services/stats
  public static async getServiceStats(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ServiceController.getBusinessId(req.user.id);
      const stats = await ServiceService.getServiceStats(businessId);
      sendSuccess(res, { success: true, stats }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/services/:id
  public static async getServiceById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ServiceController.getBusinessId(req.user.id);
      const service = await ServiceService.getServiceById(businessId, req.params.id);

      if (!service) {
        throw new AppError('Service not found', 404);
      }

      sendSuccess(res, { success: true, service }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/services
  public static async createService(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ServiceController.getBusinessId(req.user.id);

      const { name, description, durationMinutes, startingPrice, category, isEmergencyService, status } = req.body;

      if (!name || !name.trim()) {
        throw new AppError('Service name is required', 400);
      }

      const service = await ServiceService.createService(businessId, {
        name,
        description,
        durationMinutes,
        startingPrice,
        category,
        isEmergencyService,
        status,
      });

      sendSuccess(res, { success: true, message: 'Service created successfully', service }, 201);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/services/:id
  public static async updateService(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ServiceController.getBusinessId(req.user.id);

      const service = await ServiceService.updateService(businessId, req.params.id, req.body);

      if (!service) {
        throw new AppError('Service not found', 404);
      }

      sendSuccess(res, { success: true, message: 'Service updated successfully', service }, 200);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/services/:id/status
  public static async updateServiceStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ServiceController.getBusinessId(req.user.id);
      const { status } = req.body;

      if (!status) {
        throw new AppError('Status is required', 400);
      }

      const service = await ServiceService.updateServiceStatus(businessId, req.params.id, status);

      if (!service) {
        throw new AppError('Service not found', 404);
      }

      sendSuccess(res, { success: true, message: 'Service status updated successfully', service }, 200);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/services/:id (Archive)
  public static async archiveService(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ServiceController.getBusinessId(req.user.id);
      const service = await ServiceService.archiveService(businessId, req.params.id);

      if (!service) {
        throw new AppError('Service not found', 404);
      }

      sendSuccess(res, { success: true, message: 'Service archived successfully', service }, 200);
    } catch (error) {
      next(error);
    }
  }
}
