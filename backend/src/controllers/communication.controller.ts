import { Request, Response, NextFunction } from 'express';
import { CommunicationService } from '../services/communication.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

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

  // POST /api/webhooks/twilio/sms (Public webhook)
  public static async handleInboundWebhook(req: Request, res: Response): Promise<void> {
    try {
      const result = await CommunicationService.handleInboundSms(req.body);
      if (result.reply) {
        res.set('Content-Type', 'text/xml');
        res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${result.reply}</Message></Response>`);
        return;
      }
      res.set('Content-Type', 'text/xml');
      res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (error) {
      console.error('Error in Twilio SMS webhook:', error);
      res.status(200).send('OK');
    }
  }

  // POST /api/webhooks/twilio/sms-status (Public webhook)
  public static async handleStatusCallback(req: Request, res: Response): Promise<void> {
    try {
      await CommunicationService.handleDeliveryStatus(req.body);
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error in Twilio SMS status callback:', error);
      res.status(200).send('OK');
    }
  }
}
