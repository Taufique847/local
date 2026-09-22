import { Types } from 'mongoose';
import { ReviewCampaign, IReviewCampaign } from '../models/review-campaign.model';
import { Appointment } from '../models/appointment.model';
import { Customer } from '../models/customer.model';
import { Business } from '../models/business.model';
import { CommunicationService } from './communication.service';
import { AppError } from '../types';
import { logger } from '../utils/logger';

export interface ReputationStats {
  totalSurveysSent: number;
  totalResponses: number;
  responseRate: number; // percentage
  averageRating: number;
  positiveRedirectedCount: number;
  negativeShieldedCount: number;
  ratingBreakdown: {
    fiveStar: number;
    fourStar: number;
    threeStar: number;
    twoStar: number;
    oneStar: number;
  };
  resolvedCount: number;
}

/** Delay between job completion and the CSAT text going out. */
const SURVEY_DELAY_MINUTES = 120;

/** Give up after this many failed send attempts. */
const MAX_SURVEY_ATTEMPTS = 3;

export class ReviewReputationService {
  /**
   * Queues a post-service CSAT survey to be sent after a delay.
   *
   * Called when an appointment is marked complete. The actual send happens in
   * processDueSurveys, driven by the scheduler — previously the survey fired
   * synchronously the instant the technician tapped "complete", and with
   * quiet-hours bypassed, so a customer could be texted a marketing survey at
   * 11pm. That is exactly what TCPA quiet hours exist to prevent.
   */
  public static async schedulePostServiceSurvey(
    appointmentId: string | Types.ObjectId,
    delayMinutes: number = SURVEY_DELAY_MINUTES
  ): Promise<IReviewCampaign | null> {
    const appointment = await Appointment.findById(appointmentId).populate('customerId');
    if (!appointment) return null;

    const customer = appointment.customerId as any;
    if (!customer?.phone) return null;

    const existing = await ReviewCampaign.findOne({ appointmentId: appointment._id });
    // Never re-survey a job that already has a campaign in flight or answered.
    if (existing) return existing;

    return ReviewCampaign.create({
      businessId: appointment.businessId,
      appointmentId: appointment._id,
      customerId: customer._id,
      customerPhone: customer.phone,
      customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || undefined,
      technicianName: appointment.technicianName,
      status: 'pending',
      scheduledAt: new Date(Date.now() + delayMinutes * 60 * 1000),
      surveyAttempts: 0,
      isShielded: false,
      escalatedToOwner: false,
    });
  }

  /**
   * Sends every survey whose scheduled time has arrived.
   *
   * Invoked by the scheduler. Respects TCPA quiet hours by deferring rather
   * than bypassing them.
   */
  public static async processDueSurveys(limit = 50): Promise<{ sent: number; deferred: number; failed: number }> {
    const due = await ReviewCampaign.find({
      status: 'pending',
      scheduledAt: { $lte: new Date() },
      surveyAttempts: { $lt: MAX_SURVEY_ATTEMPTS },
    }).limit(limit);

    let sent = 0;
    let deferred = 0;
    let failed = 0;

    for (const campaign of due) {
      const business = await Business.findById(campaign.businessId);
      const timezone = business?.timezone || 'America/New_York';

      // Outside 8am-9pm local: push to shortly after the window opens.
      if (CommunicationService.isWithinQuietHours(timezone)) {
        const next = new Date();
        next.setHours(8, 10, 0, 0);
        if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
        campaign.scheduledAt = next;
        await campaign.save();
        deferred++;
        continue;
      }

      const customerName = campaign.customerName?.split(' ')[0] || 'there';
      const businessName = business?.name || 'our team';
      const techName = campaign.technicianName || 'our technician';

      const surveyBody = `Hi ${customerName}, thanks for choosing ${businessName}! How would you rate your service with ${techName} today, from 1 to 5? (Reply 5 for excellent, 1 for poor)`;

      campaign.surveyAttempts += 1;

      try {
        await CommunicationService.sendMessage(campaign.businessId, {
          to: campaign.customerPhone,
          body: surveyBody,
          customerId: campaign.customerId.toString(),
          type: 'custom',
          bypassQuietHours: false,
        });

        campaign.status = 'survey_sent';
        campaign.surveySentAt = new Date();
        campaign.scheduledAt = undefined;
        await campaign.save();
        sent++;
      } catch (err: any) {
        await campaign.save();
        failed++;
        logger.warn('review_survey_send_failed', {
          campaignId: campaign._id.toString(),
          attempt: campaign.surveyAttempts,
          reason: err?.message,
        });
      }
    }

    if (sent || deferred || failed) {
      logger.info('review_surveys_processed', { sent, deferred, failed });
    }

    return { sent, deferred, failed };
  }

