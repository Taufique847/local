import { Response, NextFunction } from 'express';
import { CustomerSegmentService } from '../services/customer-segment.service';
import { sanitiseCustomerFilter } from '../services/customer-filter';
import { BusinessScopedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

/**
 * Saved customer segments and campaigns.
 *
 * Reads `req.businessId`, resolved once by `attachBusinessContext`. Sending is
 * owner-gated at the route — a campaign reaches every customer in the segment, which
 * is not a dispatcher's decision to make.
 */
export class CustomerSegmentController {
  private static businessId(req: BusinessScopedRequest): string {
    if (!req.businessId) throw new AppError('No workspace found for this account', 400);
    return req.businessId;
  }

  // GET /api/segments
  public static async list(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const segments = await CustomerSegmentService.list(
        CustomerSegmentController.businessId(req)
      );
      sendSuccess(res, { success: true, segments }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/segments/count
   *
   * Counts an unsaved filter, so the editor can show the audience size before the
   * operator commits to a name. Same builder as the list and the campaign, so the
   * number shown here is the number that will be sent to.
   */
  public static async count(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const count = await CustomerSegmentService.count(
        CustomerSegmentController.businessId(req),
        sanitiseCustomerFilter(req.body?.filter)
      );
      sendSuccess(res, { success: true, count }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/segments
  public static async create(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const segment = await CustomerSegmentService.create(
        CustomerSegmentController.businessId(req),
        { ...req.body, createdBy: req.user?.id }
      );
      sendSuccess(res, { success: true, segment }, 201);
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/segments/:id
  public static async update(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const segment = await CustomerSegmentService.update(
        CustomerSegmentController.businessId(req),
        req.params.id,
        req.body
      );
      sendSuccess(res, { success: true, segment }, 200);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/segments/:id
  public static async remove(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      await CustomerSegmentService.remove(
        CustomerSegmentController.businessId(req),
        req.params.id
      );
      sendSuccess(res, { success: true, message: 'Segment deleted' }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/segments/:id/preview
  public static async preview(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await CustomerSegmentService.preview(
        CustomerSegmentController.businessId(req),
        req.params.id,
        Number(req.query.limit) || 25
      );
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/segments/:id/campaign
  public static async sendCampaign(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await CustomerSegmentService.sendCampaign(
        CustomerSegmentController.businessId(req),
        req.params.id,
        req.body
      );
      sendSuccess(res, { success: true, result }, 200);
    } catch (error) {
      next(error);
    }
  }
}
