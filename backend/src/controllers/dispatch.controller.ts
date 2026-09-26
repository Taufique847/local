import { Response, NextFunction } from 'express';
import { TechnicianDispatchService } from '../services/technician-dispatch.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class DispatchController {
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

  // POST /api/dispatch/zones
  public static async createZone(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);
      const { name, zipCodes, travelBufferMinutes, travelFee } = req.body;

      if (!name || !zipCodes || !Array.isArray(zipCodes)) {
        throw new AppError('name and zipCodes array are required', 400);
      }

      const zone = await TechnicianDispatchService.createZone(businessId, {
        name,
        zipCodes,
        travelBufferMinutes,
        travelFee,
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
      /**
       * `startAt` is passed through, which it never was.
       *
       * The availability half of the matcher only runs when it has a window, and the only
       * caller omitted it — so in production the suggestion was made without ever checking
       * whether the person was free. The body is now validated, so these arrive typed.
       */
      const { zipCode, requiredSkill, startAt, endAt, customerId, serviceId } = req.body;

      /**
       * A customer or service id is accepted as a shorthand.
       *
       * The booking modal knows those two long before it knows a ZIP or a skill tag, and
       * making the UI re-derive them would mean the ZIP it sends could disagree with the
       * address the invoice uses. Resolved server-side from the same records.
       */
      const resolved = await TechnicianDispatchService.resolveMatchContext(businessId, {
        zipCode,
        requiredSkill,
        customerId,
        serviceId,
      });

      const result = await TechnicianDispatchService.findOptimalTechnician(businessId, {
        ...resolved,
        startAt,
        endAt,
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

  // GET /api/dispatch/map-data
  public static async getMapData(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);
      const date = req.query.date as string | undefined;

      const data = await TechnicianDispatchService.getMapData(businessId, date);
      sendSuccess(res, { success: true, ...data }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/dispatch/route
  public static async getDailyRoute(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);
      const technicianId = req.query.technicianId as string;
      const date = req.query.date as string | undefined;

      if (!technicianId) {
        throw new AppError('technicianId query parameter is required', 400);
      }

      const route = await TechnicianDispatchService.getDailyRoute(businessId, technicianId, date);
      sendSuccess(res, { success: true, route }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/dispatch/send-route
  public static async sendDailyRoute(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await DispatchController.getBusinessId(req.user.id);
      const { technicianId, date } = req.body;

      if (!technicianId) {
        throw new AppError('technicianId is required in body', 400);
      }

      const result = await TechnicianDispatchService.dispatchDailyRoute(businessId, technicianId, date);
      sendSuccess(res, { ...result, message: 'Daily route itinerary dispatched to technician via SMS' }, 200);
    } catch (error) {
      next(error);
    }
  }
}