  /**
   * Flags negative-feedback escalations that blew their resolution deadline and
   * alerts the owner.
   *
   * `slaDeadlineAt` was previously written on every shielded review and then
   * never read by anything, so the "24h resolution SLA" was decorative.
   */
  public static async processSlaBreaches(
    limit = 100,
    businessId?: string | Types.ObjectId
  ): Promise<number> {
    const query: any = {
      status: 'negative_shielded',
      slaBreached: { $ne: true },
      slaDeadlineAt: { $lt: new Date() },
    };
    // The scheduler sweeps every tenant; the per-business endpoint scopes to one.
    if (businessId) query.businessId = new Types.ObjectId(businessId.toString());

    const breached = await ReviewCampaign.find(query).limit(limit);

    let count = 0;

    for (const campaign of breached) {
      campaign.slaBreached = true;
      campaign.escalationNotes = `${campaign.escalationNotes || ''}\n[SLA breach]: owner resolution deadline passed.`.trim();

      const business = await Business.findById(campaign.businessId);
      const ownerPhone = business?.phone;

      if (ownerPhone && !campaign.ownerAlertSent) {
        const hoursOverdue = campaign.slaDeadlineAt
          ? Math.floor((Date.now() - campaign.slaDeadlineAt.getTime()) / 3_600_000)
          : 0;

        try {
          await CommunicationService.sendMessage(campaign.businessId, {
            to: ownerPhone,
            body: `SLA breach: ${campaign.customerName || campaign.customerPhone} left a ${campaign.rating ?? 'low'}-star review ${hoursOverdue}h past your resolution deadline and has not been contacted. Open your dashboard to resolve it.`,
            type: 'custom',
            // Operational alert to the business owner about their own account,
            // not marketing to a consumer, so quiet hours do not apply.
            bypassQuietHours: true,
          });
          campaign.ownerAlertSent = true;
        } catch (err: any) {
          logger.warn('sla_owner_alert_failed', {
            campaignId: campaign._id.toString(),
            reason: err?.message,
          });
        }
      }

      await campaign.save();
      count++;
    }

    if (count > 0) logger.warn('review_sla_breaches_flagged', { count });
    return count;
  }

  /**
   * Sends a post-service CSAT survey immediately.
   *
   * Retained for the manual "send now" action in the dashboard. Automated
   * completion flows use schedulePostServiceSurvey instead.
   */
  public static async triggerPostServiceSurvey(
    appointmentId: string | Types.ObjectId,
    options: { bypassQuietHours?: boolean } = {}
  ): Promise<IReviewCampaign> {
    const appointment = await Appointment.findById(appointmentId)
      .populate('customerId')
      .populate('serviceId');

    if (!appointment) {
      throw new AppError('Appointment not found', 404);
    }

    const businessId = appointment.businessId;
    const business = await Business.findById(businessId);
    if (!business) {
      throw new AppError('Business not found', 404);
    }

    const customer = appointment.customerId as any;
    if (!customer || !customer.phone) {
      throw new AppError('Customer phone number not available for survey', 400);
    }

    // Check if survey already triggered
    let campaign = await ReviewCampaign.findOne({ appointmentId: appointment._id });
    if (campaign && campaign.status !== 'survey_sent') {
      return campaign;
    }

    const customerName = customer.firstName || 'valued customer';
    const businessName = business.name || 'our HVAC team';
    const techName = appointment.technicianName || 'our technician';

    // Compose CSAT Survey SMS
    const surveyBody = `Hi ${customerName}, thank you for choosing ${businessName}! How would you rate your service with ${techName} today from 1 to 5 stars? (Reply 1 for poor, 5 for excellent)`;

    try {
      await CommunicationService.sendMessage(businessId, {
        to: customer.phone,
        body: surveyBody,
        customerId: customer._id.toString(),
        type: 'custom',
        bypassQuietHours: options.bypassQuietHours ?? false,
      });
    } catch (err: any) {
      console.warn('Review CSAT SMS delivery notice:', err.message);
    }

    if (!campaign) {
      campaign = await ReviewCampaign.create({
        businessId,
        appointmentId: appointment._id,
        customerId: customer._id,
        customerPhone: customer.phone,
        customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || undefined,
        technicianName: appointment.technicianName,
        status: 'survey_sent',
        surveySentAt: new Date(),
        isShielded: false,
        escalatedToOwner: false,
      });
    } else {
      campaign.surveySentAt = new Date();
      await campaign.save();
    }

    return campaign;
  }

