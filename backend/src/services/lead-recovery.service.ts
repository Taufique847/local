import { Types } from 'mongoose';
import { LeadRecovery, ILeadRecovery } from '../models/lead-recovery.model';
import { CallLog } from '../models/call-log.model';
import { Customer } from '../models/customer.model';
import { Business } from '../models/business.model';
import { Appointment } from '../models/appointment.model';
import { Service } from '../models/service.model';
import { CommunicationService } from './communication.service';
import { AvailabilityService } from './availability.service';
import { AppointmentService } from './appointment.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { logger } from '../utils/logger';

export class LeadRecoveryService {
  /** Give up on a drip step after this many failed send attempts. */
  private static readonly MAX_DRIP_ATTEMPTS = 5;

  /**
   * Adjusts a follow-up timestamp so it never lands inside TCPA Quiet Hours (8:00 AM - 9:00 PM).
   * If it falls during quiet hours, automatically rolls forward to 8:05 AM the next morning.
   */
  public static calculateTcpaSafeFollowUp(targetDate: Date, timezone: string = 'America/Chicago'): Date {
    const nextSafe = new Date(targetDate);
    if (CommunicationService.isWithinQuietHours(timezone)) {
      nextSafe.setHours(8, 5, 0, 0);
      if (nextSafe.getTime() <= targetDate.getTime()) {
        nextSafe.setDate(nextSafe.getDate() + 1);
      }
    }
    return nextSafe;
  }

