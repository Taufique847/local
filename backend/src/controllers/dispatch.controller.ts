import { Response, NextFunction } from 'express';
import { TechnicianDispatchService } from '../services/technician-dispatch.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class DispatchController {
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
  }

  // POST /api/dispatch/zones
  public static async createZone(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);
      const { name, zipCodes, travelBufferMinutes } = req.body;

      if (!name || !zipCodes || !Array.isArray(zipCodes)) {
        throw new AppError('name and zipCodes array are required', 400);
      }

      const zone = await TechnicianDispatchService.createZone(businessId, {
        name,
        zipCodes,
        travelBufferMinutes,
      });

      sendSuccess(res, { success: true, zone, message: 'Service zone created successfully' }, 201);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/dispatch/zones
  public static async getZones(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);
      const zones = await TechnicianDispatchService.getZones(businessId);
      sendSuccess(res, { success: true, zones }, 200);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/dispatch/zones/:id
  public static async deleteZone(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);

      const removed = await TechnicianDispatchService.deactivateZone(businessId, req.params.id);
      if (!removed) throw new AppError('Service zone not found', 404);

      sendSuccess(res, { success: true, message: 'Service zone removed' }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/dispatch/technicians
  public static async createTechnician(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);
      const { name, phone, email, skills, assignedZoneIds } = req.body;

      if (!name || !phone) {
        throw new AppError('name and phone are required for technician', 400);
      }

      const technician = await TechnicianDispatchService.createTechnician(businessId, {
        name,
        phone,
        email,
        skills,
        assignedZoneIds,
      });

      sendSuccess(res, { success: true, technician, message: 'Technician registered successfully' }, 201);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/dispatch/technicians
  public static async getTechnicians(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);
      const technicians = await TechnicianDispatchService.getTechnicians(businessId, req.query as any);
      sendSuccess(res, { success: true, technicians }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/dispatch/match-tech
  public static async matchTechnician(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);
      const { zipCode, equipmentRequirement } = req.body;

      const result = await TechnicianDispatchService.findOptimalTechnician(businessId, {
        zipCode,
        equipmentRequirement,
      });

      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/dispatch/appointments/:id
  public static async dispatchAppointment(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);
      const { id } = req.params;

      const result = await TechnicianDispatchService.dispatchAppointment(businessId, id);
      sendSuccess(res, { ...result, message: 'Dispatch alert sent to technician' }, 200);
    } catch (error) {
      next(error);
    }
  }
}
