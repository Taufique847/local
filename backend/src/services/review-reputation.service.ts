import { Types } from 'mongoose';
import { ReviewCampaign, IReviewCampaign } from '../models/review-campaign.model';
import { Appointment } from '../models/appointment.model';
import { Customer } from '../models/customer.model';
import { Business } from '../models/business.model';
import { CommunicationService } from './communication.service';
import { AppError } from '../types';

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

export class ReviewReputationService {
  /**
   * Triggers a post-service CSAT SMS survey for a completed appointment
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
    fromPhone: string,
    messageText: string
  ): Promise<{ handled: boolean; campaign?: IReviewCampaign; responseText?: string }> {
    const cleanPhone = fromPhone.replace(/\D/g, '').slice(-10);

    // Find latest pending survey for this phone number
    const campaign = await ReviewCampaign.findOne({
      customerPhone: { $regex: cleanPhone },
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
      // 🌟 POSITIVE REVIEW FUNNEL (4-5 Stars)
      const googleReviewUrl =
        (business as any)?.googleReviewUrl ||
        `https://search.google.com/local/writereview?placeid=${encodeURIComponent(businessName.replace(/\s+/g, '-'))}`;

      campaign.status = 'positive_redirected';
      campaign.googleReviewUrl = googleReviewUrl;
      campaign.isShielded = false;

      responseText = `Thank you so much for the ${rating}-star rating, ${customerName}! Could you take 30 seconds to share your experience on Google? It helps our small business immensely: ${googleReviewUrl} As a thank you, we've credited $10 to your next tune-up!`;
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
        CommunicationService.sendMessage(campaign.businessId, {
          to: business.phone,
          body: ownerAlert,
          type: 'custom',
          bypassQuietHours: true, // Urgent owner priority escalation
        }).catch((err) => console.warn('Owner reputation alert SMS notice:', err.message));
        campaign.ownerAlertSent = true;
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
   * Enterprise Enhancement: Scans open negative shielded campaigns and flags SLA breaches
   * if not resolved within 24 hours of negative review reception.
   */
  public static async checkSlaBreaches(
    businessId?: string | Types.ObjectId
  ): Promise<number> {
    const query: any = {
      isShielded: true,
      status: 'negative_shielded',
      slaBreached: { $ne: true },
      slaDeadlineAt: { $lt: new Date() },
    };
    if (businessId) {
      query.businessId = new Types.ObjectId(businessId.toString());
    }

    const breachedCampaigns = await ReviewCampaign.find(query);
    if (breachedCampaigns.length === 0) return 0;

    for (const campaign of breachedCampaigns) {
      campaign.slaBreached = true;
      campaign.escalationNotes = `${campaign.escalationNotes || ''}\n[SLA ALERT]: 24-hour owner resolution deadline breached. Escalation pending.`.trim();
      await campaign.save();
    }

    return breachedCampaigns.length;
  }
}
