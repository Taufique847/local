import { Types } from 'mongoose';
import { Appointment } from '../models/appointment.model';
import { Customer } from '../models/customer.model';
import { Business } from '../models/business.model';
import { RescheduleRequest, IRescheduleRequest } from '../models/reschedule-request.model';
import { AvailabilityService } from './availability.service';
import { AppointmentService } from './appointment.service';
import { IAppointment, AppointmentStatus } from '../types/appointment.types';
import { formatDateTimeInZone } from '../utils/format';
import { AppError } from '../types';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'appointment-reply' });

/** Statuses an inbound reply can still act on. */
const LIVE_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed', 'rescheduled'];

export interface InboundReplyResult {
  handled: boolean;
  replyMessage?: string;
}

/**
 * Customers confirming or rescheduling by replying to a text.
 *
 * This is the other half of the reminder. The reminder now tells the customer to
 * reply `C` or `R`; this is what makes that instruction true. Until it existed the
 * reminder deliberately did not offer it, because an instruction the system drops
 * leaves the customer believing they have rescheduled when nobody knows they
 * asked.
 */
export class AppointmentReplyService {
  /**
   * Keywords, deliberately short and deliberately exact-match only.
   *
   * Exact match rather than "contains", because a customer writing "I can't make
   * it, can we reschedule?" must NOT be read as a bare `C`. That message goes to
   * the needs-attention queue where a human reads it — which is the honest
   * outcome, since no keyword matcher can safely infer intent from prose.
   */
  private static readonly CONFIRM_KEYWORDS = ['C', 'CONFIRM', 'YES CONFIRM'];
  private static readonly RESCHEDULE_KEYWORDS = ['R', 'RESCHEDULE'];

  /** How many alternative slots to offer back. Three fits in one SMS segment. */
  private static readonly SLOTS_TO_OFFER = 3;

  /** How many days ahead to look for those slots. */
  private static readonly SLOT_SEARCH_DAYS = 7;

  public static matchKeyword(text: string): 'confirm' | 'reschedule' | null {
    const upper = (text || '').trim().toUpperCase();
    if (!upper) return null;
    if (this.CONFIRM_KEYWORDS.includes(upper)) return 'confirm';
    if (this.RESCHEDULE_KEYWORDS.includes(upper)) return 'reschedule';
    return null;
  }

  /**
   * Handles an inbound SMS that might be a reply to an appointment reminder.
   *
   * Returns `handled: false` for anything it does not recognise, so the caller
   * can keep walking its chain of handlers. It never throws: an inbound webhook
   * that 500s makes Twilio retry, and a retried confirm would be processed twice.
   */
  public static async handleInboundReply(
    businessId: Types.ObjectId | string,
    fromPhone: string,
    text: string
  ): Promise<InboundReplyResult> {
    const intent = this.matchKeyword(text);
    if (!intent) return { handled: false };

    try {
      const customer = await Customer.findOne({ businessId, phone: fromPhone })
        .select('_id firstName')
        .lean();

      // A keyword from a number with no customer record is not something this
      // handler can act on. Left unhandled so it reaches needs-attention.
      if (!customer) return { handled: false };

      const appointment = await this.nextAppointmentFor(businessId, customer._id);

      /**
       * A keyword with no upcoming appointment is answered, not ignored.
       *
       * The customer did what they were asked to do. Telling them there is
       * nothing to confirm is a worse experience than silence only if it is
       * wrong, and it is not — the alternative is them believing a cancelled or
       * completed job is still on.
       */
      if (!appointment) {
        return {
          handled: true,
          replyMessage:
            'We could not find an upcoming appointment for this number. If you think that is wrong, reply with a short message and we will take a look.',
        };
      }

      const business = await Business.findById(businessId).select('timezone phone').lean();
      const timezone = business?.timezone || appointment.timezone;

      return intent === 'confirm'
        ? await this.confirm(appointment, timezone)
        : await this.requestReschedule(businessId, appointment, text, timezone, business?.phone);
    } catch (err: any) {
      log.error('inbound_reply_failed', {
        businessId: String(businessId),
        intent,
        reason: err?.message,
      });
      // Unhandled, so the message still lands in the needs-attention queue rather
      // than disappearing because this handler had a bad day.
      return { handled: false };
    }
  }

