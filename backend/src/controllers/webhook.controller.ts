import { Request, Response } from 'express';
import { CallService } from '../services/call.service';
import { TwilioService } from '../services/twilio.service';
import { BillingService } from '../services/billing.service';
import { PolicyGuardrailsService } from '../services/policy-guardrails.service';
import { Business } from '../models/business.model';
import { buildAiDisclosure } from '../utils/disclosure';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'twilio-webhook' });

export class WebhookController {
  /**
   * Inbound voice webhook called by Twilio. Responds with TwiML XML.
   *
   * Public endpoint authenticated solely by the Twilio request signature.
   */
  public static async handleInboundVoice(req: Request, res: Response): Promise<void> {
    try {
      if (!TwilioService.validateWebhookRequest(req as any)) {
        log.warn('voice_webhook_signature_rejected');
        res.status(403).send('Invalid signature');
        return;
      }

      const { CallSid, From, To } = req.body;
      if (!CallSid || !From || !To) {
        res.status(400).send('Missing CallSid, From, or To parameters');
        return;
      }

      // Record call log and resolve business
      const { business, callLog } = await CallService.handleInboundWebhook(req.body);

      const baseUrl = config.twilioWebhookBaseUrl || 'http://localhost:5000';
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/voice/media-stream';

      // Plan enforcement: if the business has no entitlement left, do not open a
      // billable AI stream. Play a graceful message instead of burning provider
      // spend or dropping the caller into silence.
      if (business?._id) {
        const entitlement = await BillingService.checkEntitlement(business._id);
        if (!entitlement.allowed) {
          log.warn('voice_call_blocked_no_entitlement', {
            businessId: business._id.toString(),
            reason: entitlement.reason,
          });
          res.set('Content-Type', 'text/xml');
          res.status(200).send(
            TwilioService.generateUnavailableTwiML(business.name || 'our business')
          );
          return;
        }
      }

      const disclosure = await WebhookController.resolveDisclosure(business, From);
      if (callLog && disclosure) {
        callLog.disclosurePlayed = true;
        callLog.disclosurePlayedAt = new Date();
        callLog.disclosureText = disclosure;
        await callLog.save().catch((e: any) => log.warn('could_not_save_disclosure_audit', { err: e?.message }));
      }

      const useStream =
        config.voiceProvider !== 'off' &&
        (req.query.stream === 'true' || req.body.Stream === 'true' || config.voiceProvider === 'realtime');

      const twiml = useStream
        ? TwilioService.generateMediaStreamTwiML(
            wsUrl,
            { from: From, to: To, callSid: CallSid },
            { disclosure }
          )
        : TwilioService.generateWelcomeTwiML(business?.name || 'our business');

      res.set('Content-Type', 'text/xml');
      res.status(200).send(twiml);
    } catch (err: any) {
      log.error('voice_webhook_failed', { err });
      // Safe fallback TwiML so the caller does not hear a carrier dead tone
      const fallbackTwiml =
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are currently experiencing technical difficulties. Please call back later.</Say><Hangup/></Response>';
      res.set('Content-Type', 'text/xml');
      res.status(200).send(fallbackTwiml);
    }
  }

  /**
   * TwiML for an owner-initiated test call, fetched by Twilio when the owner
   * answers. Public endpoint authenticated solely by the Twilio signature.
   *
   * For an outbound call Twilio reports From = the AI line and To = the person
   * being dialled, which is the mirror image of an inbound call. The stream
   * parameters are therefore swapped before being handed to the voice engine:
   * the owner becomes the caller and the AI line becomes the dialled business
   * number, so tenant resolution and the assistant's framing match a genuine
   * inbound customer call.
   */
  public static async handleTestCallVoice(req: Request, res: Response): Promise<void> {
    try {
      if (!TwilioService.validateWebhookRequest(req as any)) {
        log.warn('test_call_webhook_signature_rejected');
        res.status(403).send('Invalid signature');
        return;
      }

      const { CallSid, From, To } = req.body;
      if (!CallSid || !From || !To) {
        res.status(400).send('Missing CallSid, From, or To parameters');
        return;
      }

      // `From` is the AI line. Only a number actually provisioned to a business
      // may drive a stream, so an unknown caller id is refused rather than
      // guessed at.
      const callLog = await CallService.findTestCallBySid(CallSid);
      if (!callLog) {
        log.warn('test_call_webhook_unknown_sid', { callSid: CallSid });
        res.set('Content-Type', 'text/xml');
        res.status(200).send(
          TwilioService.generateSpokenHangupTwiML(
            'This test call could not be verified. Please start a new test from your dashboard.'
          )
        );
        return;
      }

      const baseUrl = config.twilioWebhookBaseUrl || '';
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/voice/media-stream';

      await CallService.markTestCallAnswered(CallSid);

      // The disclosure is included so the owner hears precisely what a customer
      // hears, including the notice.
      const business = await Business.findById(callLog.businessId).lean();

      res.set('Content-Type', 'text/xml');
      res.status(200).send(
        TwilioService.generateMediaStreamTwiML(
          wsUrl,
          { from: To, to: From, callSid: CallSid },
          { disclosure: await WebhookController.resolveDisclosure(business) }
        )
      );
    } catch (err: any) {
      log.error('test_call_webhook_failed', { err });
      res.set('Content-Type', 'text/xml');
      res.status(200).send(
        TwilioService.generateSpokenHangupTwiML(
          'The test call could not be started because of a server error. Please check your dashboard.'
        )
      );
    }
  }

  /**
   * Builds the spoken compliance notice for a business.
   *
   * A policy lookup failure must never block the call, and it must never
   * silently drop the notice either — so the generated default is used.
   */
  private static async resolveDisclosure(business: any, callerPhone?: string): Promise<string | null> {
    const businessName = business?.name || undefined;

    try {
      if (!business?._id) return buildAiDisclosure({ businessName, callerPhone, businessState: business?.address?.state });

      const policy = await PolicyGuardrailsService.getPolicy(business._id);
      return buildAiDisclosure({
        businessName,
        enabled: policy?.aiDisclosureEnabled,
        customText: policy?.aiDisclosureText,
        canTransfer: Boolean(policy?.emergencyTransferPhone || business?.phone),
        callerPhone,
        businessState: business?.address?.state,
      });
    } catch (err: any) {
      log.warn('disclosure_policy_lookup_failed', { reason: err?.message });
      return buildAiDisclosure({
        businessName,
        canTransfer: Boolean(business?.phone),
        callerPhone,
        businessState: business?.address?.state,
      });
    }
  }

  /**
   * Status callback webhook called by Twilio when call state changes.
   */
  public static async handleStatusCallback(req: Request, res: Response): Promise<void> {
    try {
      if (!TwilioService.validateWebhookRequest(req as any)) {
        log.warn('status_webhook_signature_rejected');
        res.status(403).send('Invalid signature');
        return;
      }

      await CallService.handleStatusWebhook(req.body);
      res.status(200).send('OK');
    } catch (err) {
      log.error('status_webhook_failed', { err });
      // Always 200 to Twilio to avoid unnecessary retries
      res.status(200).send('OK');
    }
  }
}
