import { Request, Response, NextFunction } from 'express';
import { EstimateService } from '../services/estimate.service';
import { BusinessContextService } from '../services/business-context.service';
import { AppError } from '../types';

export class EstimateController {
  /**
   * Resolves the caller's workspace by MEMBERSHIP.
   *
   * `req.businessId` is set by `attachBusinessContext`; the fallback covers
   * routes that have not been given that middleware yet. The previous version
   * checked `req.business` and `req.user.businessId`, neither of which was ever
   * populated, then fell through to an owner-only lookup.
   */
  private static async getBusinessId(req: any): Promise<string> {
    if (req.businessId) return req.businessId as string;
    if (!req.user?.id) throw new AppError('Authentication required', 401);
    const context = await BusinessContextService.resolve(req.user.id);
    return context.businessId;
  }

  public static async createEstimate(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await EstimateController.getBusinessId(req);
      const estimate = await EstimateService.createEstimate(businessId, req.body);
      res.status(201).json({ success: true, estimate });
    } catch (err) {
      next(err);
    }
  }

  public static async getEstimates(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await EstimateController.getBusinessId(req);
      const result = await EstimateService.getEstimates(businessId, req.query);
      // Spread so `estimates` stays top level for existing clients, with
      // total/page/totalPages alongside it.
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  public static async getEstimateById(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await EstimateController.getBusinessId(req);
      const estimate = await EstimateService.getEstimateById(businessId, req.params.id);
      res.status(200).json({ success: true, estimate });
    } catch (err) {
      next(err);
    }
  }

  public static async convertToInvoice(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await EstimateController.getBusinessId(req);
      const result = await EstimateService.convertToInvoice(businessId, req.params.id);
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
}
