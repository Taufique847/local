import { Types } from 'mongoose';
import { ConversationQA, IConversationQA } from '../models/conversation-qa.model';
import { CallLog } from '../models/call-log.model';
import { Customer } from '../models/customer.model';

export class ConversationIntelligenceService {
  /**
   * Evaluates a completed call transcript and logs quality metrics
   */
  public static async evaluateCall(
    callLogIdentifier: string | Types.ObjectId
  ): Promise<IConversationQA | null> {
    let callLog;
    if (Types.ObjectId.isValid(callLogIdentifier.toString()) && callLogIdentifier.toString().length === 24) {
      callLog = await CallLog.findById(callLogIdentifier);
    }
    if (!callLog) {
      callLog = await CallLog.findOne({ providerCallSid: callLogIdentifier.toString() });
    }

    if (!callLog) {
      return null;
    }

    const businessId = callLog.businessId;
    const transcript = (callLog as any).transcript || [];
    const toolExecutions = (callLog as any).toolExecutions || [];
    const outcome = callLog.outcome || 'inquiry_answered';
    const duration = callLog.durationSeconds || 0;

    // 1. Resolution Score
    let resolutionScore = 70;
    switch (outcome) {
      case 'appointment_booked':
        resolutionScore = 100;
        break;
      case 'lead_captured':
        resolutionScore = 85;
        break;
      case 'emergency_transferred':
        resolutionScore = 90;
        break;
      case 'inquiry_answered':
        resolutionScore = 75;
        break;
      case 'hangup_or_spam':
        resolutionScore = duration > 20 ? 40 : 25;
        break;
      case 'missed_call':
        resolutionScore = 15;
        break;
      default:
        resolutionScore = 65;
    }

    // 2. Text Analysis on full transcript
    const userUtterances = transcript
      .filter((t: any) => t.role === 'user')
      .map((t: any) => t.text || '');
    const fullCustomerText = userUtterances.join(' ').toLowerCase();

    // 3. Sentiment Analysis
    const positiveWords = ['thank', 'great', 'awesome', 'appreciate', 'perfect', 'helpful', 'good', 'excellent'];
    const negativeWords = ['angry', 'mad', 'ridiculous', 'terrible', 'worst', 'horrible', 'unacceptable', 'sucks', 'frustrated', 'lawyer', 'scam'];

    let posCount = 0;
    let negCount = 0;
    for (const w of positiveWords) {
      if (fullCustomerText.includes(w)) posCount++;
    }
    for (const w of negativeWords) {
      if (fullCustomerText.includes(w)) negCount++;
    }

    let sentimentScore = 0.0;
    if (posCount + negCount > 0) {
      sentimentScore = Math.max(-1.0, Math.min(1.0, (posCount - negCount) / (posCount + negCount)));
    }

    // 4. Missing Information Detection
    const missingInformation: string[] = [];
    let customer = null;
    if (callLog.customerId) {
      customer = await Customer.findById(callLog.customerId);
    }

    const hasAddress = customer?.address?.street || /(?:st|street|ave|avenue|rd|road|dr|drive|lane|way|ct|court)\b/i.test(fullCustomerText);
    if (!hasAddress && outcome !== 'hangup_or_spam' && outcome !== 'missed_call') {
      missingInformation.push('service_address');
    }

    const hasIssueDescription = /(?:leak|not cooling|warm air|heat|cold|freon|noise|broken|maintenance|tune|filter|furnace|blower|compressor|smell)/i.test(fullCustomerText);
    if (!hasIssueDescription && outcome !== 'hangup_or_spam') {
      missingInformation.push('hvac_issue_details');
    }

    // 5. Policy Compliance & Emergency Flagging
    let policyCompliance = true;
    let flaggedForReview = false;
    let flagReason: string | undefined = undefined;

    const hasHazardKeyword = /(?:gas leak|gas smell|carbon monoxide|smoke|spark|fire hazard|active flooding|explosion)/i.test(fullCustomerText);
    const transferred = toolExecutions.some((t: any) => t.toolName === 'transfer_call') || outcome === 'emergency_transferred';

    if (hasHazardKeyword && !transferred) {
      policyCompliance = false;
      flaggedForReview = true;
      flagReason = 'CRITICAL: Hazardous condition mentioned by caller without emergency transfer invocation';
    } else if (negCount >= 2 || sentimentScore < -0.5) {
      flaggedForReview = true;
      flagReason = 'Negative customer sentiment detected during call';
    } else if (resolutionScore <= 40 && duration > 25) {
      flaggedForReview = true;
      flagReason = 'Unresolved prolonged customer conversation (possible confusion)';
    }

    // 6. AI Summary & Coaching Notes
    const coachingNotes: string[] = [];
    let aiSummary = '';

    if (outcome === 'appointment_booked') {
      aiSummary = 'Caller successfully scheduled an HVAC service appointment. AI confirmed availability and secured booking.';
      coachingNotes.push('Excellent conversion to scheduled appointment.');
    } else if (outcome === 'emergency_transferred') {
      aiSummary = 'Urgent HVAC or safety condition identified. AI safely initiated immediate transfer to on-call technician.';
      coachingNotes.push('Fast emergency escalation protocol maintained.');
    } else if (outcome === 'lead_captured') {
      aiSummary = 'Customer contact info and HVAC inquiry captured as high-priority lead for technician follow-up.';
      coachingNotes.push('Follow up with customer within 15 minutes to secure booking.');
    } else if (outcome === 'inquiry_answered') {
      aiSummary = 'Customer questions regarding HVAC services, hours, or diagnostic policies answered.';
      if (missingInformation.includes('service_address')) {
        coachingNotes.push('Prompt agent to request service zip code earlier in the call.');
      }
    } else {
      aiSummary = `Call concluded with status "${outcome}". Duration: ${duration}s.`;
    }

    if (missingInformation.length > 0) {
      coachingNotes.push(`Information missing from interaction: ${missingInformation.join(', ')}`);
    }

    // 7. Upsert ConversationQA
    const qa = await ConversationQA.findOneAndUpdate(
      { callLogId: callLog._id },
      {
        $set: {
          businessId,
          customerId: callLog.customerId || undefined,
          resolutionScore,
          clarityScore: 92,
          sentimentScore: Number(sentimentScore.toFixed(2)),
          policyCompliance,
          missingInformation,
          flaggedForReview,
          flagReason,
          aiSummary,
          coachingNotes,
          evaluatedAt: new Date(),
        },
      },
      { new: true, upsert: true, runValidators: true }
    );

    // Also update CallLog with summary and sentiment
    try {
      const sentimentLabel = sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'frustrated' : 'neutral';
      await CallLog.findByIdAndUpdate(callLog._id, {
        $set: {
          summary: aiSummary,
          sentiment: sentimentLabel,
        },
      });
    } catch (err) {
      console.error('Error updating CallLog summary/sentiment:', err);
    }

    return qa;
  }

