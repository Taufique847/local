import { Request, Response, NextFunction } from 'express';
import { EstimateService } from '../services/estimate.service';
import { BusinessService } from '../services/business.service';
import { AppError } from '../types';

export class EstimateController {
  private static async getBusinessId(req: any): Promise<string> {
    if (req.business?._id) return req.business._id.toString();
    if (req.user?.businessId) return req.user.businessId.toString();
    if (req.user?.id) {
      const business = await BusinessService.getBusinessByOwnerId(req.user.id);
      if (business) return business.id;
    }
    throw new AppError('Business workspace not found', 400);
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
