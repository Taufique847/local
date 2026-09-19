import { Types } from 'mongoose';
import { CallLog } from '../models/call-log.model';

export interface CallAnalyticsSummary {
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  answeredCalls: number;
  missedCalls: number;
  answerRate: number; // percentage, e.g. 95.5
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  aiHandledCalls: number;
  aiHandledPercentage: number;
  conversions: {
    appointmentsBooked: number;
    leadsCaptured: number;
    emergencyTransferred: number;
    bookingRate: number; // percentage
    leadCaptureRate: number; // percentage
  };
  outcomeDistribution: Record<string, number>;
  sentimentDistribution: Record<string, number>;
  peakHours: Array<{ hour: number; count: number }>;
}

export class CallAnalyticsService {
  /**
   * Computes comprehensive conversation intelligence analytics for a business
   */
  public static async getAnalyticsSummary(
    businessId: Types.ObjectId | string,
    timeRangeDays: number = 30
  ): Promise<CallAnalyticsSummary> {
    const startDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);
    const bId = new Types.ObjectId(businessId.toString());

    const matchQuery = {
      businessId: bId,
      startedAt: { $gte: startDate },
    };

    const calls = await CallLog.find(matchQuery).lean();
    const totalCalls = calls.length;

    let inboundCalls = 0;
    let outboundCalls = 0;
    let answeredCalls = 0;
    let missedCalls = 0;
    let totalDurationSeconds = 0;
    let aiHandledCalls = 0;
    let appointmentsBooked = 0;
    let leadsCaptured = 0;
    let emergencyTransferred = 0;

    const outcomeDistribution: Record<string, number> = {
      appointment_booked: 0,
      lead_captured: 0,
      inquiry_answered: 0,
      emergency_transferred: 0,
      missed_call: 0,
      hangup_or_spam: 0,
      other: 0,
    };

    const sentimentDistribution: Record<string, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
      frustrated: 0,
    };

    const hourCounts: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourCounts[h] = 0;

    for (const call of calls) {
      if (call.direction === 'inbound') inboundCalls++;
      else outboundCalls++;

      if (['completed', 'in_progress'].includes(call.status)) {
        answeredCalls++;
      } else if (['no_answer', 'busy', 'failed', 'cancelled'].includes(call.status)) {
        missedCalls++;
      }

      totalDurationSeconds += call.durationSeconds || 0;
      if (call.aiHandled) aiHandledCalls++;

      // Outcomes & conversions
      if (call.outcome === 'appointment_booked' || call.appointmentId) {
        appointmentsBooked++;
        outcomeDistribution.appointment_booked++;
      } else if (call.outcome === 'lead_captured' || call.leadId) {
        leadsCaptured++;
        outcomeDistribution.lead_captured++;
      } else if (call.outcome === 'emergency_transferred') {
        emergencyTransferred++;
        outcomeDistribution.emergency_transferred++;
      } else if (call.outcome && outcomeDistribution[call.outcome] !== undefined) {
        outcomeDistribution[call.outcome]++;
      } else if (['no_answer', 'busy', 'failed'].includes(call.status)) {
        outcomeDistribution.missed_call++;
      } else {
        outcomeDistribution.other++;
      }

      // Sentiment
      const sent = (call as any).sentiment || 'neutral';
      if (sentimentDistribution[sent] !== undefined) {
        sentimentDistribution[sent]++;
      }

      // Hourly pattern
      const hour = new Date(call.startedAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 1000) / 10 : 0;
    const averageDurationSeconds =
      answeredCalls > 0 ? Math.round(totalDurationSeconds / answeredCalls) : 0;
    const aiHandledPercentage =
      totalCalls > 0 ? Math.round((aiHandledCalls / totalCalls) * 1000) / 10 : 0;

    const bookingRate =
      inboundCalls > 0 ? Math.round((appointmentsBooked / inboundCalls) * 1000) / 10 : 0;
    const leadCaptureRate =
      inboundCalls > 0 ? Math.round((leadsCaptured / inboundCalls) * 1000) / 10 : 0;

    const peakHours = Object.entries(hourCounts)
      .map(([h, count]) => ({ hour: Number(h), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalCalls,
      inboundCalls,
      outboundCalls,
      answeredCalls,
      missedCalls,
      answerRate,
      totalDurationSeconds,
      averageDurationSeconds,
      aiHandledCalls,
      aiHandledPercentage,
      conversions: {
        appointmentsBooked,
        leadsCaptured,
        emergencyTransferred,
        bookingRate,
        leadCaptureRate,
      },
      outcomeDistribution,
      sentimentDistribution,
      peakHours,
    };
  }

  /**
   * Retrieves turn-by-turn conversation transcript for a specific call
   */
  public static async getCallTranscript(
    businessId: Types.ObjectId | string,
    callId: string
  ): Promise<{
    callId: string;
    callSid: string;
    startedAt: Date;
    durationSeconds: number;
    outcome?: string;
    transcript: any[];
    toolExecutions: any[];
    customer?: any;
    lead?: any;
    appointment?: any;
  }> {
    const call = await CallLog.findOne({ _id: callId, businessId })
      .populate('customerId', 'firstName lastName phone email address')
      .populate('leadId', 'title status urgency serviceType')
      .populate('appointmentId', 'title startAt endAt status');

    if (!call) throw new Error('Call record not found');

    return {
      callId: call._id.toString(),
      callSid: call.providerCallSid,
      startedAt: call.startedAt,
      durationSeconds: call.durationSeconds || 0,
      outcome: call.outcome,
      transcript: call.transcript || [],
      toolExecutions: call.toolExecutions || [],
      customer: call.customerId,
      lead: call.leadId,
      appointment: call.appointmentId,
    };
  }
}