  /**
   * Evaluates a completed/missed call and initiates automated Speed-to-Lead recovery if unbooked
   */
  public static async triggerRecoveryForCall(
    callLogIdentifier: string | Types.ObjectId
  ): Promise<ILeadRecovery | null> {
    let callLog;
    if (Types.ObjectId.isValid(callLogIdentifier.toString()) && callLogIdentifier.toString().length === 24) {
      callLog = await CallLog.findById(callLogIdentifier);
    }
    if (!callLog) {
      callLog = await CallLog.findOne({ providerCallSid: callLogIdentifier.toString() });
    }

    if (!callLog) return null;

    // Never chase an owner test call. The "caller" is the contractor, so a drip
    // campaign would text them their own follow-up sequence.
    if (callLog.isTest) return null;

    // If call was already booked or an emergency transferred, no recovery needed
    if (callLog.appointmentId || callLog.outcome === 'appointment_booked' || callLog.outcome === 'emergency_transferred') {
      return null;
    }

    const businessId = callLog.businessId;
    const callerPhone = callLog.from;

    // Skip recovery if THIS caller already has an upcoming appointment.
    // The customerId filter belongs in the query: the previous version fetched
    // any one future appointment for the business and only compared afterwards,
    // so an unrelated customer's booking could suppress a real lead recovery.
    if (callLog.customerId) {
      const futureAppointment = await Appointment.findOne({
        businessId,
        customerId: callLog.customerId,
        status: { $in: ['scheduled', 'confirmed'] },
        startAt: { $gte: new Date() },
      });
      if (futureAppointment) return null;
    }

    // Check if an active recovery campaign is already underway for this number within the last 24h
    const existingActive = await LeadRecovery.findOne({
      businessId,
      callerPhone,
      status: { $in: ['pending', 'speed_to_lead_sent', 'drip_step_2_sent'] },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (existingActive) {
      // 3-Minute Rapid Call Deduplication:
      // If customer calls multiple times within 3 minutes, do not send duplicate SMS floods!
      const ageMs = Date.now() - existingActive.createdAt.getTime();
      if (ageMs < 3 * 60 * 1000) {
        console.log(`[Speed-to-Lead] Rapid repeat call from ${callerPhone} within 3m - merged into active campaign.`);
      }
      return existingActive;
    }

    // Find customer & business context
    let customer = null;
    if (callLog.customerId) {
      customer = await Customer.findById(callLog.customerId);
    } else {
      customer = await Customer.findOne({ businessId, phone: callerPhone });
    }

    const business = await Business.findById(businessId);
    const businessName = business?.name || 'our HVAC team';
    const customerName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : undefined;

    // Compose Step 1: Speed-to-Lead message
    const greeting = customer?.firstName ? `Hi ${customer.firstName}` : 'Hello';
    const step1Message = `${greeting}, sorry we missed your call at ${businessName}! Do you need urgent HVAC repair or a service visit? Reply with your address and preferred time, and our automated system will lock in an arrival window for you right away.`;

    // Smart 8:05 AM TCPA Safe Next Follow-up
    const rawStep2Time = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const safeStep2Time = LeadRecoveryService.calculateTcpaSafeFollowUp(rawStep2Time, business?.timezone || 'America/Chicago');

    const recovery = await LeadRecovery.create({
      businessId,
      callLogId: callLog._id,
      leadId: callLog.leadId || undefined,
      customerId: customer?._id || undefined,
      callerPhone,
      customerName,
      status: 'speed_to_lead_sent',
      currentStep: 1,
      speedToLeadSentAt: new Date(),
      nextFollowUpAt: safeStep2Time,
      messages: [
        {
          direction: 'outbound',
          text: step1Message,
          sentAt: new Date(),
        },
      ],
    });

    // Send SMS via Communication Service (with TCPA Quiet hours check)
    await CommunicationService.sendMessage(businessId, {
      to: callerPhone,
      body: step1Message,
      customerId: customer?._id?.toString(),
      type: 'missed_call_followup',
      bypassQuietHours: true,
    }).catch((err: any) => console.error('Error sending Speed-to-Lead SMS:', err));

    return recovery;
  }

  /**
   * Processes all due follow-up drips (Step 2 and Step 3) with next-day 8:05 AM quiet hours rollover
   */
  public static async processDueDrips(businessId?: Types.ObjectId | string): Promise<number> {
    const query: any = {
      status: { $in: ['speed_to_lead_sent', 'drip_step_2_sent'] },
      nextFollowUpAt: { $lte: new Date() },
    };

    if (businessId) {
      query.businessId = new Types.ObjectId(businessId.toString());
    }

    const dueRecoveries = await LeadRecovery.find(query).limit(50);
    let processedCount = 0;

    for (const recovery of dueRecoveries) {
      const business = await Business.findById(recovery.businessId);
      const businessName = business?.name || 'Apex Air';
      const name = recovery.customerName ? recovery.customerName.split(' ')[0] : 'there';
      const timezone = business?.timezone || 'America/Chicago';

      // TCPA Quiet Hours Guard: If current time is in quiet hours, roll forward to 8:05 AM tomorrow
      if (CommunicationService.isWithinQuietHours(timezone)) {
        recovery.nextFollowUpAt = LeadRecoveryService.calculateTcpaSafeFollowUp(new Date(), timezone);
        await recovery.save();
        continue;
      }

      if (recovery.currentStep === 1) {
        // Step 2 Drip: Urgency & slot hold (2 hours later)
        const step2Message = `Hi ${name}, our ${businessName} technicians have 2 priority arrival windows open for tomorrow morning. Reply YES to reserve your slot before they fill up!`;

        const rawStep3Time = new Date(Date.now() + 22 * 60 * 60 * 1000);
        const safeStep3Time = LeadRecoveryService.calculateTcpaSafeFollowUp(rawStep3Time, timezone);

        // Send BEFORE advancing the state machine.
        //
        // The previous order marked the recovery `drip_step_2_sent` and saved it,
        // then sent the SMS and swallowed any error — so a failed or unconfigured
        // send still left a record claiming the customer had been contacted, and
        // the step was never retried.
        const sent = await LeadRecoveryService.attemptDripSend(recovery, {
          body: step2Message,
          label: 'step_2',
        });
        if (!sent) continue;

        recovery.messages.push({
          direction: 'outbound',
          text: step2Message,
          sentAt: new Date(),
        });
        recovery.currentStep = 2;
        recovery.status = 'drip_step_2_sent';
        recovery.step2SentAt = new Date();
        recovery.nextFollowUpAt = safeStep3Time;
        recovery.dripAttempts = 0;
        recovery.lastDripError = undefined;
        await recovery.save();
        processedCount++;
      } else if (recovery.currentStep === 2) {
        // Step 3 Drip: Incentive offer (24 hours later)
        const step3Message = `Special offer from ${businessName}: Book your heating & AC diagnostic today and get $25 off repairs! Reply with your zip code to book.`;

        const sent = await LeadRecoveryService.attemptDripSend(recovery, {
          body: step3Message,
          label: 'step_3',
        });
        if (!sent) continue;

        recovery.messages.push({
          direction: 'outbound',
          text: step3Message,
          sentAt: new Date(),
        });
        recovery.currentStep = 3;
        recovery.status = 'drip_step_3_sent';
        recovery.step3SentAt = new Date();
        recovery.nextFollowUpAt = undefined;
        recovery.dripAttempts = 0;
        recovery.lastDripError = undefined;
        await recovery.save();
        processedCount++;
      }
    }

    return processedCount;
  }

  /**
   * Attempts one drip SMS.
   *
   * Returns true only when the message was actually handed to the carrier. On
   * failure the recovery is requeued with backoff, and after
   * MAX_DRIP_ATTEMPTS it is marked expired so a broken telephony configuration
   * cannot requeue the same step forever.
   */
  private static async attemptDripSend(
    recovery: ILeadRecovery,
    params: { body: string; label: string }
  ): Promise<boolean> {
    try {
      await CommunicationService.sendMessage(recovery.businessId, {
        to: recovery.callerPhone,
        body: params.body,
        customerId: recovery.customerId?.toString(),
        type: 'lead_followup',
        bypassQuietHours: false,
      });
      return true;
    } catch (err: any) {
      recovery.dripAttempts = (recovery.dripAttempts || 0) + 1;
      recovery.lastDripError = String(err?.message || 'SMS send failed').slice(0, 500);

      if (recovery.dripAttempts >= LeadRecoveryService.MAX_DRIP_ATTEMPTS) {
        recovery.status = 'expired';
        recovery.nextFollowUpAt = undefined;
        logger.error('lead_recovery_drip_abandoned', {
          recoveryId: recovery._id.toString(),
          step: params.label,
          attempts: recovery.dripAttempts,
          reason: recovery.lastDripError,
        });
      } else {
        // Retry with linear backoff rather than hammering a broken provider.
        recovery.nextFollowUpAt = new Date(Date.now() + recovery.dripAttempts * 30 * 60 * 1000);
        logger.warn('lead_recovery_drip_send_failed', {
          recoveryId: recovery._id.toString(),
          step: params.label,
          attempts: recovery.dripAttempts,
          reason: recovery.lastDripError,
        });
      }

      await recovery.save();
      return false;
    }
  }

  /**
   * Handles customer replies to SMS and automatically negotiates & books appointment
   */
  public static async handleInboundCustomerReply(
    businessId: Types.ObjectId | string,
    from: string,
    messageText: string
  ): Promise<{ handled: boolean; replyMessage?: string; bookedAppointment?: any }> {
    // Scoped by businessId: the same consumer phone number can legitimately be
    // in recovery for two different contractors, and an unscoped lookup
    // attributed the reply (and the resulting booking) to whichever campaign
    // happened to be newest across the whole database.
    const activeRecovery = await LeadRecovery.findOne({
      businessId: new Types.ObjectId(businessId.toString()),
      callerPhone: from,
      status: { $in: ['speed_to_lead_sent', 'drip_step_2_sent', 'drip_step_3_sent'] },
    }).sort({ createdAt: -1 });

    if (!activeRecovery) {
      return { handled: false };
    }

    activeRecovery.messages.push({
      direction: 'inbound',
      text: messageText,
      sentAt: new Date(),
    });

    const lower = messageText.toLowerCase().trim();

    // Check Opt-out
    if (['stop', 'unsubscribe', 'cancel', 'quit'].includes(lower)) {
      activeRecovery.status = 'opted_out';
      await activeRecovery.save();
      return { handled: true };
    }

    const recoveryBusinessId = activeRecovery.businessId;
    const business = await Business.findById(recoveryBusinessId);
    const businessName = business?.name || 'Apex Air';

    // Find or create customer
    let customer = null;
    if (activeRecovery.customerId) {
      customer = await Customer.findById(activeRecovery.customerId);
    } else {
      customer = await Customer.findOne({ businessId: recoveryBusinessId, phone: from });
    }

    // Check if customer wants to book (keywords: yes, tomorrow, morning, afternoon, book, schedule, monday, friday, etc.)
    const wantsBooking = /(?:yes|sure|book|schedule|morning|afternoon|tomorrow|today|need someone|slot|available|pm|am)/i.test(lower);

    /**
     * Never book a second appointment for a customer who already has one coming.
     *
     * The intent regex above matches bare "yes", which is the single most likely
     * reply to ANY message the business sends — including an appointment
     * reminder. A customer confirming an existing appointment was therefore given
     * a brand-new one for the next morning, plus a confirmation text for it.
     *
     * Keyword lists cannot separate "yes, book me" from "yes, I'll be there", so
     * the guard is the invariant rather than the vocabulary. `triggerRecoveryForCall`
     * already applies this same check before starting a campaign; this makes the
     * reply path consistent with it.
     */
    if (wantsBooking && customer) {
      const upcoming = await Appointment.findOne({
        businessId: recoveryBusinessId,
        customerId: customer._id,
        status: { $in: ['scheduled', 'confirmed', 'rescheduled'] },
        startAt: { $gte: new Date() },
      }).sort({ startAt: 1 });

      if (upcoming) {
        activeRecovery.status = 'recovered_responded';
        await activeRecovery.save();

        logger.info('lead_recovery_reply_existing_appointment', {
          recoveryId: activeRecovery._id.toString(),
          appointmentId: upcoming._id.toString(),
        });

        const when = new Date(upcoming.startAt).toLocaleString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });

        return {
          handled: true,
          replyMessage: `Thanks! You are already booked with ${businessName} for ${when}. Reply CANCEL if you need to change it, or call us and we will sort it out.`,
        };
      }
    }

    if (wantsBooking) {
      /**
       * `status`, not `active`.
       *
       * Service has no `active` field — it carries `status: 'active' | 'inactive'`.
       * Mongoose passes an unknown filter key straight through to MongoDB, so this
       * query matched nothing on every call and the branch below created a fresh
       * "HVAC Diagnostic & Service Inspection" record every single time an SMS
       * recovery booked. The service list grew by one per booking.
       */
      let service = await Service.findOne({ businessId, status: 'active' });
      if (!service) {
        service = await Service.create({
          businessId,
          name: 'HVAC Diagnostic & Service Inspection',
          startingPrice: 89,
          durationMinutes: 60,
          category: 'Cooling',
          status: 'active',
        });
      }

      // Propose or book for tomorrow
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);
      const isAfternoon = /(?:afternoon|2pm|1pm|3pm|4pm)/i.test(lower);
      targetDate.setHours(isAfternoon ? 14 : 10, 0, 0, 0);

      // Create customer if not exists
      if (!customer) {
        customer = await Customer.create({
          businessId,
          firstName: activeRecovery.customerName || 'Homeowner',
          lastName: 'Customer',
          phone: from,
          tags: ['SMS_Recovered'],
        });
        activeRecovery.customerId = customer._id;
      }

      // Booked through AppointmentService so the slot conflict check and the
      // per-business booking lock apply.
      //
      // This previously called `Appointment.create` directly, skipping the
      // conflict check entirely — an SMS reply could drop a job on top of an
      // existing one, and the customer was told they were confirmed.
      const addressLine = customer.address?.street
        ? `${customer.address.street}, ${customer.address.city || ''} ${customer.address.state || ''}`.trim()
        : undefined;

      let appointment;
      try {
        appointment = await AppointmentService.createAppointment(
          businessId,
          {
            customerId: customer._id.toString(),
            leadId: activeRecovery.leadId?.toString(),
            serviceId: service._id.toString(),
            startAt: targetDate.toISOString(),
            address: addressLine,
            source: 'ai_call',
            customerNotes: `Booked via Autonomous Speed-to-Lead SMS Recovery. Customer text: "${messageText}"`,
          },
          'sms_recovery'
        );
      } catch (err: any) {
        // The slot went while the reply was in flight. Say so instead of
        // confirming a booking that does not exist.
        logger.warn('lead_recovery_booking_conflict', {
          recoveryId: activeRecovery._id.toString(),
          reason: err?.message,
        });

        const fallbackMsg = `Thanks for getting back to us! That time was just taken. Reply with another day or time that suits you and we'll lock it in.`;
        activeRecovery.messages.push({
          direction: 'outbound',
          text: fallbackMsg,
          sentAt: new Date(),
        });
        await activeRecovery.save();

        await CommunicationService.sendMessage(businessId, {
          to: from,
          body: fallbackMsg,
          customerId: customer._id.toString(),
          type: 'lead_followup',
          bypassQuietHours: true,
        }).catch((e: any) =>
          logger.error('lead_recovery_conflict_reply_failed', { reason: e?.message })
        );

        return { handled: true, replyMessage: fallbackMsg };
      }

      activeRecovery.status = 'recovered_booked';
      activeRecovery.recoveredAppointmentId = appointment._id;
      await activeRecovery.save();

      const timeFormatted = targetDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const dateFormatted = targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const confirmationMsg = `🎉 You're booked! Our ${businessName} technician is scheduled for ${dateFormatted} at ${timeFormatted}. We will send you an arrival update when on the way. Reply anytime with questions!`;

      activeRecovery.messages.push({
        direction: 'outbound',
        text: confirmationMsg,
        sentAt: new Date(),
      });
      await activeRecovery.save();

      await CommunicationService.sendMessage(businessId, {
        to: from,
        body: confirmationMsg,
        customerId: customer._id.toString(),
        type: 'appointment_confirmation',
        bypassQuietHours: true,
      }).catch((e: any) => console.error('Error sending booking confirmation SMS:', e));

      return {
        handled: true,
        replyMessage: confirmationMsg,
        bookedAppointment: appointment,
      };
    }

