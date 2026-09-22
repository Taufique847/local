import { Types } from 'mongoose';
import { CallLog } from '../models/call-log.model';
import { Appointment } from '../models/appointment.model';
import { Invoice } from '../models/invoice.model';
import { LeadRecovery } from '../models/lead-recovery.model';
import { Service } from '../models/service.model';
import { Business } from '../models/business.model';
import { BusinessPhoneNumber } from '../models/phone-number.model';
import { Customer } from '../models/customer.model';
import { KnowledgeItem } from '../models/knowledge-item.model';
import { ReviewCampaign } from '../models/review-campaign.model';
import { BillingService } from './billing.service';
import { TwilioService } from './twilio.service';
import { config } from '../config/env';

export interface CallVolumePoint {
  day: string;
  date: string;
  inbound: number;
  aiBooked: number;
  smsRecovered: number;
}

export interface ServiceDistributionPoint {
  name: string;
  value: number;
}

export interface RevenueRecoveryPoint {
  week: string;
  revenueCollected: number;
  revenueRecovered: number;
}

export interface ActivationStep {
  id: 'business_profile' | 'services' | 'phone_number' | 'knowledge_base' | 'test_call' | 'first_customer';
  label: string;
  description: string;
  done: boolean;
  href: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Real analytics for the operator dashboard.
 *
 * The dashboard charts were previously hardcoded arrays in the frontend
 * (`CALL_VOLUME_DATA_7D` etc.), so they showed identical fabricated numbers for
 * every account regardless of actual activity.
 */
export class DashboardService {
  /** Start-of-day boundaries for the last `days` days, oldest first. */
  private static dayBuckets(days: number): { start: Date; end: Date; label: string; date: string }[] {
    const buckets: { start: Date; end: Date; label: string; date: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      buckets.push({
        start,
        end,
        label: DAY_LABELS[start.getDay()],
        date: start.toISOString().slice(0, 10),
      });
    }
    return buckets;
  }

  public static async getCallVolumeSeries(
    businessId: Types.ObjectId | string,
    days = 7
  ): Promise<CallVolumePoint[]> {
    const buckets = this.dayBuckets(days);
    const rangeStart = buckets[0].start;
    const bId = new Types.ObjectId(businessId.toString());

    const [calls, recoveries] = await Promise.all([
      CallLog.find(
        {
          businessId: bId,
          direction: 'inbound',
          isTest: { $ne: true },
          startedAt: { $gte: rangeStart },
        },
        { startedAt: 1, outcome: 1 }
      ).lean(),
      LeadRecovery.find(
        { businessId: bId, createdAt: { $gte: rangeStart }, status: 'recovered_booked' },
        { createdAt: 1 }
      ).lean(),
    ]);

    return buckets.map((bucket) => {
      const inBucket = (d?: Date | null) =>
        !!d && d.getTime() >= bucket.start.getTime() && d.getTime() < bucket.end.getTime();

      const dayCalls = calls.filter((c: any) => inBucket(c.startedAt));

      return {
        day: bucket.label,
        date: bucket.date,
        inbound: dayCalls.length,
        aiBooked: dayCalls.filter((c: any) => c.outcome === 'appointment_booked').length,
        smsRecovered: recoveries.filter((r: any) => inBucket(r.createdAt)).length,
      };
    });
  }