  /**
   * The customer's next live appointment.
   *
   * Nearest first, and only in the future. A customer who has both a job tomorrow
   * and one next month is confirming tomorrow's.
   */
  private static async nextAppointmentFor(
    businessId: Types.ObjectId | string,
    customerId: Types.ObjectId
  ): Promise<IAppointment | null> {
    return Appointment.findOne({
      businessId,
      customerId,
      status: { $in: LIVE_STATUSES },
      startAt: { $gt: new Date() },
    }).sort({ startAt: 1 });
  }

  private static async confirm(
    appointment: IAppointment,
    timezone: string
  ): Promise<InboundReplyResult> {
    const when = formatDateTimeInZone(appointment.startAt, timezone);

    /**
     * Idempotent. Twilio retries a webhook that did not return 2xx, and a
     * customer can text C twice. Re-stamping would move the timestamp and make
     * "when did they confirm?" unanswerable, so the first confirmation stands.
     */
    if (appointment.confirmedByCustomerAt) {
      return {
        handled: true,
        replyMessage: `You are already confirmed for ${when}. See you then!`,
      };
    }

    appointment.confirmedByCustomerAt = new Date();

    /**
     * `status` is only advanced from 'scheduled'.
     *
     * A 'rescheduled' appointment keeps that status, because it records how the
     * appointment came to be at this time and overwriting it would lose that. The
     * customer's own acknowledgement lives in `confirmedByCustomerAt`, which is
     * why it is a separate field rather than a status value.
     */
    if (appointment.status === 'scheduled') {
      appointment.status = 'confirmed';
    }

    await appointment.save();

    return {
      handled: true,
      replyMessage: `Thanks! Your appointment on ${when} is confirmed. Reply R if you need to reschedule.`,
    };
  }

  private static async requestReschedule(
    businessId: Types.ObjectId | string,
    appointment: IAppointment,
    text: string,
    timezone: string,
    businessPhone?: string
  ): Promise<InboundReplyResult> {
    const offered = await this.findNextSlots(businessId, appointment);

    /**
     * One pending request per appointment.
     *
     * Enforced by a partial unique index as well as this read, because two
     * inbound webhooks for the same message can land concurrently. The existing
     * request is updated rather than rejected, so a customer texting R again gets
     * fresh slots instead of stale ones.
     */
    let requestDoc: IRescheduleRequest | null = await RescheduleRequest.findOne({
      appointmentId: appointment._id,
      status: 'pending',
    });

    if (requestDoc) {
      requestDoc.offeredSlots = offered;
      requestDoc.requestText = text.slice(0, 1600);
      await requestDoc.save();
    } else {
      try {
        requestDoc = await RescheduleRequest.create({
          businessId,
          customerId: appointment.customerId,
          appointmentId: appointment._id,
          status: 'pending',
          source: 'sms',
          requestText: text.slice(0, 1600),
          originalStartAt: appointment.startAt,
          offeredSlots: offered,
        });
      } catch (err: any) {
        // Lost the race on the unique index. The other writer created the same
        // request, so this is a success, not a failure.
        if (err?.code !== 11000) throw err;
        requestDoc = await RescheduleRequest.findOne({
          appointmentId: appointment._id,
          status: 'pending',
        });
      }
    }

    if (!offered.length) {
      return {
        handled: true,
        replyMessage: businessPhone
          ? `No problem — we have your reschedule request and will call you shortly. If it is urgent, call us at ${businessPhone}.`
          : 'No problem — we have your reschedule request and will be in touch shortly to find a new time.',
      };
    }

    const list = offered
      .map((slot, i) => `${i + 1}) ${formatDateTimeInZone(slot.startAt, timezone)}`)
      .join('  ');

    return {
      handled: true,
      replyMessage: `Got it, we will move your appointment. Nearest openings: ${list}. Reply with the number you want, or we will call you to confirm.`,
    };
  }

