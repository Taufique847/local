import { Request, Response } from 'express';
import { CallService } from '../services/call.service';
import { TwilioService } from '../services/twilio.service';
import { config } from '../config/env';

export class WebhookController {
  /**
   * Inbound voice webhook called by Twilio.
   * Responds with TwiML XML.
   */
  public static async handleInboundVoice(req: Request, res: Response): Promise<void> {
    try {
      // Validate Twilio signature
      const signature = req.headers['x-twilio-signature'] as string | undefined;
      const fullUrl = `${config.twilioWebhookBaseUrl || 'http://localhost:5000'}${req.originalUrl}`;

      const isValid = TwilioService.validateWebhookSignature(signature, fullUrl, req.body);
      if (!isValid) {
        console.warn('Twilio webhook signature verification failed for voice call');
        res.status(403).send('Invalid signature');
        return;
      }

      const { CallSid, From, To } = req.body;
      if (!CallSid || !From || !To) {
        res.status(400).send('Missing CallSid, From, or To parameters');
        return;
      }

      // Record call log and resolve business
      const { business } = await CallService.handleInboundWebhook(req.body);

      // Generate TwiML response (Media Stream for M10 voice or standard greeting)
      const baseUrl = config.twilioWebhookBaseUrl || 'http://localhost:5000';
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/voice/media-stream';

      let twiml: string;
      if (req.query.stream === 'true' || req.body.Stream === 'true') {
        twiml = TwilioService.generateMediaStreamTwiML(wsUrl, { from: From, to: To });
      } else {
        twiml = TwilioService.generateWelcomeTwiML(business?.name || 'our business');
      }

      res.set('Content-Type', 'text/xml');
      res.status(200).send(twiml);
    } catch (err: any) {
      console.error('Error handling Twilio voice webhook:', err);
      // Safe fallback TwiML so caller does not hear a carrier dead tone
      const fallbackTwiml =
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are currently experiencing technical difficulties. Please call back later.</Say><Hangup/></Response>';
      res.set('Content-Type', 'text/xml');
      res.status(200).send(fallbackTwiml);
    }
  }

  /**
   * Status callback webhook called by Twilio when call state changes.
   */
  public static async handleStatusCallback(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-twilio-signature'] as string | undefined;
      const fullUrl = `${config.twilioWebhookBaseUrl || 'http://localhost:5000'}${req.originalUrl}`;

      const isValid = TwilioService.validateWebhookSignature(signature, fullUrl, req.body);
      if (!isValid) {
        console.warn('Twilio webhook signature verification failed for status callback');
        res.status(403).send('Invalid signature');
        return;
      }

      await CallService.handleStatusWebhook(req.body);
      res.status(200).send('OK');
    } catch (err) {
      console.error('Error handling Twilio status callback:', err);
      res.status(200).send('OK'); // Always 200 to Twilio to avoid unnecessary retries
    }
  }
}