  /**
   * Evaluates inbound SMS replies from customers answering the CSAT prompt
   */
  public static async handleCustomerRatingReply(
    businessId: Types.ObjectId | string,
    fromPhone: string,
    messageText: string
  ): Promise<{ handled: boolean; campaign?: IReviewCampaign; responseText?: string }> {
    const cleanPhone = fromPhone.replace(/\D/g, '').slice(-10);

    // Scoped by businessId so a rating reply can never be applied to another
    // contractor's campaign for the same consumer phone number. The digits are
    // also anchored to the end of the stored value rather than matched anywhere
    // inside it.
    const campaign = await ReviewCampaign.findOne({
      businessId: new Types.ObjectId(businessId.toString()),
      customerPhone: { $regex: new RegExp(`${cleanPhone}$`) },
      status: 'survey_sent',
    }).sort({ createdAt: -1 });

    if (!campaign) {
      return { handled: false };
    }

    // Parse numeric rating from 1 to 5
    let rating: number | null = null;
    const textLower = messageText.trim().toLowerCase();

    // Check direct numbers
    const matchDigit = textLower.match(/\b([1-5])\b/);
    if (matchDigit) {
      rating = parseInt(matchDigit[1], 10);
    } else if (textLower.includes('5') || textLower.includes('five')) {
      rating = 5;
    } else if (textLower.includes('4') || textLower.includes('four')) {
      rating = 4;
    } else if (textLower.includes('3') || textLower.includes('three')) {
      rating = 3;
    } else if (textLower.includes('2') || textLower.includes('two')) {
      rating = 2;
    } else if (textLower.includes('1') || textLower.includes('one')) {
      rating = 1;
    }

    if (!rating) {
      return { handled: false };
    }

    const business = await Business.findById(campaign.businessId);
    const customerName = campaign.customerName ? campaign.customerName.split(' ')[0] : 'there';
    const businessName = business?.name || 'our team';

    campaign.rating = rating;
    campaign.feedbackText = messageText;
    campaign.respondedAt = new Date();

    let responseText = '';

    if (rating >= 4) {
      // POSITIVE REVIEW FUNNEL (4-5 stars)
      //
      // Only a real configured URL is sent. The previous fallback built
      // `?placeid=<business-name-slug>`, which is not a Google Place ID, so
      // every happy customer received a broken link. If no URL is configured we
      // simply thank them rather than sending a link that fails.
      const googleReviewUrl = business?.googleReviewUrl?.trim();

      campaign.status = 'positive_redirected';
      campaign.isShielded = false;

      if (googleReviewUrl) {
        campaign.googleReviewUrl = googleReviewUrl;
        responseText = `Thank you so much for the ${rating}-star rating, ${customerName}! Would you mind taking 30 seconds to share that on Google? It genuinely helps our small business: ${googleReviewUrl}`;
      } else {
        responseText = `Thank you so much for the ${rating}-star rating, ${customerName}! We really appreciate you taking the time to let us know.`;
      }
    } else {
      // 🛡️ REPUTATION SHIELDING (1-3 Stars)
      // Block Google review link! Keep feedback strictly internal and dispatch immediate owner alert.
      campaign.status = 'negative_shielded';
      campaign.isShielded = true;
      campaign.escalatedToOwner = true;
      campaign.slaDeadlineAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h resolution SLA
      campaign.escalationNotes = `🚨 Negative feedback alert (${rating}/5 stars): "${messageText}". Public Google link shielded. 24h resolution SLA active.`;

      // Real-Time Owner Push SMS Dispatch:
      if (business?.phone) {
        const ownerAlert = `🚨 REPUTATION SHIELD ALERT: Customer ${customerName} (${campaign.customerPhone}) gave ${rating}⭐ for ${campaign.technicianName || 'tech'} ('${messageText}'). Google review BLOCKED! 24h resolution SLA active. Tap to call customer: tel:${campaign.customerPhone}`;
        // Awaited, and the flag is only set on success. Previously the send was
        // fire-and-forget while `ownerAlertSent` was set unconditionally, so the
        // dashboard claimed the owner had been alerted even when no SMS left.
        try {
          await CommunicationService.sendMessage(campaign.businessId, {
            to: business.phone,
            body: ownerAlert,
            type: 'custom',
            bypassQuietHours: true, // Urgent owner priority escalation
          });
          campaign.ownerAlertSent = true;
        } catch (err: any) {
          campaign.ownerAlertSent = false;
          logger.error('reputation_owner_alert_failed', {
            businessId: String(campaign.businessId),
            campaignId: campaign._id.toString(),
            reason: err?.message,
          });
        }
      }

      responseText = `We are truly sorry your service did not meet expectations, ${customerName}. We take customer satisfaction very seriously. Our management team has been alerted immediately and will personally follow up to resolve this for you.`;
    }

    await campaign.save();

    // Send customer the tailored response SMS
    try {
      await CommunicationService.sendMessage(campaign.businessId, {
        to: campaign.customerPhone,
        body: responseText,
        customerId: campaign.customerId.toString(),
        type: 'custom',
        bypassQuietHours: true, // Direct conversation response
      });
    } catch (err: any) {
      console.warn('Failed to send review funnel response SMS:', err.message);
    }

    return {
      handled: true,
      campaign,
      responseText,
    };
  }

