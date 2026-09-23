import { Response, NextFunction } from 'express';
import { EquipmentService } from '../services/equipment.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

/**
 * Customer equipment.
 *
 * Nested under the customer for reads and creates, because a unit only exists in
 * the context of one, and flat by id for updates so the client does not have to
 * carry the customer id around to edit a row it already has.
 */
export class EquipmentController {
  private static async getBusinessId(userId: string): Promise<string> {
    const context = await BusinessContextService.resolve(userId);
    return context.businessId;
  }

  // GET /api/customers/:customerId/equipment
  public static async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await EquipmentController.getBusinessId(req.user.id);
      const equipment = await EquipmentService.listForCustomer(
        businessId,
        req.params.customerId,
        // Retired units are hidden by default but must be reachable: a replaced unit
        // is exactly what a technician wants when the new one fails.
        { includeInactive: req.query.includeInactive === 'true' }
      );
      sendSuccess(res, { success: true, equipment }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/customers/:customerId/equipment
  public static async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await EquipmentController.getBusinessId(req.user.id);
      const equipment = await EquipmentService.create(
        businessId,
        req.params.customerId,
        req.body
      );
      sendSuccess(res, { success: true, equipment }, 201);
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/equipment/:id
  public static async update(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await EquipmentController.getBusinessId(req.user.id);
      const equipment = await EquipmentService.update(businessId, req.params.id, req.body);
      sendSuccess(res, { success: true, equipment }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/equipment/:id/retire
  public static async retire(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await EquipmentController.getBusinessId(req.user.id);
      const equipment = await EquipmentService.retire(businessId, req.params.id);
      sendSuccess(res, { success: true, equipment }, 200);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/equipment/:id
  public static async remove(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await EquipmentController.getBusinessId(req.user.id);
      await EquipmentService.remove(businessId, req.params.id);
      sendSuccess(res, { success: true, message: 'Equipment removed' }, 200);
    } catch (error) {
      next(error);
    }
  }
}
