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
} from '../types/telephony.types';
import { AppError } from '../types';

export class CallService {
  /**
   * List calls for a business with pagination, filters, and search.
   */
  public static async getCalls(
    businessId: Types.ObjectId | string,
    filter: CallQueryFilter
  ): Promise<{ calls: ICallLog[]; total: number; page: number; totalPages: number }> {
    const query: any = { businessId };

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

    let businessId: any;
    let business: any;

    if (businessPhone) {
      businessId = businessPhone.businessId;
      business = await Business.findById(businessId);
    } else {
      // Fallback to first active business in DB to prevent dropped calls in dev
      business = await Business.findOne();
      if (!business) {
        throw new AppError('No business found to route inbound call', 404);
      }
      businessId = business._id;
    }

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
   * Simulate an inbound test call (for testing telephony without live Twilio number).
   */
  public static async simulateInboundCall(
    businessId: Types.ObjectId | string,
    callerPhone: string,
    durationSeconds: number = 45,
    options: { transcript?: any[]; outcome?: string; notes?: string } = {}
  ): Promise<ICallLog> {
    const business = await Business.findById(businessId);
    if (!business) {
      throw new AppError('Business not found', 404);
    }

    const businessPhone = await BusinessPhoneNumber.findOne({ businessId, isPrimary: true });
    const to = businessPhone ? businessPhone.phoneNumber : '+18005550199';

    // Match customer
    const digits = callerPhone.replace(/[^\d]/g, '');
    const last10 = digits.slice(-10);
    let customer = null;

    if (last10.length >= 7) {
      const flexiblePattern = last10.split('').join('[^\\d]*');
      customer = await Customer.findOne({
        businessId,
        phone: { $regex: new RegExp(flexiblePattern) },
      });
    }

    const callSid = `CA_sim_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const defaultConvo = {
      summary: 'Caller reported upstairs AC blowing warm air in 95°F heat. Alex AI qualified urgency, verified Dallas 75201 service zone, and successfully booked a Saturday morning emergency diagnostic slot ($89 diagnostic credited to repair).',
      sentiment: 'positive' as const,
      outcome: 'appointment_booked',
      notes: 'Emergency AC diagnostic booked for Saturday 9:00 AM - 11:00 AM. Senior tech Mike assigned. Confirmation SMS dispatched.',
      transcript: [
        { role: 'assistant', text: 'Thank you for calling Arctic Air HVAC! My name is Alex, your 24/7 assistant. How can I help you today?', timestamp: new Date(Date.now() - durationSeconds * 1000) },
        { role: 'user', text: "Hi Alex! My upstairs AC unit just started blowing warm air, and it's 95 degrees outside. Can you get someone out here soon?", timestamp: new Date(Date.now() - (durationSeconds - 8) * 1000) },
        { role: 'assistant', text: "I completely understand how urgent that is in this heat! May I please confirm your street address or zip code so I can check technician availability in your neighborhood?", timestamp: new Date(Date.now() - (durationSeconds - 16) * 1000) },
        { role: 'user', text: "Yes, I'm at 742 Evergreen Terrace in Dallas, zip code 75201.", timestamp: new Date(Date.now() - (durationSeconds - 24) * 1000) },
        { role: 'assistant', text: "Thank you! We have certified technicians in 75201. I have an opening tomorrow morning between 9:00 AM and 11:00 AM with Mike, our senior HVAC specialist. Would that work for you?", timestamp: new Date(Date.now() - (durationSeconds - 32) * 1000) },
        { role: 'user', text: "Yes, 9:00 AM to 11:00 AM works great! What is your diagnostic fee?", timestamp: new Date(Date.now() - (durationSeconds - 40) * 1000) },
        { role: 'assistant', text: "Our comprehensive diagnostic fee is $89, which is 100% credited toward the repair if you decide to proceed with us. Shall I lock that in for you?", timestamp: new Date(Date.now() - (durationSeconds - 48) * 1000) },
        { role: 'user', text: "Yes, please lock that in. Thank you for making this so easy!", timestamp: new Date(Date.now() - (durationSeconds - 54) * 1000) },
        { role: 'assistant', text: "Done! Your appointment is locked for tomorrow between 9 AM and 11 AM. I've also dispatched a confirmation SMS with tracking to your mobile. Stay cool and have a wonderful day!", timestamp: new Date(Date.now() - (durationSeconds - 58) * 1000) },
      ],
      toolExecutions: [
        { toolName: 'verify_service_territory', arguments: { zipCode: '75201', trade: 'hvac' }, result: { inTerritory: true, territoryName: 'Dallas Metro Fleet' }, durationMs: 92 },
        { toolName: 'get_available_technicians', arguments: { zipCode: '75201', requestedWindow: 'morning' }, result: { availableSlots: 3, assignedTech: 'Mike R. (Senior Master Tech)' }, durationMs: 135 },
        { toolName: 'book_calendar_appointment', arguments: { time: '09:00 AM - 11:00 AM', customerPhone: callerPhone, serviceType: 'Emergency AC Diagnostic' }, result: { appointmentId: 'apt_sim_7482', status: 'confirmed', priceEstimate: '$89' }, durationMs: 215 },
        { toolName: 'dispatch_confirmation_sms', arguments: { to: callerPhone, template: 'booking_confirmed' }, result: { messageSid: 'SM_sim_84920', status: 'delivered' }, durationMs: 180 },
      ],
    };

    const call = await CallLog.create({
      businessId,
      phoneNumberId: businessPhone?._id || null,
      provider: 'twilio',
      providerCallSid: callSid,
      direction: 'inbound',
      from: callerPhone,
      to,
      status: 'completed',
      startedAt: new Date(Date.now() - durationSeconds * 1000),
      answeredAt: new Date(Date.now() - durationSeconds * 1000),
      endedAt: new Date(),
      durationSeconds,
      customerId: customer ? customer._id : null,
      aiHandled: true,
      summary: defaultConvo.summary,
      sentiment: defaultConvo.sentiment,
      transcript: options.transcript && options.transcript.length > 0 ? options.transcript : defaultConvo.transcript,
      toolExecutions: defaultConvo.toolExecutions,
      outcome: options.outcome || defaultConvo.outcome,
      notes: options.notes || defaultConvo.notes,
    });

    return CallLog.findById(call._id).populate('customerId', 'firstName lastName phone email') as any;
  }

  /**
   * Call statistics for dashboard and reporting.
   */
  public static async getCallStats(
    businessId: Types.ObjectId | string
  ): Promise<{ total: number; inbound: number; completed: number; missed: number }> {
    const [total, inbound, completed, missed] = await Promise.all([
      CallLog.countDocuments({ businessId }),
      CallLog.countDocuments({ businessId, direction: 'inbound' }),
      CallLog.countDocuments({ businessId, status: 'completed' }),
      CallLog.countDocuments({ businessId, status: { $in: ['no_answer', 'failed', 'busy'] } }),
    ]);

    return { total, inbound, completed, missed };
  }
}
