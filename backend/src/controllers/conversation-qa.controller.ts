import { Response, NextFunction } from 'express';
import { ConversationIntelligenceService } from '../services/conversation-intelligence.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class ConversationQAController {
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

  // GET /api/calls/qa/summary
  public static async getSummary(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ConversationQAController.getBusinessId(req.user.id);
      const summary = await ConversationIntelligenceService.getQASummary(businessId);
      sendSuccess(res, { success: true, summary }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/calls/qa
  public static async listReviews(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ConversationQAController.getBusinessId(req.user.id);
      const flaggedOnly = req.query.flaggedOnly === 'true';
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const results = await ConversationIntelligenceService.listQAReviews(businessId, {
        flaggedOnly,
        page,
        limit,
      });

      sendSuccess(res, { success: true, ...results }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/calls/:id/qa
  public static async getCallQA(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await ConversationQAController.getBusinessId(req.user.id);
      const { id } = req.params;

      const qa = await ConversationIntelligenceService.getQAByCallLogId(businessId, id);
      if (!qa) {
        throw new AppError('QA analysis not found for this call', 404);
      }

      sendSuccess(res, { success: true, qa }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/calls/:id/qa/evaluate
  public static async evaluateCall(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const { id } = req.params;

      const qa = await ConversationIntelligenceService.evaluateCall(id);
      if (!qa) {
        throw new AppError('Could not evaluate call: Call record not found', 404);
      }

      sendSuccess(res, { success: true, qa, message: 'Call QA evaluated successfully' }, 200);
    } catch (error) {
      next(error);
    }
  }
}
