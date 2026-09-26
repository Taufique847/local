import { Types } from 'mongoose';
import { CommunicationLog } from '../models/communication-log.model';
import { Business } from '../models/business.model';
import { Customer } from '../models/customer.model';
import { BusinessPhoneNumber } from '../models/phone-number.model';
import {
  ICommunicationLog,
  SendMessageInput,
  MessageType,
  MessageChannel,
  NotificationVars,
  MESSAGE_CHANNELS,
} from '../types/communication.types';
import { renderNotification } from './notification-templates';
import { config } from '../config/env';
import { AppError } from '../types';
import { logger } from '../utils/logger';
import { isEarlyQuietHoursJurisdiction, getTimezoneForPhoneNumber } from '../utils/disclosure';
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
   * Resolves the recipient's local timezone from their phone number.
   * Under TCPA (47 CFR § 64.1200(c)(1)), quiet hours must be evaluated
   * at the called party's location.
   */
  public static resolveRecipientTimezone(
    phoneNumber?: string,
    fallback: string = 'America/New_York'
  ): string {
    if (!phoneNumber) return fallback;
    return getTimezoneForPhoneNumber(phoneNumber, fallback);
  }

  /**
   * Evaluates TCPA Quiet Hours (8:00 AM - 9:00 PM federal TCPA; 8:00 AM - 8:00 PM in FL/OK/MD Mini-TCPA states).
   */
  public static isWithinQuietHours(
    timezone: string = 'America/New_York',
    date: Date = new Date(),
    phoneNumber?: string
  ): boolean {
    try {
      const timeString = date.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
      });
      const hour = parseInt(timeString, 10);
      const isEarlyState = isEarlyQuietHoursJurisdiction(phoneNumber);
      const cutoffHour = isEarlyState ? 20 : 21; // 8:00 PM for FL/OK/MD, 9:00 PM federal
      return hour < 8 || hour >= cutoffHour;
    } catch {
      return true; // TCPA Fail-Closed: Treat as quiet hours on timezone formatting failure
    }
  }

  /**
   * Renders the SMS body for a message type.
   *
   * Now a thin delegate. The copy itself moved to `notification-templates.ts` so
   * that the SMS and email versions of a message are defined next to each other
   * and cannot drift — this switch and the email copy being maintained in
   * separate files is exactly how a customer ends up with a confirmation text and
   * a confirmation email that disagree about the appointment time.
   *
   * Kept as a public method because the voice agent's booking tool calls it
   * directly.
   */
  public static renderTemplate(type: MessageType, vars: NotificationVars): string {
    return renderNotification(type, 'sms', vars)?.body || '';
  }

  /**
   * Sends an SMS with tenant isolation, quiet hours check, and opt-out verification
   */
  public static async sendMessage(
    businessId: Types.ObjectId | string,
    input: SendMessageInput
  ): Promise<ICommunicationLog> {
    const business = await Business.findById(businessId);
    if (!business) throw new AppError('Business not found', 404);

    /**
     * These are refusals, not faults.
     *
     * All three used `throw new Error`, which the error handler had no case for,
     * so an opt-out or a quiet-hours block came back as a 500 — indistinguishable
     * from the server being broken, and the UI could not tell the operator why
     * their message was not sent.
     */
    if (input.customerId) {
      const customer = await Customer.findOne({ _id: input.customerId, businessId });
      if (customer && customer.isOptedOut) {
        throw new AppError(
          'This customer has opted out of text messages and cannot be contacted by SMS.',
          409
        );
      }
    }

    // Check quiet hours in recipient's local timezone (TCPA 47 CFR § 64.1200(c)(1))
    const recipientTimezone = CommunicationService.resolveRecipientTimezone(input.to, business.timezone);
    if (!input.bypassQuietHours && this.isWithinQuietHours(recipientTimezone, new Date(), input.to)) {
      const isEarly = isEarlyQuietHoursJurisdiction(input.to);
      const cutoffStr = isEarly ? '8:00 PM' : '9:00 PM';
      throw new AppError(
        `Outside permitted texting hours (8:00 AM – ${cutoffStr} ${recipientTimezone || 'local time'}). This message was not sent.`,
        409
      );
    }

    // Florida / Oklahoma Mini-TCPA limit: maximum 3 commercial contacts per 24 hours
    if (!input.bypassQuietHours && isEarlyQuietHoursJurisdiction(input.to)) {
      const sentLast24h = await CommunicationLog.countDocuments({
        businessId,
        to: input.to,
        direction: 'outbound',
        channel: 'sms',
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
      if (sentLast24h >= 3) {
        throw new AppError(
          'Daily communication limit reached for this recipient under Florida/Oklahoma Mini-TCPA rules (maximum 3 contacts per 24-hour period).',
          429
        );
      }
    }

    // Resolve the outbound From number.
    //
    // This lookup previously filtered on `status: 'assigned'`, but the phone
    // number schema only stores 'active' or 'inactive' — so it never matched and
    // every message fell back to the env number, or to a hardcoded
    // '+15550001234' that belongs to nobody.
    const primaryPhone = await BusinessPhoneNumber.findOne({
      businessId,
      isPrimary: true,
      status: 'active',
    });
    const fromNumber = primaryPhone?.phoneNumber || config.twilioPhoneNumber || null;

    const type = input.type || 'custom';
    const body = input.body.trim();

    // Refuse before writing a log entry that would imply an attempt was made.
    if (!fromNumber) {
      throw new AppError(
        'No active phone line is connected to this business, so SMS cannot be sent. Connect a number in Settings → Phone first.',
        409
      );
    }

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

    // Not configured is a failure, not a success.
    //
    // This branch used to stamp the log with `status: 'delivered'` and a
    // fabricated `SM_mock_<timestamp>` SID. Nothing was ever sent, yet the
    // owner's dashboard reported the customer had received the message — so
    // missed reminders and unanswered follow-ups were invisible.
    if (!client) {
      log.status = 'failed';
      log.errorCode = 'telephony_not_configured';
      log.errorMessage =
        'Twilio credentials are not configured on this server, so no message was sent.';
      await log.save();

      logger.error('sms_send_skipped_not_configured', {
        businessId: String(businessId),
        to: input.to,
        type,
      });

      throw new AppError(
        'SMS could not be sent because telephony is not configured on this server.',
        503
      );
    }

    try {
      const messageParams: any = {
        to: input.to,
        body,
        statusCallback: `${config.twilioWebhookBaseUrl}/api/webhooks/twilio/sms-status`,
      };

      // A2P 10DLC Campaign Routing: Use Messaging Service SID if configured
      if (config.twilioMessagingServiceSid) {
        messageParams.messagingServiceSid = config.twilioMessagingServiceSid;
      } else {
        messageParams.from = fromNumber;
      }

      const twilioMsg = await client.messages.create(messageParams);
      // 'sent' — not 'delivered'. Delivery is only known once Twilio calls the
      // status webhook back.
      log.twilioSid = twilioMsg.sid;
      log.status = 'sent';
      await log.save();
    } catch (err: any) {
      log.status = 'failed';
      log.errorMessage = err.message || 'Twilio send error';
      log.errorCode = err.code ? String(err.code) : undefined;
      await log.save();
      logger.error('sms_send_failed', {
        businessId: String(businessId),
        to: input.to,
        type,
        reason: err?.message,
        code: err?.code,
      });
      throw err;
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

    /**
     * Carrier-standard TCPA keywords, and only those.
     *
     * `YES` used to be an opt-in keyword. It is not a carrier standard, and it is
     * the single most likely thing a customer types in reply to any message — so a
     * customer answering "YES" to an appointment reminder had their reply consumed
     * as a marketing opt-in. Worse, the opt-in branch did not return, so execution
     * continued into the lead-recovery handler, whose intent regex matches "yes"
     * and which would book them a SECOND appointment for the next morning and text
     * a confirmation for it.
     *
     * `CANCEL` stays in the opt-out list even though a customer may well mean
     * "cancel my appointment": it is a carrier-mandated opt-out keyword and
     * treating it as anything else risks a TCPA violation. Appointment
     * cancellation by reply needs its own distinct keyword.
     */
    const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
    const optInKeywords = ['START', 'UNSTOP'];
    const helpKeywords = ['HELP', 'INFO'];

    const isOptOut = optOutKeywords.includes(upper);
    const isOptIn = optInKeywords.includes(upper);
    const isHelp = helpKeywords.includes(upper);

    if (customer && (isOptOut || isOptIn)) {
      const wasOptedOut = Boolean(customer.isOptedOut);
      const nowOptedOut = isOptOut;

      /**
       * Only written when the state actually changes.
       *
       * This appended to `notes` on every matching message. `notes` has a 2000
       * character cap, so a customer texting STOP a few dozen times would
       * eventually make `customer.save()` fail validation and take the whole
       * inbound webhook down with it.
       */
      if (wasOptedOut !== nowOptedOut) {
        customer.isOptedOut = nowOptedOut;
        customer.optedOutAt = nowOptedOut ? new Date() : null;
        const note = nowOptedOut
          ? '[SMS Opt-Out requested via text]'
          : '[SMS Opt-In confirmed via text]';
        customer.notes = `${customer.notes || ''} ${note}`.trim().slice(0, 2000);
        await customer.save();
      }
    }

    const inboundLog = await CommunicationLog.create({
      businessId,
      customerId: customer?._id || null,
      direction: 'inbound',
      channel: 'sms',
      type: 'custom',
      from: From,
      to: To,
      body: text,
      status: 'received',
      /**
       * Flagged on arrival, cleared by whichever handler answers it.
       *
       * This direction is deliberate. Flagging on failure instead would mean any
       * branch added later that forgets to flag silently reintroduces the original
       * bug — a customer question logged, unanswered and invisible. Starting
       * flagged makes forgetting safe: the worst case is an owner reading a
       * message that was in fact handled.
       */
      needsAttention: true,
      twilioSid: MessageSid,
    });

    /** Called by the handler that answered this message. */
    const claim = async (): Promise<void> => {
      inboundLog.needsAttention = false;
      await inboundLog.save();
    };

    if (isOptOut) {
      await claim();
      return {
        reply: 'You have been unsubscribed from notifications and will receive no further messages. Reply START to resubscribe.',
      };
    }

    /**
     * Returns rather than falling through.
     *
     * A consent keyword is a complete instruction on its own. Letting it continue
     * into the CSAT and lead-recovery handlers is what turned a one-word reply
     * into a booking.
     */
    if (isOptIn) {
      await claim();
      return {
        reply: 'You are subscribed again and will receive appointment updates. Reply STOP at any time to unsubscribe.',
      };
    }

    /**
     * CTIA Mandatory HELP / INFO keyword handler (CTIA Messaging Principles 5.1.2).
     * Commercial A2P automated messaging systems MUST provide immediate assistance,
     * contact information, and disclosure of message frequency / rates.
     */
    if (isHelp) {
      await claim();
      const business = await Business.findById(businessId).select('name phone email').lean();
      const name = business?.name || 'Support';
      const contactInfo = business?.phone
        ? `call ${business.phone}`
        : business?.email
        ? `email ${business.email}`
        : 'contact our office';
      return {
        reply: `${name}: For support, ${contactInfo}. Msg & data rates may apply. Reply STOP to cancel.`,
      };
    }

    /**
     * Appointment confirm / reschedule, ahead of the CSAT and recovery handlers.
     *
     * Placed AFTER the consent keywords, not before. `CANCEL` is a
     * carrier-mandated opt-out keyword, and a customer typing it almost certainly
     * means "cancel my appointment" — but acting on that reading instead of
     * honouring the opt-out is a TCPA violation, so consent wins and appointment
     * cancellation needs its own distinct keyword.
     *
     * Placed BEFORE CSAT and recovery because a bare `C` or `R` from a customer
     * with an upcoming job is unambiguous, and the recovery handler's intent regex
     * is loose enough to swallow short replies.
     */
    try {
      const { AppointmentReplyService } = await import('./appointment-reply.service');
      const replyRes = await AppointmentReplyService.handleInboundReply(businessId, From, text);
      if (replyRes.handled && replyRes.replyMessage) {
        await claim();
        return { reply: replyRes.replyMessage };
      }
    } catch (err: any) {
      logger.warn('inbound_appointment_reply_error', { reason: err?.message });
    }

    // Area 4: Review / CSAT rating reply (1-5 stars)
    try {
      const { ReviewReputationService } = await import('./review-reputation.service');
      const ratingRes = await ReviewReputationService.handleCustomerRatingReply(
        businessId,
        From,
        text
      );
      if (ratingRes.handled && ratingRes.responseText) {
        await claim();
        return { reply: ratingRes.responseText };
      }
    } catch (err: any) {
      logger.warn('inbound_csat_error', { reason: err?.message });
    }

    // Area 1: Speed-to-lead recovery reply
    try {
      const { LeadRecoveryService } = await import('./lead-recovery.service');
      const recoveryRes = await LeadRecoveryService.handleInboundCustomerReply(
        businessId,
        From,
        text
      );
      if (recoveryRes.handled && recoveryRes.replyMessage) {
        await claim();
        return { reply: recoveryRes.replyMessage };
      }
    } catch (err: any) {
      logger.warn('inbound_lead_recovery_error', { reason: err?.message });
    }

    /**
     * Nothing claimed it, so the flag set at creation stands and a person has to
     * read it.
     *
     * This is where an inbound message used to end: logged, unanswered, and
     * invisible. The customer still gets no automated reply — inventing one would
     * be worse than silence — but the owner now has a queue.
     */
    return {};
  }

  /**
   * Inbound messages no automated handler could answer.
   *
   * Deliberately a separate query rather than a filter on the main list: the
   * point is that it is short and can be emptied, and burying it in a paginated
   * history of every message is what made the problem invisible.
   */
  public static async getNeedsAttention(
    businessId: Types.ObjectId | string,
    filter: { page?: string | number; limit?: string | number } = {}
  ): Promise<{ messages: ICommunicationLog[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));

    const query = { businessId, needsAttention: true, attentionResolvedAt: null };

    const [messages, total] = await Promise.all([
      CommunicationLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('customerId', 'firstName lastName phone email'),
      CommunicationLog.countDocuments(query),
    ]);

    return { messages, total, page, totalPages: Math.ceil(total / limit) || 1 };
  }

  /** Marks a flagged message as dealt with. Scoped by businessId. */
  public static async resolveAttention(
    businessId: Types.ObjectId | string,
    messageId: string,
    resolvedBy?: string
  ): Promise<ICommunicationLog> {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new AppError('Message not found', 404);
    }

    const message = await CommunicationLog.findOneAndUpdate(
      { _id: messageId, businessId, needsAttention: true },
      {
        $set: {
          needsAttention: false,
          attentionResolvedAt: new Date(),
          attentionResolvedBy: resolvedBy || 'owner',
        },
      },
      { new: true }
    );

    if (!message) throw new AppError('Message not found', 404);
    return message;
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

    // Scoped to the SMS channel. `twilioSid` is now only ever written by this
    // path, but an unscoped match on a shared log is the kind of thing that
    // starts overwriting email rows the moment another provider reuses an id
    // format.
    await CommunicationLog.findOneAndUpdate(
      { twilioSid: MessageSid, channel: 'sms' },
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
      channel?: string;
    }
  ): Promise<{ messages: ICommunicationLog[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    const query: any = { businessId };
    if (filter.customerId) query.customerId = filter.customerId;
    if (filter.status && filter.status !== 'all') query.status = filter.status;
    if (filter.direction && filter.direction !== 'all') query.direction = filter.direction;
    // Validated against the known channels rather than passed through. An
    // unrecognised value would otherwise match nothing and read as "no messages"
    // instead of a bad request.
    if (filter.channel && filter.channel !== 'all') {
      if (!MESSAGE_CHANNELS.includes(filter.channel as MessageChannel)) {
        throw new AppError(
          `Unknown channel "${filter.channel}". Expected one of: ${MESSAGE_CHANNELS.join(', ')}.`,
          400
        );
      }
      query.channel = filter.channel;
    }

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