  /**
   * Aggregates reputation and review shielding analytics
   */
  public static async getReputationStats(
    businessId: string | Types.ObjectId
  ): Promise<ReputationStats> {
    const bId = new Types.ObjectId(businessId.toString());

    const totalSurveysSent = await ReviewCampaign.countDocuments({ businessId: bId });
    if (totalSurveysSent === 0) {
      return {
        totalSurveysSent: 0,
        totalResponses: 0,
        responseRate: 0,
        averageRating: 5.0,
        positiveRedirectedCount: 0,
        negativeShieldedCount: 0,
        ratingBreakdown: {
          fiveStar: 0,
          fourStar: 0,
          threeStar: 0,
          twoStar: 0,
          oneStar: 0,
        },
        resolvedCount: 0,
      };
    }

    const campaigns = await ReviewCampaign.find({ businessId: bId });

    let totalResponses = 0;
    let ratingSum = 0;
    let positiveRedirectedCount = 0;
    let negativeShieldedCount = 0;
    let resolvedCount = 0;

    const breakdown = {
      fiveStar: 0,
      fourStar: 0,
      threeStar: 0,
      twoStar: 0,
      oneStar: 0,
    };

    for (const c of campaigns) {
      if (c.rating) {
        totalResponses++;
        ratingSum += c.rating;
        if (c.rating === 5) breakdown.fiveStar++;
        else if (c.rating === 4) breakdown.fourStar++;
        else if (c.rating === 3) breakdown.threeStar++;
        else if (c.rating === 2) breakdown.twoStar++;
        else if (c.rating === 1) breakdown.oneStar++;
      }

      if (c.status === 'positive_redirected') positiveRedirectedCount++;
      if (c.isShielded) negativeShieldedCount++;
      if (c.status === 'resolved') resolvedCount++;
    }

    const averageRating = totalResponses > 0 ? Math.round((ratingSum / totalResponses) * 10) / 10 : 5.0;
    const responseRate = Math.round((totalResponses / totalSurveysSent) * 100);

    return {
      totalSurveysSent,
      totalResponses,
      responseRate,
      averageRating,
      positiveRedirectedCount,
      negativeShieldedCount,
      ratingBreakdown: breakdown,
      resolvedCount,
    };
  }

  /**
   * Lists review campaigns with filters and pagination
   */
  public static async listCampaigns(
    businessId: string | Types.ObjectId,
    options: {
      status?: string;
      isShielded?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ campaigns: IReviewCampaign[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const query: any = { businessId: new Types.ObjectId(businessId.toString()) };
    if (options.status) query.status = options.status;
    if (options.isShielded !== undefined) query.isShielded = options.isShielded;

    const [campaigns, total] = await Promise.all([
      ReviewCampaign.find(query)
        .populate('customerId', 'firstName lastName phone email')
        .populate('appointmentId', 'startAt endAt technicianName description')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ReviewCampaign.countDocuments(query),
    ]);

    return {
      campaigns,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Resolves an escalated shielded negative review
   */
  public static async resolveShieldedReview(
    businessId: string | Types.ObjectId,
    campaignId: string,
    resolutionNotes: string
  ): Promise<IReviewCampaign> {
    const campaign = await ReviewCampaign.findOne({
      _id: campaignId,
      businessId: new Types.ObjectId(businessId.toString()),
    });

    if (!campaign) {
      throw new AppError('Review campaign not found', 404);
    }

    campaign.status = 'resolved';
    campaign.escalatedToOwner = false;
    campaign.escalationNotes = `${campaign.escalationNotes || ''}\n[Resolved]: ${resolutionNotes}`.trim();
    await campaign.save();

    return campaign;
  }

  /**
   * Flags SLA breaches for a single business. Thin wrapper kept for the
   * `POST /api/reviews/check-sla` endpoint.
   *
   * The implementation lives in processSlaBreaches so there is one code path:
   * an earlier version of this class had two separate SLA sweeps that could
   * disagree about whether an alert had been sent.
   */
  public static async checkSlaBreaches(businessId?: string | Types.ObjectId): Promise<number> {
    return ReviewReputationService.processSlaBreaches(100, businessId);
  }
}
