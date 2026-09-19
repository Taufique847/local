import twilio from 'twilio';
import { config } from '../config/env';
import { AvailablePhoneNumberDTO } from '../types/telephony.types';

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

    if (client) {
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
      } catch (err) {
        console.error('Error querying live Twilio available numbers:', err);
      }
    }

    // Dev/Sandbox fallback mock numbers if Twilio credentials are not set or trial account
    const sampleArea = areaCode ? String(areaCode) : '312';
    return [
      {
        phoneNumber: `+1${sampleArea}5550101`,
        friendlyName: `(${sampleArea}) 555-0101`,
        locality: 'Chicago',
        region: 'IL',
        postalCode: '60601',
        capabilities: { voice: true, sms: true },
      },
      {
        phoneNumber: `+1${sampleArea}5550102`,
        friendlyName: `(${sampleArea}) 555-0102`,
        locality: 'Chicago',
        region: 'IL',
        postalCode: '60602',
        capabilities: { voice: true, sms: true },
      },
      {
        phoneNumber: `+1${sampleArea}5550103`,
        friendlyName: `(${sampleArea}) 555-0103`,
        locality: 'Chicago',
        region: 'IL',
        postalCode: '60603',
        capabilities: { voice: true, sms: true },
      },
    ];
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

    if (client) {
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
        console.error('Twilio incomingPhoneNumbers.create error:', err);
        throw new Error(err.message || 'Failed to purchase number via Twilio');
      }
    }

    // Dev mode / sandbox fallback
    return {
      phoneNumber,
      phoneNumberSid: `PN_simulated_${Date.now()}`,
      friendlyName: phoneNumber,
    };
  }

  /**
   * Validate Twilio request signature.
   */
  public static validateWebhookSignature(
    signature: string | undefined,
    url: string,
    params: Record<string, any>
  ): boolean {
    // In development or when no auth token is provided, allow webhook simulation
    if (!config.twilioAuthToken || config.nodeEnv === 'development') {
      return true;
    }

    if (!signature) {
      return false;
    }

    try {
      return twilio.validateRequest(config.twilioAuthToken, signature, url, params);
    } catch {
      return false;
    }
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
   */
  public static generateMediaStreamTwiML(streamUrl: string, params: { from: string; to: string }): string {
    const response = new twilio.twiml.VoiceResponse();
    const connect = response.connect();
    const stream = connect.stream({
      url: streamUrl,
    });
    stream.parameter({ name: 'from', value: params.from });
    stream.parameter({ name: 'to', value: params.to });
    return response.toString();
  }
}
