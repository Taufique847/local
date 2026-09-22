import { Types } from 'mongoose';
import { CallLog } from '../models/call-log.model';
import { BusinessPhoneNumber } from '../models/phone-number.model';
import { Business } from '../models/business.model';
import { Customer } from '../models/customer.model';
import {
  ICallLog,
  CallQueryFilter,
  TwilioWebhookVoiceBody,
  CallStatus,
  TestCallReadiness,
} from '../types/telephony.types';
import { AppError } from '../types';
import { resolveBusinessForInboundNumber } from './business-resolver.service';
import { TwilioService } from './twilio.service';
import { BillingService } from './billing.service';
import { RealtimeVoiceProvider } from './voice/realtime-voice-provider.service';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export class CallService {
  /** Test calls allowed per business per rolling hour. */
  private static readonly TEST_CALLS_PER_HOUR = 5;

  /**
   * List calls for a business with pagination, filters, and search.
   */
  public static async getCalls(
    businessId: Types.ObjectId | string,
    filter: CallQueryFilter
  ): Promise<{ calls: ICallLog[]; total: number; page: number; totalPages: number }> {
    const query: any = { businessId };

    // Owner test calls are hidden unless explicitly requested, so the call
    // history reflects customer activity.
    if (String(filter.includeTest) !== 'true') {
      query.isTest = { $ne: true };
    }

    if (filter.direction && filter.direction !== 'all') {
      query.direction = filter.direction;
    }

    if (filter.status && filter.status !== 'all') {
      query.status = filter.status;
    }

    if (filter.customerId) {
      query.customerId = filter.customerId;
    }

    if (filter.date) {
      const [year, month, day] = filter.date.split('-').map(Number);
      if (year && month && day) {
        const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
        const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        query.startedAt = { $gte: start, $lte: end };
      }
    }

    if (filter.search) {
      const regex = new RegExp(filter.search.trim(), 'i');
      const matchingCustomers = await Customer.find({
        businessId,
        $or: [{ firstName: regex }, { lastName: regex }, { phone: regex }],
      }).select('_id');

      const customerIds = matchingCustomers.map((c) => c._id);

      query.$or = [{ from: regex }, { to: regex }, { customerId: { $in: customerIds } }];
    }

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    const [calls, total] = await Promise.all([
      CallLog.find(query)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customerId', 'firstName lastName phone email address')
        .populate('phoneNumberId', 'phoneNumber friendlyName'),
      CallLog.countDocuments(query),
    ]);

    return {
      calls,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get single call by ID.
   */
  public static async getCallById(
    businessId: Types.ObjectId | string,
    callId: string
  ): Promise<ICallLog> {
    const call = await CallLog.findOne({ _id: callId, businessId })
      .populate('customerId', 'firstName lastName phone email address')
      .populate('phoneNumberId', 'phoneNumber friendlyName');

    if (!call) {
      throw new AppError('Call record not found', 404);
    }

    return call;
  }

  /**
   * Handle incoming Twilio voice webhook (Idempotent + Multi-Tenant).
   */
  public static async handleInboundWebhook(body: TwilioWebhookVoiceBody): Promise<{
    callLog: ICallLog;
    business: any;
  }> {
    const { CallSid, From, To } = body;

    // 1. Idempotency Check: Don't duplicate call log if Twilio retries webhook
    const existingCall = await CallLog.findOne({ providerCallSid: CallSid });
    if (existingCall) {
      const business = await Business.findById(existingCall.businessId);
      return { callLog: existingCall, business };
    }

    // 2. Resolve Multi-Tenant Business by called phone number (To)
    let businessPhone = await BusinessPhoneNumber.findOne({
      phoneNumber: To,
      status: 'active',
    });

    // Fallback: search by stripped digits if formatted differently
    if (!businessPhone) {
      const strippedTo = To.replace(/[^\d]/g, '');
      businessPhone = await BusinessPhoneNumber.findOne({
        phoneNumber: { $regex: new RegExp(strippedTo + '$') },
        status: 'active',
      });
    }

    let business: any = businessPhone ? await Business.findById(businessPhone.businessId) : null;

    if (!business) {
      // No provisioned number matched. A dev-only single-tenant fallback is
      // allowed; otherwise refuse rather than attributing this call to an
      // arbitrary unrelated business (the previous behaviour).
      const resolved = await resolveBusinessForInboundNumber(To);
      business = resolved.business;
      if (!resolved.business) {
        throw new AppError(`Inbound number ${To} is not provisioned to any business`, 404);
      }
      if (resolved.phoneRecord) businessPhone = resolved.phoneRecord;
    }

    const businessId: any = business._id;

    // 3. Customer Matching: Check if caller (From) matches an existing customer
    let customerId: Types.ObjectId | null = null;
    const digits = From.replace(/[^\d]/g, '');
    const last10 = digits.slice(-10);

    if (last10.length >= 7) {
      const flexiblePattern = last10.split('').join('[^\\d]*');
      const matchedCustomer = await Customer.findOne({
        businessId,
        phone: { $regex: new RegExp(flexiblePattern) },
      });

      if (matchedCustomer) {
        customerId = matchedCustomer._id;
      }
    }

    // 4. Create CallLog
    const callLog = await CallLog.create({
      businessId,
      phoneNumberId: businessPhone?._id || null,
      provider: 'twilio',
      providerCallSid: CallSid,
      direction: 'inbound',
      from: From,
      to: To,
      status: 'in_progress',
      startedAt: new Date(),
      answeredAt: new Date(),
      customerId,
    });

    return { callLog, business };
  }

  /**
   * Handle Twilio status callback webhook.
   */
  public static async handleStatusWebhook(body: TwilioWebhookVoiceBody): Promise<ICallLog | null> {
    const { CallSid, CallStatus: status, CallDuration, Duration } = body;

    const call = await CallLog.findOne({ providerCallSid: CallSid });
    if (!call) {
      return null;
    }

    const mappedStatus: CallStatus = (status as CallStatus) || 'completed';
    call.status = mappedStatus;
    call.endedAt = new Date();

    const duration = Number(CallDuration || Duration || 0);
    if (duration > 0) {
      call.durationSeconds = duration;
    } else if (call.startedAt) {
      call.durationSeconds = Math.max(0, Math.floor((Date.now() - call.startedAt.getTime()) / 1000));
    }

    await call.save();
    return call;
  }

  /**
   * Reports whether an owner-initiated test call can be placed right now.
   *
   * Every blocker is named so the UI can tell the contractor exactly what to fix
   * instead of failing with a generic error after they press the button.
   */
  public static async getTestCallReadiness(
    businessId: Types.ObjectId | string
  ): Promise<TestCallReadiness> {
    const business = await Business.findById(businessId);
    if (!business) {
      throw new AppError('Business not found', 404);
    }

    const telephonyConfigured = TwilioService.isConfigured();
    const voiceProvider = config.voiceProvider;
    const voiceEngineReady =
      voiceProvider === 'realtime' ? RealtimeVoiceProvider.isFullyConfigured() : voiceProvider !== 'off';

    const aiLine = await BusinessPhoneNumber.findOne({
      businessId,
      status: 'active',
      isPrimary: true,
    });

    const destinationPhone = await this.resolveTestCallDestination(businessId, business);
    const callsUsed = await this.countRecentTestCalls(businessId);
    const callsRemainingThisHour = Math.max(0, this.TEST_CALLS_PER_HOUR - callsUsed);

    const blockers: string[] = [];
    if (!telephonyConfigured) {
      blockers.push('Twilio is not configured on this server, so no call can be placed.');
    }
    if (!aiLine) {
      blockers.push('No active AI phone line is connected. Add one in Settings → Phone.');
    }
    if (!destinationPhone) {
      blockers.push('Add your business phone number in Settings so the test call has somewhere to ring.');
    }
    if (voiceProvider === 'off') {
      blockers.push('The voice engine is switched off (VOICE_PROVIDER=off).');
    } else if (!voiceEngineReady) {
      blockers.push(
        'Speech and language provider keys are missing, so the assistant cannot hold a conversation yet.'
      );
    }
    if (callsRemainingThisHour === 0) {
      blockers.push(`Test call limit reached (${this.TEST_CALLS_PER_HOUR} per hour). Try again later.`);
    }

    return {
      ready: blockers.length === 0,
      blockers,
      telephonyConfigured,
      voiceProvider,
      voiceEngineReady,
      aiPhoneNumber: aiLine?.phoneNumber || null,
      destinationPhone,
      callsRemainingThisHour,
    };
  }

  /**
   * Places a real outbound call from the business's AI line to the owner.
   *
   * Replaces `simulateInboundCall`, which fabricated an entire conversation —
   * transcript, tool executions, a "Mike R." technician, an
   * `appointment_booked` outcome — and wrote it to CallLog as a genuine
   * AI-handled call. Owners believed they had tested the assistant, and the
   * invented records fed the dashboard's own KPIs.
   *
   * When the owner answers, Twilio fetches TwiML from the test-call webhook and
   * the call enters the same media stream, speech recognition, language model
   * and speech synthesis path an inbound customer call uses.
   */
  public static async startTestCall(
    businessId: Types.ObjectId | string
  ): Promise<{ callId: string; callSid: string; to: string; from: string }> {
    const readiness = await this.getTestCallReadiness(businessId);
    if (!readiness.ready) {
      throw new AppError(readiness.blockers[0], 409);
    }

    // A test call consumes real provider minutes, so it is metered like any other.
    const entitlement = await BillingService.checkEntitlement(businessId);
    if (!entitlement.allowed) {
      throw new AppError(
        entitlement.reason || 'Your plan does not currently allow placing calls.',
        402
      );
    }

    const from = readiness.aiPhoneNumber!;
    const to = readiness.destinationPhone!;

    const baseUrl = config.twilioWebhookBaseUrl;
    if (!baseUrl || baseUrl.startsWith('http://localhost')) {
      throw new AppError(
        'TWILIO_WEBHOOK_BASE_URL must be a public HTTPS address for Twilio to reach this server. Start a tunnel and set it before placing a test call.',
        409
      );
    }

    const { callSid } = await TwilioService.placeOutboundCall({
      to,
      from,
      twimlUrl: `${baseUrl}/api/webhooks/twilio/test-call`,
      statusCallbackUrl: `${baseUrl}/api/webhooks/twilio/status`,
    });

    const aiLine = await BusinessPhoneNumber.findOne({ businessId, phoneNumber: from });

    // Created immediately because VoiceSessionService.endSession persists the
    // transcript with findOneAndUpdate({ providerCallSid }) — without this row
    // the conversation would be discarded when the call ends.
    const callLog = await CallLog.create({
      businessId,
      phoneNumberId: aiLine?._id || null,
      provider: 'twilio',
      providerCallSid: callSid,
      direction: 'outbound',
      from,
      to,
      status: 'initiated',
      startedAt: new Date(),
      isTest: true,
      notes: 'Owner-initiated test call.',
    });

    logger.info('test_call_started', {
      businessId: String(businessId),
      callSid,
      to,
      from,
    });

    return { callId: callLog._id.toString(), callSid, to, from };
  }

  /**
   * Destination for a test call.
   *
   * Deliberately NOT caller-supplied. Accepting an arbitrary number would turn
   * an authenticated account into an open dialer on our Twilio credentials —
   * a toll-fraud and robocall vector. Owners change where the test rings by
   * updating their own business profile or escalation number.
   */
  private static async resolveTestCallDestination(
    businessId: Types.ObjectId | string,
    business: any
  ): Promise<string | null> {
    if (business?.phone) return business.phone;

    try {
      const { PolicyGuardrailsService } = await import('./policy-guardrails.service');
      const policy = await PolicyGuardrailsService.getPolicy(businessId);
      return policy?.emergencyTransferPhone || null;
    } catch {
      return null;
    }
  }

  /**
   * Looks up a test call by its provider SID.
   *
   * The test-call TwiML webhook uses this instead of trusting anything in the
   * request body: only a call this server actually placed can open a media
   * stream, and the row already carries the resolved tenant.
   */
  public static async findTestCallBySid(callSid: string): Promise<ICallLog | null> {
    return CallLog.findOne({ providerCallSid: callSid, isTest: true });
  }

  /** Records that the owner picked up, so a no-answer is distinguishable. */
  public static async markTestCallAnswered(callSid: string): Promise<void> {
    await CallLog.updateOne(
      { providerCallSid: callSid, isTest: true },
      { $set: { status: 'in_progress', answeredAt: new Date() } }
    );
  }

  private static async countRecentTestCalls(
    businessId: Types.ObjectId | string
  ): Promise<number> {
    return CallLog.countDocuments({
      businessId,
      isTest: true,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });
  }

  /**
   * Call statistics for dashboard and reporting.
   *
   * Test calls are excluded: they are real calls, but they are the owner talking
   * to their own assistant, not customer demand.
   */
  public static async getCallStats(
    businessId: Types.ObjectId | string
  ): Promise<{ total: number; inbound: number; completed: number; missed: number }> {
    const real = { businessId, isTest: { $ne: true } };

    const [total, inbound, completed, missed] = await Promise.all([
      CallLog.countDocuments(real),
      CallLog.countDocuments({ ...real, direction: 'inbound' }),
      CallLog.countDocuments({ ...real, status: 'completed' }),
      CallLog.countDocuments({ ...real, status: { $in: ['no_answer', 'failed', 'busy'] } }),
    ]);

    return { total, inbound, completed, missed };
  }
}