  /**
   * Share of booked work by service, over the trailing 90 days.
   */
  public static async getServiceDistribution(
    businessId: Types.ObjectId | string
  ): Promise<ServiceDistributionPoint[]> {
    const bId = new Types.ObjectId(businessId.toString());
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const grouped = await Appointment.aggregate([
      { $match: { businessId: bId, startAt: { $gte: since } } },
      { $group: { _id: '$serviceId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]);

    if (grouped.length === 0) return [];

    const serviceIds = grouped.map((g) => g._id).filter(Boolean);
    const services = await Service.find({ _id: { $in: serviceIds } }, { name: 1 }).lean();
    const nameById = new Map(services.map((s: any) => [s._id.toString(), s.name]));

    return grouped.map((g) => ({
      name: g._id ? nameById.get(g._id.toString()) || 'Other service' : 'Unassigned',
      value: g.count,
    }));
  }

  /**
   * Weekly collected revenue alongside revenue attributable to AI recovery
   * (appointments that came from a missed-call SMS recovery campaign).
   */
  public static async getRevenueRecovery(
    businessId: Types.ObjectId | string,
    weeks = 4
  ): Promise<RevenueRecoveryPoint[]> {
    const bId = new Types.ObjectId(businessId.toString());
    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - weeks * 7);
    rangeStart.setHours(0, 0, 0, 0);

    const [invoices, recoveries] = await Promise.all([
      Invoice.find(
        { businessId: bId, paidAt: { $gte: rangeStart }, amountPaid: { $gt: 0 } },
        { paidAt: 1, amountPaid: 1 }
      ).lean(),
      LeadRecovery.find(
        { businessId: bId, status: 'recovered_booked', createdAt: { $gte: rangeStart } },
        { createdAt: 1, recoveredAppointmentId: 1 }
      ).lean(),
    ]);

    // Value recovered appointments from their linked invoice where one exists,
    // otherwise fall back to the average paid ticket so the series is not
    // silently zero for businesses that invoice later.
    const paidTotal = invoices.reduce((sum: number, i: any) => sum + (i.amountPaid || 0), 0);
    const avgTicket = invoices.length > 0 ? paidTotal / invoices.length : 0;

    const recoveredApptIds = recoveries
      .map((r: any) => r.recoveredAppointmentId)
      .filter(Boolean);
    const recoveredInvoices = recoveredApptIds.length
      ? await Invoice.find(
          { businessId: bId, appointmentId: { $in: recoveredApptIds } },
          { appointmentId: 1, totalAmount: 1 }
        ).lean()
      : [];
    const recoveredValueByAppt = new Map(
      recoveredInvoices.map((i: any) => [i.appointmentId?.toString(), i.totalAmount || 0])
    );

    const points: RevenueRecoveryPoint[] = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const end = new Date(now);
      end.setDate(end.getDate() - w * 7);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);

      const inWindow = (d?: Date | null) =>
        !!d && d.getTime() >= start.getTime() && d.getTime() <= end.getTime();

      const revenueCollected = invoices
        .filter((i: any) => inWindow(i.paidAt))
        .reduce((sum: number, i: any) => sum + (i.amountPaid || 0), 0);

      const revenueRecovered = recoveries
        .filter((r: any) => inWindow(r.createdAt))
        .reduce((sum: number, r: any) => {
          const known = r.recoveredAppointmentId
            ? recoveredValueByAppt.get(r.recoveredAppointmentId.toString())
            : undefined;
          return sum + (known ?? avgTicket);
        }, 0);

      points.push({
        week: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        revenueCollected: Math.round(revenueCollected),
        revenueRecovered: Math.round(revenueRecovered),
      });
    }

    return points;
  }

  /**
   * Drives the new-account activation checklist. A brand-new dashboard used to
   * display fabricated KPI fallbacks; it now shows real zeros plus the concrete
   * steps required to get the AI receptionist answering calls.
   */
  public static async getActivationChecklist(
    businessId: Types.ObjectId | string
  ): Promise<{ steps: ActivationStep[]; completedCount: number; totalCount: number; isActivated: boolean }> {
    const bId = new Types.ObjectId(businessId.toString());

    const [business, serviceCount, phoneCount, knowledgeCount, callCount, customerCount] =
      await Promise.all([
        Business.findById(bId).lean(),
        Service.countDocuments({ businessId: bId, active: true }),
        BusinessPhoneNumber.countDocuments({ businessId: bId, status: 'active' }),
        KnowledgeItem.countDocuments({ businessId: bId }),
        // A test call must not tick off the "you have taken a real call" step.
        CallLog.countDocuments({ businessId: bId, isTest: { $ne: true } }),
        Customer.countDocuments({ businessId: bId }),
      ]);

    const steps: ActivationStep[] = [
      {
        id: 'business_profile',
        label: 'Complete your business profile',
        description: 'Name, trade, service area and business hours.',
        done: (business as any)?.onboardingStatus === 'completed',
        href: '/onboarding',
      },
      {
        id: 'services',
        label: 'Add the services you sell',
        description: 'The AI quotes from this list and books the right job length.',
        done: serviceCount > 0,
        href: '/app/services',
      },
      {
        id: 'phone_number',
        label: 'Connect a phone number',
        description: 'Buy a local line or forward your existing number to it.',
        done: phoneCount > 0,
        href: '/app/settings/phone',
      },
      {
        id: 'knowledge_base',
        label: 'Answer your top 3 customer questions',
        description: 'Diagnostic fee, service area, warranty — so the AI never guesses.',
        done: knowledgeCount >= 3,
        href: '/app/settings',
      },
      {
        id: 'test_call',
        label: 'Place a test call',
        description: 'Hear exactly what your callers will hear.',
        done: callCount > 0,
        href: '/app/settings/phone',
      },
      {
        id: 'first_customer',
        label: 'Import or add your first customer',
        description: 'Gives the AI history to recognise repeat callers.',
        done: customerCount > 0,
        href: '/app/customers',
      },
    ];

    const completedCount = steps.filter((s) => s.done).length;

    return {
      steps,
      completedCount,
      totalCount: steps.length,
      // "Activated" means the product can actually answer a call.
      isActivated: steps.find((s) => s.id === 'phone_number')!.done && serviceCount > 0,
    };
  }

  /**
   * Operational KPIs that back the dashboard gauges and telemetry strip.
   *
   * These were previously hardcoded in the UI: a 42s speed-to-lead, a 96.4% AI
   * resolution rate, "<280ms" latency, "4.9 / 5.0" CSAT and "100% Compliant"
   * were literal constants shown to every account including brand-new ones.
   * Each value below is computed, and returns null when there is not enough
   * data so the UI can say "not enough data" instead of inventing a number.
   */
  public static async getOperationalKpis(businessId: Types.ObjectId | string): Promise<{
    speedToLeadSeconds: number | null;
    aiResolutionRate: number | null;
    resolvedCalls: number;
    totalCalls: number;
    avgReviewRating: number | null;
    reviewResponses: number;
    shieldedNegativeCount: number;
    openEscalations: number;
    avgVoiceLatencyMs: number | null;
    telephonyConnected: boolean;
    voiceProvider: string;
  }> {
    const bId = new Types.ObjectId(businessId.toString());
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [calls, recoveries, campaigns, activeNumbers] = await Promise.all([
      CallLog.find(
        {
          businessId: bId,
          direction: 'inbound',
          isTest: { $ne: true },
          startedAt: { $gte: since },
        },
        { outcome: 1, aiHandled: 1, startedAt: 1, endedAt: 1, metrics: 1 }
      ).lean(),
      LeadRecovery.find(
        { businessId: bId, createdAt: { $gte: since }, speedToLeadSentAt: { $ne: null } },
        { createdAt: 1, speedToLeadSentAt: 1 }
      ).lean(),
      ReviewCampaign.find(
        { businessId: bId, createdAt: { $gte: since } },
        { rating: 1, status: 1, escalatedToOwner: 1, resolvedAt: 1 }
      ).lean(),
      BusinessPhoneNumber.countDocuments({ businessId: bId, status: 'active' }),
    ]);

    // Speed-to-lead: seconds between the recovery being created (call ended)
    // and the first SMS actually being sent.
    const speedSamples = recoveries
      .map((r: any) => {
        if (!r.speedToLeadSentAt || !r.createdAt) return null;
        const delta = (r.speedToLeadSentAt.getTime() - r.createdAt.getTime()) / 1000;
        return delta >= 0 && delta < 3600 ? delta : null;
      })
      .filter((v): v is number => v !== null);

    const speedToLeadSeconds =
      speedSamples.length > 0
        ? Math.round(speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length)
        : null;

    const RESOLVED_OUTCOMES = ['appointment_booked', 'lead_captured', 'inquiry_answered'];
    const resolvedCalls = calls.filter((c: any) => RESOLVED_OUTCOMES.includes(c.outcome)).length;
    const aiResolutionRate =
      calls.length > 0 ? Math.round((resolvedCalls / calls.length) * 1000) / 10 : null;

    const rated = campaigns.filter((c: any) => typeof c.rating === 'number');
    const avgReviewRating =
      rated.length > 0
        ? Math.round((rated.reduce((sum: number, c: any) => sum + c.rating, 0) / rated.length) * 10) / 10
        : null;

    // Real observed audio latency where the voice engine recorded it.
    const latencySamples = calls
      .map((c: any) => c.metrics?.avgTurnLatencyMs)
      .filter((v: any): v is number => typeof v === 'number' && v > 0);
    const avgVoiceLatencyMs =
      latencySamples.length > 0
        ? Math.round(latencySamples.reduce((a: number, b: number) => a + b, 0) / latencySamples.length)
        : null;

    return {
      speedToLeadSeconds,
      aiResolutionRate,
      resolvedCalls,
      totalCalls: calls.length,
      avgReviewRating,
      reviewResponses: rated.length,
      shieldedNegativeCount: campaigns.filter((c: any) => c.status === 'negative_shielded').length,
      openEscalations: campaigns.filter((c: any) => c.escalatedToOwner && !c.resolvedAt).length,
      avgVoiceLatencyMs,
      telephonyConnected: activeNumbers > 0 && TwilioService.isConfigured(),
      voiceProvider: config.voiceProvider,
    };
  }

  /** Single round-trip payload for the dashboard. */
  public static async getOverview(businessId: Types.ObjectId | string) {
    const [callVolume, serviceDistribution, revenueRecovery, activation, entitlement, kpis] =
      await Promise.all([
        this.getCallVolumeSeries(businessId, 7),
        this.getServiceDistribution(businessId),
        this.getRevenueRecovery(businessId, 4),
        this.getActivationChecklist(businessId),
        BillingService.checkEntitlement(businessId),
        this.getOperationalKpis(businessId),
      ]);

    return { callVolume, serviceDistribution, revenueRecovery, activation, entitlement, kpis };
  }
}
