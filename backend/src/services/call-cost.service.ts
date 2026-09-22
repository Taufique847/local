import { Types } from 'mongoose';
import { CallLog } from '../models/call-log.model';
import { ICallMetrics } from '../types/telephony.types';
import { config } from '../config/env';

/**
 * Cost of one call, broken down by provider.
 *
 * All figures are ESTIMATES derived from recorded usage multiplied by the unit
 * prices in configuration. They are not invoiced amounts, and callers are
 * expected to present them as approximations.
 */
export interface CallCostBreakdown {
  telephonyUsd: number;
  sttUsd: number;
  ttsUsd: number;
  llmUsd: number;
  totalUsd: number;
}

export interface CostSummary {
  periodDays: number;
  callCount: number;
  /** Calls that predate metric capture, so their cost cannot be estimated. */
  callsMissingMetrics: number;
  totalMinutes: number;
  breakdown: CallCostBreakdown;
  /** Null rather than zero when there is nothing to average. */
  avgCostPerCallUsd: number | null;
  avgCostPerMinuteUsd: number | null;
  /** What the business pays for the plan in the same period, when known. */
  planCostUsd: number | null;
  /** planCost - providerCost. Negative means calls cost more than the plan earns. */
  estimatedMarginUsd: number | null;
  currency: 'USD';
}

const round = (value: number, dp = 4): number => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

/**
 * Turns recorded voice usage into money.
 *
 * The voice pipeline has been writing `CallLog.metrics` (audio seconds, token
 * counts, synthesised characters) since the real provider landed, but nothing
 * ever read it. That left the most basic question about the business
 * unanswerable: does a $299/month plan cover the calls it allows? Without this,
 * pricing is guesswork.
 */
export class CallCostService {
  /** Cost of a single call from its recorded metrics. */
  public static costForCall(params: {
    durationSeconds?: number;
    metrics?: ICallMetrics | null;
  }): CallCostBreakdown {
    const prices = config.costs;
    const metrics = params.metrics || {};

    const billedMinutes = Math.ceil((params.durationSeconds || 0) / 60);
    const telephonyUsd = billedMinutes * prices.telephonyPerMinuteUsd;

    // Speech recognition is charged on audio streamed, which is close to but not
    // identical to call duration (the stream opens slightly after answer).
    const sttMinutes = (metrics.sttAudioSeconds || 0) / 60;
    const sttUsd = sttMinutes * prices.sttPerMinuteUsd;

    const ttsUsd = ((metrics.ttsCharacters || 0) / 1000) * prices.ttsPer1kCharsUsd;

    const llmUsd =
      ((metrics.llmPromptTokens || 0) / 1_000_000) * prices.llmInputPer1mUsd +
      ((metrics.llmCompletionTokens || 0) / 1_000_000) * prices.llmOutputPer1mUsd;

    return {
      telephonyUsd: round(telephonyUsd),
      sttUsd: round(sttUsd),
      ttsUsd: round(ttsUsd),
      llmUsd: round(llmUsd),
      totalUsd: round(telephonyUsd + sttUsd + ttsUsd + llmUsd),
    };
  }

  /**
   * Aggregates provider cost across a period and compares it with plan revenue.
   *
   * Test calls are excluded along with everything else in reporting: the owner
   * trying their own assistant is not a cost of serving customers.
   */
  public static async getCostSummary(
    businessId: Types.ObjectId | string,
    periodDays = 30
  ): Promise<CostSummary> {
    const bId = new Types.ObjectId(businessId.toString());
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const calls = await CallLog.find(
      {
        businessId: bId,
        isTest: { $ne: true },
        startedAt: { $gte: since },
      },
      { durationSeconds: 1, metrics: 1 }
    ).lean();

    const totals: CallCostBreakdown = {
      telephonyUsd: 0,
      sttUsd: 0,
      ttsUsd: 0,
      llmUsd: 0,
      totalUsd: 0,
    };

    let totalSeconds = 0;
    let callsMissingMetrics = 0;

    for (const call of calls) {
      const metrics = (call as any).metrics as ICallMetrics | undefined;

      // A call with no token or audio counters predates metric capture. Counted
      // separately so a partially-instrumented history is visible rather than
      // quietly dragging the average down.
      if (!metrics || (!metrics.sttAudioSeconds && !metrics.llmPromptTokens && !metrics.ttsCharacters)) {
        callsMissingMetrics++;
      }

      totalSeconds += call.durationSeconds || 0;

      const cost = this.costForCall({
        durationSeconds: call.durationSeconds,
        metrics,
      });

      totals.telephonyUsd += cost.telephonyUsd;
      totals.sttUsd += cost.sttUsd;
      totals.ttsUsd += cost.ttsUsd;
      totals.llmUsd += cost.llmUsd;
      totals.totalUsd += cost.totalUsd;
    }

    const breakdown: CallCostBreakdown = {
      telephonyUsd: round(totals.telephonyUsd, 2),
      sttUsd: round(totals.sttUsd, 2),
      ttsUsd: round(totals.ttsUsd, 2),
      llmUsd: round(totals.llmUsd, 2),
      totalUsd: round(totals.totalUsd, 2),
    };

    const totalMinutes = round(totalSeconds / 60, 1);
    const callCount = calls.length;

    const planCostUsd = await this.planCostForPeriod(businessId, periodDays);

    return {
      periodDays,
      callCount,
      callsMissingMetrics,
      totalMinutes,
      breakdown,
      avgCostPerCallUsd: callCount > 0 ? round(breakdown.totalUsd / callCount, 4) : null,
      avgCostPerMinuteUsd: totalMinutes > 0 ? round(breakdown.totalUsd / totalMinutes, 4) : null,
      planCostUsd,
      estimatedMarginUsd:
        planCostUsd === null ? null : round(planCostUsd - breakdown.totalUsd, 2),
      currency: 'USD',
    };
  }

  /**
   * Plan revenue for the period, pro-rated from the subscription's monthly price.
   *
   * Returns null while the business is on trial or has no priced plan, because
   * there is no revenue to compare against and showing 0 would read as a loss.
   */
  private static async planCostForPeriod(
    businessId: Types.ObjectId | string,
    periodDays: number
  ): Promise<number | null> {
    try {
      const { Subscription } = await import('../models/subscription.model');
      const sub = await Subscription.findOne({ businessId }).lean();

      if (!sub || sub.status === 'trialing') return null;

      const amount = sub.amountUsd;
      if (!amount || amount <= 0) return null;

      const monthly = sub.billingInterval === 'year' ? amount / 12 : amount;
      return round((monthly / 30) * periodDays, 2);
    } catch {
      return null;
    }
  }
}
