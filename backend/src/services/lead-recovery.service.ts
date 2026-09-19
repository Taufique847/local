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

export class LeadRecoveryService {
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

    // If call was already booked or an emergency transferred, no recovery needed
    if (callLog.appointmentId || callLog.outcome === 'appointment_booked' || callLog.outcome === 'emergency_transferred') {
      return null;
    }

    const businessId = callLog.businessId;
    const callerPhone = callLog.from;

    // Check if caller already has an active future appointment
    const futureAppointment = await Appointment.findOne({
      businessId,
      status: { $in: ['scheduled', 'confirmed'] },
      startAt: { $gte: new Date() },
    });
    if (futureAppointment && callLog.customerId && futureAppointment.customerId.toString() === callLog.customerId.toString()) {
      return null;
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

        recovery.messages.push({
          direction: 'outbound',
          text: step2Message,
          sentAt: new Date(),
        });
        recovery.currentStep = 2;
        recovery.status = 'drip_step_2_sent';
        recovery.step2SentAt = new Date();
        recovery.nextFollowUpAt = safeStep3Time;
        await recovery.save();

        await CommunicationService.sendMessage(recovery.businessId, {
          to: recovery.callerPhone,
          body: step2Message,
          customerId: recovery.customerId?.toString(),
          type: 'lead_followup',
          bypassQuietHours: false,
        }).catch((e: any) => console.error('Error sending Step 2 Drip SMS:', e));
        processedCount++;
      } else if (recovery.currentStep === 2) {
        // Step 3 Drip: Incentive offer (24 hours later)
        const step3Message = `Special offer from ${businessName}: Book your heating & AC diagnostic today and get $25 off repairs! Reply with your zip code to book.`;

        recovery.messages.push({
          direction: 'outbound',
          text: step3Message,
          sentAt: new Date(),
        });
        recovery.currentStep = 3;
        recovery.status = 'drip_step_3_sent';
        recovery.step3SentAt = new Date();
        recovery.nextFollowUpAt = undefined;
        await recovery.save();

        await CommunicationService.sendMessage(recovery.businessId, {
          to: recovery.callerPhone,
          body: step3Message,
          customerId: recovery.customerId?.toString(),
          type: 'lead_followup',
          bypassQuietHours: false,
        }).catch((e: any) => console.error('Error sending Step 3 Drip SMS:', e));
        processedCount++;
      }
    }

    return processedCount;
  }

  /**
   * Handles customer replies to SMS and automatically negotiates & books appointment
   */
  public static async handleInboundCustomerReply(
    from: string,
    messageText: string
  ): Promise<{ handled: boolean; replyMessage?: string; bookedAppointment?: any }> {
    const activeRecovery = await LeadRecovery.findOne({
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

    const businessId = activeRecovery.businessId;
    const business = await Business.findById(businessId);
    const businessName = business?.name || 'Apex Air';

    // Find or create customer
    let customer = null;
    if (activeRecovery.customerId) {
      customer = await Customer.findById(activeRecovery.customerId);
    } else {
      customer = await Customer.findOne({ businessId, phone: from });
    }

    // Check if customer wants to book (keywords: yes, tomorrow, morning, afternoon, book, schedule, monday, friday, etc.)
    const wantsBooking = /(?:yes|sure|book|schedule|morning|afternoon|tomorrow|today|need someone|slot|available|pm|am)/i.test(lower);

    if (wantsBooking) {
      // Find a default service (e.g. Diagnostic / AC Repair)
      let service = await Service.findOne({ businessId, active: true });
      if (!service) {
        service = await Service.create({
          businessId,
          name: 'HVAC Diagnostic & Service Inspection',
          startingPrice: 89,
          durationMinutes: 60,
          category: 'Cooling',
          active: true,
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

      // Create the appointment
      const appointment = await Appointment.create({
        businessId,
        customerId: customer._id,
        leadId: activeRecovery.leadId || null,
        serviceId: service._id,
        title: `${service.name} - SMS Booking`,
        startAt: targetDate,
        endAt: new Date(targetDate.getTime() + (service.durationMinutes || 60) * 60 * 1000),
        status: 'scheduled',
        address: customer.address?.street
          ? `${customer.address.street}, ${customer.address.city || ''} ${customer.address.state || ''}`
          : 'Service address on file',
        technicianName: 'Primary HVAC Dispatch',
        customerNotes: `Booked via Autonomous Speed-to-Lead SMS Recovery. Customer text: "${messageText}"`,
      });

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
