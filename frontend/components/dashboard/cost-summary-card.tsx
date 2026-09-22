'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, TrendingDown, TrendingUp, Info } from 'lucide-react';
import { DashboardService, CostSummary } from '@/services/dashboard.service';
import { toErrorMessage } from '@/lib/api-client';

const usd = (value: number): string =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Sub-cent figures need more precision than a currency format gives. */
const preciseUsd = (value: number): string =>
  value >= 1 ? usd(value) : `$${value.toFixed(4)}`;

const PERIODS = [7, 30, 90] as const;

/**
 * Estimated provider spend on voice calls, and how it compares with plan revenue.
 *
 * Every call has been recording its own audio seconds, token counts and
 * synthesised characters since the real voice pipeline shipped, but nothing read
 * them. That left the central question about the business — do the calls a plan
 * allows cost less than the plan charges — with no answer anywhere in the
 * product.
 */
export function CostSummaryCard() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (period: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await DashboardService.getCosts(period));
    } catch (err) {
      setError(toErrorMessage(err, 'Could not load your cost estimate.'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const margin = data?.estimatedMarginUsd ?? null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">What your calls cost</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Estimated telephony, speech and language spend from measured usage.
          </p>
        </div>

        <div
          className="flex items-center gap-1 rounded-xl border border-slate-200 p-0.5"
          role="group"
          aria-label="Cost period"
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDays(p)}
              aria-pressed={days === p}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                days === p
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Calculating…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && data && data.callCount === 0 && (
        <p className="mt-4 text-xs text-slate-500">
          No calls in the last {data.periodDays} days, so there is nothing to cost yet.
        </p>
      )}

      {!loading && !error && data && data.callCount > 0 && (
        <div className="mt-4 space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Provider spend
              </dt>
              <dd className="mt-0.5 text-lg font-black text-slate-900">
                {usd(data.breakdown.totalUsd)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Per call
              </dt>
              <dd className="mt-0.5 text-lg font-black text-slate-900">
                {data.avgCostPerCallUsd === null
                  ? '—'
                  : preciseUsd(data.avgCostPerCallUsd)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Per minute
              </dt>
              <dd className="mt-0.5 text-lg font-black text-slate-900">
                {data.avgCostPerMinuteUsd === null
                  ? '—'
                  : preciseUsd(data.avgCostPerMinuteUsd)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Calls / minutes
              </dt>
              <dd className="mt-0.5 text-lg font-black text-slate-900">
                {data.callCount}
                <span className="text-xs font-semibold text-slate-400">
                  {' '}
                  / {data.totalMinutes}m
                </span>
              </dd>
            </div>
          </dl>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Telephony', value: data.breakdown.telephonyUsd },
              { label: 'Speech to text', value: data.breakdown.sttUsd },
              { label: 'Voice synthesis', value: data.breakdown.ttsUsd },
              { label: 'Language model', value: data.breakdown.llmUsd },
            ].map((row) => (
              <div key={row.label} className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {row.label}
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-800">{usd(row.value)}</p>
              </div>
            ))}
          </div>

          {margin !== null && (
            <div
              className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
                margin >= 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              {margin >= 0 ? (
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                <span className="font-semibold">
                  {margin >= 0 ? 'Covered by your plan' : 'Costing more than your plan'}
                </span>{' '}
                — {usd(Math.abs(margin))} {margin >= 0 ? 'left over' : 'over'} after{' '}
                {data.planCostUsd !== null ? usd(data.planCostUsd) : 'plan'} of plan fees for this
                period.
              </span>
            </div>
          )}

          {data.callsMissingMetrics > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                {data.callsMissingMetrics} of {data.callCount} calls have no usage measurements
                recorded, so their speech and language cost is not included here.
              </span>
            </p>
          )}

          <p className="text-[10px] text-slate-400">
            Estimates based on configured provider list prices. Your actual invoices will differ.
          </p>
        </div>
      )}
    </section>
  );
}
