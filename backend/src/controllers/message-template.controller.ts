import { Response, NextFunction } from 'express';
import { MessageTemplateService, PREVIEW_VARS } from '../services/message-template.service';
import { applyTemplate, allowedVariablesFor } from '../services/notification-templates';
import { BusinessScopedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';
import { MessageChannel, MessageType } from '../types/communication.types';

/**
 * Notification copy settings.
 *
 * Reads `req.businessId`, which `attachBusinessContext` has already resolved, so
 * the tenant is decided in exactly one place. Owner-gated at the route: this
 * changes what every customer of the business receives, which is not a dispatcher
 * decision.
 */
export class MessageTemplateController {
  private static businessId(req: BusinessScopedRequest): string {
    if (!req.businessId) throw new AppError('No workspace found for this account', 400);
    return req.businessId;
  }

  // GET /api/message-templates
  public static async list(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const rows = await MessageTemplateService.listForBusiness(
        MessageTemplateController.businessId(req)
      );
      sendSuccess(res, { success: true, templates: rows }, 200);
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/message-templates
  public static async upsert(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const template = await MessageTemplateService.upsert(
        MessageTemplateController.businessId(req),
        req.body
      );
      sendSuccess(res, { success: true, template, message: 'Message updated' }, 200);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/message-templates/:type/:channel
  public static async reset(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      await MessageTemplateService.reset(
        MessageTemplateController.businessId(req),
        req.params.type as MessageType,
        req.params.channel as MessageChannel
      );
      sendSuccess(res, { success: true, message: 'Reverted to the standard wording' }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/message-templates/preview
   *
   * Renders draft copy with sample data without saving it. Server-side rather than
   * in the browser so the preview uses the same substitution the send path uses —
   * a client-side approximation is exactly how a preview comes to disagree with
   * what the customer receives.
   */
  public static async preview(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { type, body, subject } = req.body as {
        type: MessageType;
        body?: string;
        subject?: string;
      };

      sendSuccess(
        res,
        {
          success: true,
          preview: applyTemplate(body ?? '', PREVIEW_VARS),
          previewSubject: subject ? applyTemplate(subject, PREVIEW_VARS) : '',
          variables: allowedVariablesFor(type),
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }
}
