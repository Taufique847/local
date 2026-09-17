import { Response, NextFunction } from 'express';
import { LeadService } from '../services/lead.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class LeadController {
  // Helper to ensure authenticated user has an active business
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
  }

  // GET /api/leads
  public static async getLeads(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await LeadController.getBusinessId(req.user.id);
      const result = await LeadService.getLeads(businessId, req.query);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/leads/stats
  public static async getLeadStats(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await LeadController.getBusinessId(req.user.id);
      const stats = await LeadService.getLeadStats(businessId);
      sendSuccess(res, { success: true, stats }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/leads/:id
  public static async getLeadById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await LeadController.getBusinessId(req.user.id);
      const lead = await LeadService.getLeadById(businessId, req.params.id);

      if (!lead) {
        throw new AppError('Lead not found', 404);
      }

      sendSuccess(res, { success: true, lead }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/leads
  public static async createLead(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await LeadController.getBusinessId(req.user.id);

      const { customerId, title, description, service, status, priority, source, estimatedValue, notes } = req.body;

      if (!customerId) {
        throw new AppError('Customer is required to create a lead', 400);
      }

      if (!title || !title.trim()) {
        throw new AppError('Lead title is required', 400);
      }

      const lead = await LeadService.createLead(businessId, {
        customerId,
        title,
        description,
        service,
        status,
        priority,
        source,
        estimatedValue,
        notes,
      });

      sendSuccess(res, { success: true, message: 'Lead created successfully', lead }, 201);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/leads/:id
  public static async updateLead(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await LeadController.getBusinessId(req.user.id);

      const lead = await LeadService.updateLead(businessId, req.params.id, req.body);

      if (!lead) {
        throw new AppError('Lead not found', 404);
      }

      sendSuccess(res, { success: true, message: 'Lead updated successfully', lead }, 200);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/leads/:id/status
  public static async updateLeadStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await LeadController.getBusinessId(req.user.id);
      const { status } = req.body;

      if (!status) {
        throw new AppError('Status is required', 400);
      }

      const lead = await LeadService.updateLeadStatus(businessId, req.params.id, status);

      if (!lead) {
        throw new AppError('Lead not found', 404);
      }

      sendSuccess(res, { success: true, message: 'Lead status updated successfully', lead }, 200);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/leads/:id (Archive)
  public static async archiveLead(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await LeadController.getBusinessId(req.user.id);
      const lead = await LeadService.archiveLead(businessId, req.params.id);

      if (!lead) {
        throw new AppError('Lead not found', 404);
      }

      sendSuccess(res, { success: true, message: 'Lead archived successfully', lead }, 200);
    } catch (error) {
      next(error);
    }
  }
}
