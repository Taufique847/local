import twilio from 'twilio';
import { config } from '../config/env';
import { AvailablePhoneNumberDTO } from '../types/telephony.types';
import { AppError } from '../types';
import { logger } from '../utils/logger';
import { VOICEMAIL_RECORDING_NOTICE } from '../utils/disclosure';
import { createVoiceStreamToken } from '../utils/voice-stream-token';

export class TwilioService {
  private static getClient() {
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      return null;
    }
    return twilio(config.twilioAccountSid, config.twilioAuthToken);
  }

  /**
   * Check whether Twilio credentials are configured on this server.
   */
  public static isConfigured(): boolean {
    return Boolean(config.twilioAccountSid && config.twilioAuthToken);
  }

  /**
   * Safe connection verification without exposing secrets.
   */
  public static async verifyConnection(): Promise<{
    configured: boolean;
    connected: boolean;
    accountName?: string;
    status?: string;
    message: string;
  }> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
        message: 'Twilio credentials (Account SID / Auth Token) are not configured.',
      };
    }

    try {
      const client = this.getClient();
      if (!client) throw new Error('Could not instantiate Twilio client');

      const account = await client.api.v2010.accounts(config.twilioAccountSid!).fetch();

      return {
        configured: true,
        connected: true,
        accountName: account.friendlyName,
        status: account.status,
        message: 'Twilio connection verified successfully.',
      };
    } catch (err: any) {
      return {
        configured: true,
        connected: false,
        message: err.message || 'Twilio connection verification failed.',
      };
    }
  }

  /**
   * Search available phone numbers for provisioning.
   */
  public static async searchAvailableNumbers(
    country: string = 'US',
    areaCode?: number
  ): Promise<AvailablePhoneNumberDTO[]> {
    const client = this.getClient();

    // No fabricated inventory.
    //
    // This method used to fall back to three invented "Chicago, IL" numbers
    // (+1XXX5550101/2/3) whenever Twilio was unconfigured or the API call
    // failed. Contractors could pick one, "provision" it, complete onboarding,
    // and believe their AI line was live — while no number existed anywhere.
    if (!client) {
      throw new AppError(
        'Phone number search is unavailable because Twilio is not configured on this server.',
        503
      );
    }

    try {
      const options: any = { limit: 10 };
      if (areaCode) options.areaCode = areaCode;

      const numbers = await client.availablePhoneNumbers(country).local.list(options);

      return numbers.map((n) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality,
        region: n.region,
        postalCode: n.postalCode,
        capabilities: {
          voice: Boolean(n.capabilities?.voice),
          sms: Boolean(n.capabilities?.sms),
        },
      }));
    } catch (err: any) {
      logger.error('twilio_number_search_failed', { country, areaCode, reason: err?.message });
      throw new AppError(
        err?.message || 'Twilio number search failed. Please try a different area code.',
        502
      );
    }
  }

  /**
   * Provision a phone number through Twilio.
   */
  public static async provisionNumber(
    phoneNumber: string,
    voiceWebhookUrl?: string,
    statusCallbackUrl?: string
  ): Promise<{ phoneNumber: string; phoneNumberSid: string; friendlyName: string }> {
    const client = this.getClient();

    // Previously returned a `PN_simulated_<timestamp>` SID when Twilio was
    // unconfigured, which was then stored as if the line had been purchased.
    if (!client) {
      throw new AppError(
        'Cannot purchase a phone number because Twilio is not configured on this server.',
        503
      );
    }

    try {
      const bought = await client.incomingPhoneNumbers.create({
        phoneNumber,
        voiceUrl: voiceWebhookUrl,
        voiceMethod: 'POST',
        statusCallback: statusCallbackUrl,
        statusCallbackMethod: 'POST',
      });

      return {
        phoneNumber: bought.phoneNumber,
        phoneNumberSid: bought.sid,
        friendlyName: bought.friendlyName,
      };
    } catch (err: any) {
      logger.error('twilio_number_purchase_failed', { phoneNumber, reason: err?.message });
      throw new AppError(err?.message || 'Failed to purchase number via Twilio', 502);
    }
  }

  /**
   * Places an outbound call that Twilio will drive from the given TwiML URL.
   *
   * Used by the owner-facing test call: the AI line dials the contractor so the
   * real inbound pipeline (media stream, STT, LLM, TTS) runs end to end.
   */
  public static async placeOutboundCall(params: {
    to: string;
    from: string;
    twimlUrl: string;
    statusCallbackUrl?: string;
    timeoutSeconds?: number;
  }): Promise<{ callSid: string; status: string }> {
    const client = this.getClient();
    if (!client) {
      throw new AppError(
        'Cannot place a call because Twilio is not configured on this server.',
        503
      );
    }

    try {
      const call = await client.calls.create({
        to: params.to,
        from: params.from,
        url: params.twimlUrl,
        method: 'POST',
        timeout: params.timeoutSeconds ?? 30,
        ...(params.statusCallbackUrl
          ? {
              statusCallback: params.statusCallbackUrl,
              statusCallbackMethod: 'POST',
              statusCallbackEvent: ['completed', 'no-answer', 'busy', 'failed'],
            }
          : {}),
      });

      logger.info('outbound_call_placed', { callSid: call.sid, to: params.to, from: params.from });
      return { callSid: call.sid, status: call.status };
    } catch (err: any) {
      logger.error('outbound_call_failed', {
        to: params.to,
        from: params.from,
        reason: err?.message,
        code: err?.code,
      });
      throw new AppError(err?.message || 'Twilio could not place the call', 502);
    }
  }

  /**
   * Validate Twilio request signature.
   */
  /**
   * Validates a Twilio request signature.
   *
   * Security: a previous version returned `true` whenever
   * `config.nodeEnv === 'development'` — and 'development' is the DEFAULT value
   * of NODE_ENV — so signature verification was effectively disabled unless
   * NODE_ENV was explicitly set to 'production'. Anyone who found the webhook
   * URL could forge inbound calls and SMS.
   *
   * The bypass now requires the operator to deliberately set
   * ALLOW_INSECURE_WEBHOOKS=true, and that flag is forced off in production.
   */
  public static validateWebhookSignature(
    signature: string | undefined,
    url: string,
    params: Record<string, any>
  ): boolean {
    if (config.allowInsecureWebhooks) {
      logger.warn('twilio_signature_check_skipped', {
        reason: 'ALLOW_INSECURE_WEBHOOKS is enabled',
      });
      return true;
    }

    if (!config.twilioAuthToken) {
      logger.error('twilio_signature_check_failed', {
        reason: 'TWILIO_AUTH_TOKEN is not configured, cannot verify webhook authenticity',
      });
      return false;
    }

    if (!signature) return false;

    try {
      return twilio.validateRequest(config.twilioAuthToken, signature, url, params);
    } catch (err: any) {
      logger.warn('twilio_signature_check_error', { reason: err?.message });
      return false;
    }
  }

  /**
   * Validates a signature against an Express request.
   *
   * Twilio signs the exact absolute URL it requested. Behind a proxy or tunnel
   * the configured base URL and the observed host can differ, and getting it
   * wrong rejects legitimate traffic, so each plausible reconstruction is
   * tried before failing.
   */
  public static validateWebhookRequest(req: {
    headers: Record<string, any>;
    originalUrl: string;
    protocol?: string;
    body: Record<string, any>;
  }): boolean {
    if (config.allowInsecureWebhooks) {
      logger.warn('twilio_signature_check_skipped', {
        reason: 'ALLOW_INSECURE_WEBHOOKS is enabled',
      });
      return true;
    }

    const signature = req.headers['x-twilio-signature'] as string | undefined;
    if (!signature || !config.twilioAuthToken) {
      logger.warn('twilio_signature_missing', {
        hasSignature: !!signature,
        hasAuthToken: !!config.twilioAuthToken,
      });
      return false;
    }

    const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0];
    const host = (req.headers['x-forwarded-host'] as string | undefined) || (req.headers.host as string | undefined);

    const candidates = [
      `${config.twilioWebhookBaseUrl}${req.originalUrl}`,
      host ? `${forwardedProto || req.protocol || 'https'}://${host}${req.originalUrl}` : undefined,
    ].filter((u): u is string => typeof u === 'string' && u.length > 0);

    for (const url of candidates) {
      if (this.validateWebhookSignature(signature, url, req.body)) return true;
    }

    logger.warn('twilio_signature_rejected', { candidates, path: req.originalUrl });
    return false;
  }

  /**
   * Redirects a live call to a human by updating it with new TwiML.
   *
   * The transfer_call tool previously just returned `{ transferInitiated: true }`
   * and performed no telephony action at all, so the AI told callers it was
   * connecting them to emergency dispatch and then simply kept talking.
   */
  public static async transferCall(
    callSid: string,
    targetPhone: string,
    options: { callerId?: string; whisper?: string } = {}
  ): Promise<{ transferred: boolean; reason?: string }> {
    const client = this.getClient();
    if (!client) {
      return { transferred: false, reason: 'Twilio is not configured on this server' };
    }

    const response = new twilio.twiml.VoiceResponse();
    response.say(
      { voice: 'Polly.Joanna' as any },
      options.whisper || 'Please hold while I connect you with our team.'
    );
    const dial = response.dial({
      // Present the business line so the technician recognises the call.
      ...(options.callerId ? { callerId: options.callerId } : {}),
      timeout: 25,
      answerOnBridge: true,
    });
    dial.number(targetPhone);
    // Reached only if the human does not answer.
    response.say(
      { voice: 'Polly.Joanna' as any },
      'I was unable to reach the team right now. We will call you back as soon as possible.'
    );
    response.hangup();

    try {
      await client.calls(callSid).update({ twiml: response.toString() });
      logger.info('call_transferred', { callSid, targetPhone });
      return { transferred: true };
    } catch (err: any) {
      logger.error('call_transfer_failed', { callSid, targetPhone, reason: err?.message });
      return { transferred: false, reason: err?.message || 'Twilio call update failed' };
    }
  }

  /**
   * TwiML played when a business has no remaining entitlement (expired trial,
   * cancelled plan, or exhausted minutes). The caller gets a courteous message
   * rather than silence, and no billable AI stream is opened.
   */
  public static generateUnavailableTwiML(businessName: string = 'our business'): string {
    const response = new twilio.twiml.VoiceResponse();
    response.say(
      { voice: 'Polly.Joanna' as any },
      `Thank you for calling ${businessName}. Our automated assistant is temporarily unavailable. Please leave a message after the tone and we will call you back as soon as possible.`
    );
    // Announced before the beep: this branch records the caller's audio, and
    // several states require notice before that starts.
    response.say({ voice: 'Polly.Joanna' as any }, VOICEMAIL_RECORDING_NOTICE);
    response.record({ maxLength: 120, playBeep: true });
    response.say({ voice: 'Polly.Joanna' as any }, 'Thank you. Goodbye.');
    response.hangup();
    return response.toString();
  }

  /**
   * Speaks a single message and hangs up. Used when a call cannot be routed into
   * the AI pipeline, so the person hears an explanation instead of dead air.
   */
  public static generateSpokenHangupTwiML(message: string): string {
    const response = new twilio.twiml.VoiceResponse();
    response.say({ voice: 'Polly.Joanna' as any }, message);
    response.hangup();
    return response.toString();
  }

  /**
   * Generate initial greeting TwiML for inbound call.
   */
  public static generateWelcomeTwiML(businessName: string = 'our business'): string {
    const response = new twilio.twiml.VoiceResponse();
    response.say(
      { voice: 'Polly.Joanna' as any },
      `Thank you for calling ${businessName}. Please hold while we connect you to our automated assistant.`
    );
    response.pause({ length: 1 });
    response.say(
      { voice: 'Polly.Joanna' as any },
      'Our team is ready to assist you. Have a wonderful day.'
    );
    response.hangup();
    return response.toString();
  }

  /**
   * Generate Media Stream TwiML connecting inbound call to AI Voice Engine (M10).
   *
   * `disclosure` is spoken before the stream opens. `<Connect>` is terminal —
   * nothing after it runs — so the notice has to come first, and it must be
   * spoken by Twilio rather than the assistant so it cannot be interrupted or
   * skipped by the language model.
   */
  public static generateMediaStreamTwiML(
    streamUrl: string,
    params: { from: string; to: string; callSid: string },
    options: { disclosure?: string | null } = {}
  ): string {
    const response = new twilio.twiml.VoiceResponse();

    if (options.disclosure) {
      response.say({ voice: 'Polly.Joanna' as any }, options.disclosure);
    }

    // The WebSocket endpoint cannot be protected by a Twilio signature, so it is
    // gated by a single-use token minted here — a point the signature has
    // already authenticated.
    //
    // `from`, `to` and the disclosure flag are carried INSIDE the signed token
    // rather than as <Stream> parameters. They previously arrived as plain
    // customParameters that the stream handler trusted to resolve the tenant,
    // which let an unauthenticated peer attribute a fabricated call to any
    // business by naming its number.
    const token = createVoiceStreamToken({
      callSid: params.callSid,
      from: params.from,
      to: params.to,
      disclosed: Boolean(options.disclosure),
    });

    const separator = streamUrl.includes('?') ? '&' : '?';
    const connect = response.connect();
    connect.stream({
      url: `${streamUrl}${separator}token=${encodeURIComponent(token)}`,
    });
    return response.toString();
  }
}
