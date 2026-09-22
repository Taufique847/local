import { Request, Response, NextFunction } from 'express';
import { InvoiceService } from '../services/invoice.service';
import { BusinessContextService } from '../services/business-context.service';
import { AppError } from '../types';

export class InvoiceController {
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

  public static async createInvoice(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await InvoiceController.getBusinessId(req);
      const invoice = await InvoiceService.createInvoice(businessId, req.body);
      res.status(201).json({ success: true, invoice });
    } catch (err) {
      next(err);
    }
  }

  public static async getInvoices(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await InvoiceController.getBusinessId(req);
      const result = await InvoiceService.getInvoices(businessId, req.query);
      // Spread so `invoices` stays top level for existing clients, with
      // total/page/totalPages alongside it.
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  public static async getInvoiceById(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await InvoiceController.getBusinessId(req);
      const invoice = await InvoiceService.getInvoiceById(businessId, req.params.id);
      res.status(200).json({ success: true, invoice });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Records a payment the contractor received directly (cash, check, card
   * terminal). Scoped by businessId so a logged-in user of one tenant cannot
   * mutate another tenant's invoice.
   */
  public static async recordManualPayment(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await InvoiceController.getBusinessId(req);
      // req.body was validated and stripped by validateBody(recordPaymentSchema)
      const invoice = await InvoiceService.recordPaymentForBusiness(
        businessId,
        req.params.id,
        req.body
      );
      res.status(200).json({ success: true, invoice });
    } catch (err) {
      next(err);
    }
  }

  public static async getInvoiceStats(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await InvoiceController.getBusinessId(req);
      const stats = await InvoiceService.getInvoiceStats(businessId);
      res.status(200).json({ success: true, stats });
    } catch (err) {
      next(err);
    }
  }
}
