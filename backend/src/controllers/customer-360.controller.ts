import { Response, NextFunction } from 'express';
import { Customer360Service } from '../services/customer-360.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class Customer360Controller {
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

  // GET /api/customers/:id/360
  public static async getCustomer360(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await Customer360Controller.getBusinessId(req.user.id);
      const data = await Customer360Service.getCustomer360(businessId, req.params.id);
      sendSuccess(res, { success: true, ...data }, 200);
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/customers/:id/tags
  public static async updateTags(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await Customer360Controller.getBusinessId(req.user.id);
      const { tags } = req.body;

      if (!Array.isArray(tags)) {
        throw new AppError('tags must be an array of strings', 400);
      }

      const updatedTags = await Customer360Service.updateCustomerTags(businessId, req.params.id, tags);
      sendSuccess(res, { success: true, tags: updatedTags }, 200);
    } catch (error) {
      next(error);
    }
  }
}