  /**
   * Returns aggregated QA metrics for a business
   */
  public static async getQASummary(businessId: Types.ObjectId | string): Promise<{
    totalEvaluated: number;
    averageResolutionScore: number;
    complianceRate: number;
    flaggedCount: number;
    recentFlagged: IConversationQA[];
  }> {
    const bId = new Types.ObjectId(businessId.toString());

    const totalEvaluated = await ConversationQA.countDocuments({ businessId: bId });
    if (totalEvaluated === 0) {
      return {
        totalEvaluated: 0,
        averageResolutionScore: 0,
        complianceRate: 100,
        flaggedCount: 0,
        recentFlagged: [],
      };
    }

    const scores = await ConversationQA.aggregate([
      { $match: { businessId: bId } },
      {
        $group: {
          _id: null,
          avgResolution: { $avg: '$resolutionScore' },
          compliantCount: {
            $sum: { $cond: [{ $eq: ['$policyCompliance', true] }, 1, 0] },
          },
          flaggedCount: {
            $sum: { $cond: [{ $eq: ['$flaggedForReview', true] }, 1, 0] },
          },
        },
      },
    ]);

    const stat = scores[0] || { avgResolution: 0, compliantCount: 0, flaggedCount: 0 };
    const recentFlagged = await ConversationQA.find({ businessId: bId, flaggedForReview: true })
      .populate('callLogId', 'from to outcome durationSeconds createdAt')
      .populate('customerId', 'firstName lastName phone')
      .sort({ createdAt: -1 })
      .limit(5);

    return {
      totalEvaluated,
      averageResolutionScore: Math.round(stat.avgResolution || 0),
      complianceRate: Math.round(((stat.compliantCount || 0) / totalEvaluated) * 100),
      flaggedCount: stat.flaggedCount || 0,
      recentFlagged,
    };
  }

  /**
   * Fetches single QA report by CallLog ID
   */
  public static async getQAByCallLogId(
    businessId: Types.ObjectId | string,
    callLogId: Types.ObjectId | string
  ): Promise<IConversationQA | null> {
    return ConversationQA.findOne({
      businessId: new Types.ObjectId(businessId.toString()),
      callLogId: new Types.ObjectId(callLogId.toString()),
    }).populate('customerId', 'firstName lastName phone');
  }

  /**
   * Lists QA reviews with filtering and pagination
   */
  public static async listQAReviews(
    businessId: Types.ObjectId | string,
    options: { flaggedOnly?: boolean; page?: number; limit?: number } = {}
  ): Promise<{ items: IConversationQA[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const query: any = { businessId: new Types.ObjectId(businessId.toString()) };
    if (options.flaggedOnly) {
      query.flaggedForReview = true;
    }

    const [items, total] = await Promise.all([
      ConversationQA.find(query)
        .populate('callLogId', 'from to outcome durationSeconds createdAt notes')
        .populate('customerId', 'firstName lastName phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ConversationQA.countDocuments(query),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
