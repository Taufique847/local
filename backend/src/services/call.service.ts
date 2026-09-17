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
    durationSeconds: number = 45
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
      notes: 'Simulated inbound test call for telephony verification.',
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