  /**
   * The nearest genuinely open slots, walking forward day by day.
   *
   * Uses `AvailabilityService.getAvailableSlots`, so business hours, existing
   * bookings and past times are all honoured by the same code the booking UI
   * uses — offering a slot the booking path would then reject is worse than
   * offering none.
   */
  private static async findNextSlots(
    businessId: Types.ObjectId | string,
    appointment: IAppointment
  ): Promise<Array<{ startAt: Date; endAt: Date }>> {
    const found: Array<{ startAt: Date; endAt: Date }> = [];
    const cursor = new Date();

    for (let dayOffset = 0; dayOffset < this.SLOT_SEARCH_DAYS; dayOffset++) {
      if (found.length >= this.SLOTS_TO_OFFER) break;

      const day = new Date(cursor.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dateStr = day.toISOString().slice(0, 10);

      let result;
      try {
        result = await AvailabilityService.getAvailableSlots(
          businessId,
          String(appointment.serviceId),
          dateStr
        );
      } catch (err: any) {
        // A deleted service or a closed day must not abort the whole search.
        log.warn('slot_lookup_failed', { dateStr, reason: err?.message });
        continue;
      }

      for (const slot of result.slots) {
        if (found.length >= this.SLOTS_TO_OFFER) break;

        /**
         * `available` already excludes the slot the customer currently holds.
         *
         * An explicit "skip their own start time" check used to sit here and was
         * unreachable: `getAvailableSlots` marks a slot unavailable when any
         * non-cancelled appointment overlaps it, and an appointment trivially
         * overlaps its own start. It also excludes times in the past. Keeping the
         * check would have implied a guard that could never fire.
         */
        if (!slot.available) continue;

        found.push({ startAt: new Date(slot.startAt), endAt: new Date(slot.endAt) });
      }
    }

    return found;
  }

  // ---------------------------------------------------------------------------
  // Owner-facing queue
  // ---------------------------------------------------------------------------

  public static async listRequests(
    businessId: Types.ObjectId | string,
    filter: { status?: string; page?: string | number; limit?: string | number } = {}
  ): Promise<{
    requests: IRescheduleRequest[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query: any = { businessId };
    if (filter.status && filter.status !== 'all') {
      if (!['pending', 'applied', 'dismissed'].includes(filter.status)) {
        throw new AppError(
          'Unknown status. Expected one of: pending, applied, dismissed, all.',
          400
        );
      }
      query.status = filter.status;
    }

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));

    const [requests, total] = await Promise.all([
      RescheduleRequest.find(query)
        // Pending first, then oldest, because this is a work queue.
        .sort({ status: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('customerId', 'firstName lastName phone email')
        .populate('appointmentId', 'title startAt endAt status technicianName'),
      RescheduleRequest.countDocuments(query),
    ]);

    return { requests, total, page, totalPages: Math.ceil(total / limit) || 1 };
  }

  /**
   * Applies a reschedule request by actually moving the appointment.
   *
   * Routed through `AppointmentService.rescheduleAppointment`, not a direct
   * update, so the per-business booking lock, the conflict re-check, the business
   * hours check and `rescheduleHistory` all still apply — and the customer gets
   * the rescheduled notification from the one place that sends it.
   */
  public static async applyRequest(
    businessId: Types.ObjectId | string,
    requestId: string,
    input: { startAt: string; endAt?: string; resolvedBy?: string }
  ): Promise<{ request: IRescheduleRequest; appointment: IAppointment }> {
    if (!Types.ObjectId.isValid(requestId)) {
      throw new AppError('Reschedule request not found', 404);
    }

    const request = await RescheduleRequest.findOne({ _id: requestId, businessId });
    if (!request) throw new AppError('Reschedule request not found', 404);

    if (request.status !== 'pending') {
      throw new AppError(`This request has already been ${request.status}.`, 409);
    }

    const appointment = await AppointmentService.rescheduleAppointment(
      businessId,
      String(request.appointmentId),
      {
        startAt: input.startAt,
        endAt: input.endAt,
        reason: 'Customer requested a reschedule by text',
        changedBy: input.resolvedBy || 'owner',
      }
    );

    // Written only after the move succeeded, so a conflict leaves the request
    // pending rather than marking it done with nothing changed.
    request.status = 'applied';
    request.appliedStartAt = appointment.startAt;
    request.resolvedAt = new Date();
    request.resolvedBy = input.resolvedBy || 'owner';
    await request.save();

    return { request, appointment };
  }

  public static async dismissRequest(
    businessId: Types.ObjectId | string,
    requestId: string,
    resolvedBy?: string
  ): Promise<IRescheduleRequest> {
    if (!Types.ObjectId.isValid(requestId)) {
      throw new AppError('Reschedule request not found', 404);
    }

    const request = await RescheduleRequest.findOne({ _id: requestId, businessId });
    if (!request) throw new AppError('Reschedule request not found', 404);

    if (request.status !== 'pending') {
      throw new AppError(`This request has already been ${request.status}.`, 409);
    }

    request.status = 'dismissed';
    request.resolvedAt = new Date();
    request.resolvedBy = resolvedBy || 'owner';
    await request.save();

    return request;
  }
}
