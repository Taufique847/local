import { Types } from 'mongoose';
import { CommunicationLog } from '../models/communication-log.model';
import { Business } from '../models/business.model';
import { Customer } from '../models/customer.model';
import { BusinessPhoneNumber } from '../models/phone-number.model';
import {
  ICommunicationLog,
  SendMessageInput,
  MessageType,
} from '../types/communication.types';
import { config } from '../config/env';
import twilio from 'twilio';

export class CommunicationService {
  private static twilioClient: any = null;

  private static getClient() {
    if (!this.twilioClient && config.twilioAccountSid && config.twilioAuthToken) {
      this.twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);
    }
    return this.twilioClient;
  }

  /**
   * Evaluates TCPA Quiet Hours (8:00 AM - 9:00 PM local business time)
   */
  public static isWithinQuietHours(timezone: string = 'America/New_York'): boolean {
    try {
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
      });
      const hour = parseInt(timeString, 10);
      // Return true if outside 8 AM - 9 PM
      return hour < 8 || hour >= 21;
    } catch {
      return false; // Default to safe send if timezone fails
    }
  }

  /**
   * Renders pre-approved templates with dynamic context variables
   */
  public static renderTemplate(
    type: MessageType,
    vars: {
      customerName?: string;
      businessName?: string;
      businessPhone?: string;
      dateTime?: string;
      address?: string;
      serviceName?: string;
    }
  ): string {
    const cust = vars.customerName || 'valued customer';
    const biz = vars.businessName || 'our HVAC team';
    const phone = vars.businessPhone || '';
    const dt = vars.dateTime || 'your scheduled time';
    const addr = vars.address ? ` at ${vars.address}` : '';
    const srv = vars.serviceName ? ` for ${vars.serviceName}` : '';

    switch (type) {
      case 'appointment_confirmation':
        return `Hi ${cust}, your appointment with ${biz}${srv} is confirmed for ${dt}${addr}. Reply STOP to cancel notifications.`;
      case 'appointment_reminder':
        return `Reminder: Your HVAC appointment with ${biz} is scheduled for tomorrow at ${dt}${addr}. Please let us know if you need to reschedule!`;
      case 'appointment_rescheduled':
        return `Hi ${cust}, your appointment with ${biz} has been rescheduled to ${dt}${addr}. Thank you!`;
      case 'appointment_cancelled':
        return `Hi ${cust}, your appointment with ${biz} has been cancelled. Call us at ${phone} to rebook whenever you're ready.`;
      case 'missed_call_followup':
        return `Hi! Sorry we missed your call at ${biz}. How can we help you with your heating or AC today?`;
      case 'lead_followup':
        return `Hi ${cust}, thank you for contacting ${biz}. Our team is reviewing your service request and will follow up shortly!`;
      case 'custom':
      default:
        return '';
    }
  }

  /**
   * Sends an SMS with tenant isolation, quiet hours check, and opt-out verification
   */
  public static async sendMessage(
    businessId: Types.ObjectId | string,
    input: SendMessageInput
  ): Promise<ICommunicationLog> {
    const business = await Business.findById(businessId);
    if (!business) throw new Error('Business not found');

    // Check opt-out status if customer is specified
    if (input.customerId) {
      const customer = await Customer.findOne({ _id: input.customerId, businessId });
      if (customer && (customer as any).isOptedOut) {
        throw new Error('Customer has opted out of receiving SMS messages');
      }
    }

    // Check quiet hours unless explicitly bypassed (e.g. emergency or customer-initiated)
    if (!input.bypassQuietHours && this.isWithinQuietHours(business.timezone)) {
      throw new Error(
        `Outbound SMS blocked: Current time is outside allowed TCPA hours (8:00 AM - 9:00 PM ${business.timezone || 'local time'}).`
      );
    }

    // Determine outbound From number: assigned business number or env default
    let fromNumber = config.twilioPhoneNumber || '+15550001234';
    const primaryPhone = await BusinessPhoneNumber.findOne({ businessId, isPrimary: true, status: 'assigned' });
    if (primaryPhone) {
      fromNumber = primaryPhone.phoneNumber;
    }

    const type = input.type || 'custom';
    const body = input.body.trim();

    // Create log in queued state
    const log = await CommunicationLog.create({
      businessId,
      customerId: input.customerId || null,
      leadId: input.leadId || null,
      appointmentId: input.appointmentId || null,
      direction: 'outbound',
      channel: 'sms',
      type,
      from: fromNumber,
      to: input.to,
      body,
      status: 'queued',
    });

    const client = this.getClient();
    if (client && config.twilioAccountSid && config.twilioAuthToken && !fromNumber.includes('555000')) {
      try {
        const twilioMsg = await client.messages.create({
          from: fromNumber,
          to: input.to,
          body,
          statusCallback: `${config.twilioWebhookBaseUrl}/api/webhooks/twilio/sms-status`,
        });
        log.twilioSid = twilioMsg.sid;
        log.status = 'sent';
        await log.save();
      } catch (err: any) {
        log.status = 'failed';
        log.errorMessage = err.message || 'Twilio send error';
        log.errorCode = err.code ? String(err.code) : undefined;
        await log.save();
        throw err;
      }
    } else {
      // Mock / Simulation mode for development or testing without live Twilio credits
      log.twilioSid = `SM_mock_${Date.now()}`;
      log.status = 'delivered';
      await log.save();
    }

    return log;
  }

  /**
   * Handles inbound SMS messages and processes STOP / START opt-outs
   */
  public static async handleInboundSms(body: {
    MessageSid: string;
    From: string;
    To: string;
    Body: string;
  }): Promise<{ reply?: string }> {
    const { MessageSid, From, To, Body: rawBody } = body;
    const text = (rawBody || '').trim();
    const upper = text.toUpperCase();

    // Find business by the 'To' number
    const phoneRecord = await BusinessPhoneNumber.findOne({ phoneNumber: To });
    const businessId = phoneRecord?.businessId;

    if (!businessId) {
      return {};
    }

    const customer = await Customer.findOne({ businessId, phone: From });

    // Handle TCPA opt-out keywords
    const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
    const optInKeywords = ['START', 'UNSTOP', 'YES'];

    if (optOutKeywords.includes(upper)) {
      if (customer) {
        (customer as any).isOptedOut = true;
        customer.notes = `${customer.notes || ''} [SMS Opt-Out requested via text]`.trim();
        await customer.save();
      }
    } else if (optInKeywords.includes(upper)) {
      if (customer) {
        (customer as any).isOptedOut = false;
        customer.notes = `${customer.notes || ''} [SMS Opt-In confirmed via text]`.trim();
        await customer.save();
      }
    }

    await CommunicationLog.create({
      businessId,
      customerId: customer?._id || null,
      direction: 'inbound',
      channel: 'sms',
      type: 'custom',
      from: From,
      to: To,
      body: text,
      status: 'received',
      twilioSid: MessageSid,
    });

    if (optOutKeywords.includes(upper)) {
      return {
        reply: 'You have been unsubscribed from notifications and will receive no further messages. Reply START to resubscribe.',
      };
    }

    // Area 4: Review / CSAT rating reply (1-5 stars)
    try {
      const { ReviewReputationService } = await import('./review-reputation.service');
      const ratingRes = await ReviewReputationService.handleCustomerRatingReply(From, text);
      if (ratingRes.handled && ratingRes.responseText) {
        return { reply: ratingRes.responseText };
      }
    } catch (err: any) {
      console.warn('Error checking review CSAT in inbound SMS:', err.message);
    }

    // Area 1: Speed-to-lead recovery reply
    try {
      const { LeadRecoveryService } = await import('./lead-recovery.service');
      const recoveryRes = await LeadRecoveryService.handleInboundCustomerReply(From, text);
      if (recoveryRes.handled && recoveryRes.replyMessage) {
        return { reply: recoveryRes.replyMessage };
      }
    } catch (err: any) {
      console.warn('Error checking lead recovery in inbound SMS:', err.message);
    }

    return {};
  }

  /**
   * Updates delivery status callback from Twilio webhook
   */
  public static async handleDeliveryStatus(body: {
    MessageSid: string;
    MessageStatus: string;
    ErrorCode?: string;
    ErrorMessage?: string;
  }): Promise<void> {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = body;
    const statusMap: Record<string, 'sent' | 'delivered' | 'failed'> = {
      queued: 'sent',
      sent: 'sent',
      delivered: 'delivered',
      undelivered: 'failed',
      failed: 'failed',
    };

    const status = statusMap[MessageStatus.toLowerCase()] || 'sent';

    await CommunicationLog.findOneAndUpdate(
      { twilioSid: MessageSid },
      {
        $set: {
          status,
          errorCode: ErrorCode,
          errorMessage: ErrorMessage,
        },
      }
    );
  }

  /**
   * Lists communication logs for a business with pagination
   */
  public static async getMessages(
    businessId: Types.ObjectId | string,
    filter: {
      page?: number;
      limit?: number;
      customerId?: string;
      status?: string;
      direction?: string;
    }
  ): Promise<{ messages: ICommunicationLog[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    const query: any = { businessId };
    if (filter.customerId) query.customerId = filter.customerId;
    if (filter.status && filter.status !== 'all') query.status = filter.status;
    if (filter.direction && filter.direction !== 'all') query.direction = filter.direction;

    const [messages, total] = await Promise.all([
      CommunicationLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customerId', 'firstName lastName phone email')
        .populate('appointmentId', 'startAt title status'),
      CommunicationLog.countDocuments(query),
    ]);

    return {
      messages,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
