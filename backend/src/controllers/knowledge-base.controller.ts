import { Response, NextFunction } from 'express';
import { KnowledgeBaseService } from '../services/knowledge-base.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class KnowledgeBaseController {
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

  // GET /api/knowledge
  public static async getItems(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await KnowledgeBaseController.getBusinessId(req.user.id);
      const result = await KnowledgeBaseService.getItems(businessId, req.query);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/knowledge/search
  public static async search(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await KnowledgeBaseController.getBusinessId(req.user.id);
      const { query, category } = req.query;

      if (!query || typeof query !== 'string') {
        throw new AppError('query string is required for knowledge search', 400);
      }

      const results = await KnowledgeBaseService.searchKnowledgeBase(
        businessId,
        query,
        category as any
      );
      sendSuccess(res, { success: true, results }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/knowledge/:id
  public static async getItemById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await KnowledgeBaseController.getBusinessId(req.user.id);
      const item = await KnowledgeBaseService.getItemById(businessId, req.params.id);
      sendSuccess(res, { success: true, item }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/knowledge
  public static async createItem(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await KnowledgeBaseController.getBusinessId(req.user.id);
      const { category, title, content, tags, priority, isPublished } = req.body;

      if (!title || !content) {
        throw new AppError('title and content are required', 400);
      }

      const item = await KnowledgeBaseService.createItem(
        businessId,
        { category: category || 'faq', title, content, tags, priority, isPublished },
        req.user.email || 'owner'
      );
      sendSuccess(res, { success: true, message: 'Knowledge item created successfully', item }, 201);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/knowledge/:id
  public static async updateItem(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await KnowledgeBaseController.getBusinessId(req.user.id);
      const item = await KnowledgeBaseService.updateItem(businessId, req.params.id, req.body);
      sendSuccess(res, { success: true, message: 'Knowledge item updated successfully', item }, 200);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/knowledge/:id
  public static async deleteItem(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await KnowledgeBaseController.getBusinessId(req.user.id);
      await KnowledgeBaseService.deleteItem(businessId, req.params.id);
      sendSuccess(res, { success: true, message: 'Knowledge item deleted successfully' }, 200);
    } catch (error) {
      next(error);
    }
  }
}
