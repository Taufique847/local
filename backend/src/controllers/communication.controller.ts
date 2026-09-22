import { Request, Response, NextFunction } from 'express';
import { CommunicationService } from '../services/communication.service';
import { BusinessService } from '../services/business.service';
import { TwilioService } from '../services/twilio.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';
import { logger } from '../utils/logger';
import { escapeXml } from '../utils/escape-xml';

export class CommunicationController {
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
  }

  // POST /api/messages/send
  public static async sendMessage(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CommunicationController.getBusinessId(req.user.id);
      const { to, body, type, customerId, leadId, appointmentId, bypassQuietHours } = req.body;

      if (!to || !body) {
        throw new AppError('Phone number (to) and message body are required', 400);
      }

      const message = await CommunicationService.sendMessage(businessId, {
        to,
        body,
        type,
        customerId,
        leadId,
        appointmentId,
        bypassQuietHours,
      });

      sendSuccess(res, { success: true, message }, 201);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/messages
  public static async getMessages(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CommunicationController.getBusinessId(req.user.id);
      const result = await CommunicationService.getMessages(businessId, req.query);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/webhooks/twilio/sms (public webhook)
   *
   * Inbound SMS can create leads and book appointments, so an unverified
   * endpoint here let anyone forge customer replies. The Twilio signature is
   * now required.
   */
  public static async handleInboundWebhook(req: Request, res: Response): Promise<void> {
    try {
      if (!TwilioService.validateWebhookRequest(req as any)) {
        logger.warn('sms_webhook_signature_rejected');
        res.status(403).send('Invalid signature');
        return;
      }

      const result = await CommunicationService.handleInboundSms(req.body);

      res.set('Content-Type', 'text/xml');
      if (result.reply) {
        // Escaped: the reply can echo customer-supplied text, which would
        // otherwise break or inject into the TwiML document.
        res
          .status(200)
          .send(
            `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(result.reply)}</Message></Response>`
          );
        return;
      }
      res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error) {
      logger.error('sms_webhook_failed', { err: error });
      res.set('Content-Type', 'text/xml');
      res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  }

  // POST /api/webhooks/twilio/sms-status (public webhook)
  public static async handleStatusCallback(req: Request, res: Response): Promise<void> {
    try {
      if (!TwilioService.validateWebhookRequest(req as any)) {
        logger.warn('sms_status_webhook_signature_rejected');
        res.status(403).send('Invalid signature');
        return;
      }

      await CommunicationService.handleDeliveryStatus(req.body);
      res.status(200).send('OK');
    } catch (error) {
      logger.error('sms_status_webhook_failed', { err: error });
      res.status(200).send('OK');
    }
  }
}
