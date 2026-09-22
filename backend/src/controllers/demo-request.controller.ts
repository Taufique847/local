import { Request, Response, NextFunction } from 'express';
import { DemoRequestService } from '../services/demo-request.service';
import { sendSuccess } from '../utils/response';

export class DemoRequestController {
  /**
   * POST /api/demo-requests  (public)
   *
   * Rate limited and honeypot-protected at the route/schema layer. Responds with
   * a deliberately minimal payload so the endpoint cannot be used to read back
   * stored lead data.
   */
  public static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { deduped } = await DemoRequestService.create(req.body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        referrer: req.headers.referer as string | undefined,
      });

      sendSuccess(
        res,
        {
          success: true,
          message: 'Thanks — your demo request is in. Our team will reach out shortly.',
          deduped,
        },
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/demo-requests (authenticated internal sales inbox) */
  public static async list(req: any, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await DemoRequestService.list({
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      });
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }
}
