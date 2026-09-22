import { Response, NextFunction } from 'express';
import { AgentMemoryService } from '../services/agent-memory.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class AgentMemoryController {
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

  // GET /api/customers/:customerId/memories
  public static async getMemories(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AgentMemoryController.getBusinessId(req.user.id);
      const { customerId } = req.params;
      const { category } = req.query;

      const memories = await AgentMemoryService.getMemoriesForCustomer(
        businessId,
        customerId,
        category as any
      );
      sendSuccess(res, { success: true, memories }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/customers/:customerId/memories
  public static async createMemory(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AgentMemoryController.getBusinessId(req.user.id);
      const { customerId } = req.params;
      const { category, key, value, confidence, expiresAt } = req.body;

      if (!key || !value) {
        throw new AppError('key and value are required for memory', 400);
      }

      const memory = await AgentMemoryService.storeMemory({
        businessId,
        customerId,
        category: category || 'preference',
        key,
        value,
        confidence,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });

      sendSuccess(res, { success: true, memory, message: 'Agent memory saved successfully' }, 201);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/customers/:customerId/memories/:memoryId
  public static async deleteMemory(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AgentMemoryController.getBusinessId(req.user.id);
      const { memoryId } = req.params;

      const deleted = await AgentMemoryService.deleteMemory(businessId, memoryId);
      if (!deleted) {
        throw new AppError('Memory not found or already deleted', 404);
      }

      sendSuccess(res, { success: true, message: 'Memory deleted successfully' }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/customers/:customerId/context
  public static async getCustomerContext(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await AgentMemoryController.getBusinessId(req.user.id);
      const { customerId } = req.params;

      const context = await AgentMemoryService.assembleCustomerContext(businessId, customerId);
      sendSuccess(res, { success: true, context }, 200);
    } catch (error) {
      next(error);
    }
  }
}