    // Otherwise, answer inquiry from Knowledge Base
    const kbResults = await KnowledgeBaseService.searchKnowledgeBase(businessId, messageText);
    let replyMsg = '';

    if (kbResults && kbResults.length > 0) {
      replyMsg = `${kbResults[0].content.slice(0, 160)} Would you like us to schedule a technician visit for tomorrow?`;
    } else {
      replyMsg = `Thanks for your reply! Our ${businessName} dispatch team can assist you immediately. Would you like to schedule an HVAC visit for tomorrow morning or afternoon?`;
    }

    activeRecovery.status = 'recovered_responded';
    activeRecovery.messages.push({
      direction: 'outbound',
      text: replyMsg,
      sentAt: new Date(),
    });
    await activeRecovery.save();

    await CommunicationService.sendMessage(businessId, {
      to: from,
      body: replyMsg,
      customerId: customer?._id?.toString(),
      type: 'custom',
      bypassQuietHours: true,
    }).catch((e: any) => console.error('Error sending recovery reply SMS:', e));

    return {
      handled: true,
      replyMessage: replyMsg,
    };
  }

  /**
   * Get metrics and list of recovery campaigns
   */
  public static async getRecoveryStats(businessId: Types.ObjectId | string): Promise<{
    totalInitiated: number;
    totalRecovered: number;
    recoveryRate: number;
    estimatedRevenueSaved: number;
    campaigns: ILeadRecovery[];
  }> {
    const bId = new Types.ObjectId(businessId.toString());

    const totalInitiated = await LeadRecovery.countDocuments({ businessId: bId });
    const totalRecovered = await LeadRecovery.countDocuments({
      businessId: bId,
      status: 'recovered_booked',
    });

    const recoveryRate = totalInitiated > 0 ? Math.round((totalRecovered / totalInitiated) * 100) : 0;
    const estimatedRevenueSaved = totalRecovered * 1250; // Average HVAC job value $1,250

    const campaigns = await LeadRecovery.find({ businessId: bId })
      .populate('customerId', 'firstName lastName phone')
      .populate('callLogId', 'from outcome durationSeconds createdAt')
      .populate('recoveredAppointmentId', 'startAt title status')
      .sort({ createdAt: -1 })
      .limit(20);

    return {
      totalInitiated,
      totalRecovered,
      recoveryRate,
      estimatedRevenueSaved,
      campaigns,
    };
  }
}
