'use client';

import React, { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PhoneCall, DollarSign, Sparkles, Inbox } from 'lucide-react';
import type {
  CallVolumePoint,
  ServiceDistributionPoint,
  RevenueRecoveryPoint,
} from '@/services/dashboard.service';

/**
 * All three charts render REAL data supplied by /api/dashboard/overview.
 * They previously rendered module-level hardcoded arrays, so every account saw
 * the same invented traffic, job mix and revenue figures.
 */

const SERIES_COLORS = ['#2563eb', '#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function ModernTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-3 shadow-lg text-xs space-y-1 z-50 min-w-[140px]">
        <p className="font-bold text-slate-900 border-b border-slate-100 pb-1">{label}</p>
        {payload.map((entry, index) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}:
            </span>
            <span className="font-bold text-slate-900 font-mono">
              {entry.unit ? `${entry.unit}${Number(entry.value).toLocaleString()}` : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

/** Shared placeholder so an empty chart reads as "no data yet", not "broken". */
function ChartEmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex h-full min-h-[10rem] w-full flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
        <Inbox className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-xs font-semibold text-slate-600">{message}</p>
      {hint && <p className="max-w-[16rem] text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function ChartSkeleton({ height = 'h-72' }: { height?: string }) {
  return (
    <div className={`${height} w-full animate-pulse rounded-xl bg-slate-100`} aria-hidden="true" />
  );
}

/**
 * Area Chart: Inbound vs AI Booked vs SMS Recovered (trailing 7 days).
 */
export function CallVolumeAreaChart({
  data,
  loading = false,
}: {
  data: CallVolumePoint[];
  loading?: boolean;
}) {
  const [metricView, setMetricView] = useState<'all' | 'booked'>('all');

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, point) => ({
          inbound: acc.inbound + point.inbound,
          aiBooked: acc.aiBooked + point.aiBooked,
          smsRecovered: acc.smsRecovered + point.smsRecovered,
        }),
        { inbound: 0, aiBooked: 0, smsRecovered: 0 }
      ),
    [data]
  );

  // Share of inbound calls that ended in a booking or an SMS recovery, rather
  // than a hardcoded "96%".
  const captureRate =
    totals.inbound > 0
      ? Math.round(((totals.aiBooked + totals.smsRecovered) / totals.inbound) * 100)
      : 0;

  const hasActivity = totals.inbound > 0 || totals.aiBooked > 0 || totals.smsRecovered > 0;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
            <PhoneCall className="w-4 h-4 text-blue-600" aria-hidden="true" />
            Call Traffic &amp; Lead Recovery
          </h3>
          <p className="text-xs text-slate-500">
            Last 7 days of inbound calls versus appointments booked by the AI.
          </p>
        </div>

        <div
          role="group"
          aria-label="Chart metric view"
          className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto"
        >
          <button
            type="button"
            onClick={() => setMetricView('all')}
            aria-pressed={metricView === 'all'}
            className={`px-3 py-1 rounded-lg transition-all ${
              metricView === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            All Channels
          </button>
          <button
            type="button"
            onClick={() => setMetricView('booked')}
            aria-pressed={metricView === 'booked'}
            className={`px-3 py-1 rounded-lg transition-all ${
              metricView === 'booked'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Bookings Only
          </button>
        </div>
      </div>

      <div className="h-72 w-full pt-4">
        {loading ? (
          <ChartSkeleton />
        ) : !hasActivity ? (
          <ChartEmptyState
            message="No calls in the last 7 days"
            hint="Once your number is connected and callers come through, traffic appears here."
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorInbound" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorAiBooked" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorSmsRecovered" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <Tooltip content={<ModernTooltip />} />

              {metricView === 'all' && (
                <Area
                  type="monotone"
                  dataKey="inbound"
                  name="Total Inbound"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorInbound)"
                />
              )}

              <Area
                type="monotone"
                dataKey="aiBooked"
                name="AI Booked Jobs"
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorAiBooked)"
              />

              {metricView === 'all' && (
                <Area
                  type="monotone"
                  dataKey="smsRecovered"
                  name="SMS Speed-to-Lead"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fillOpacity={1}
                  fill="url(#colorSmsRecovered)"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" aria-hidden="true" />
            Inbound ({totals.inbound})
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            AI Booked ({totals.aiBooked})
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" aria-hidden="true" />
            SMS Recovered ({totals.smsRecovered})
          </span>
        </div>
        {hasActivity && (
          <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            {captureRate}% capture rate
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Donut Chart: booked jobs by service category (trailing 90 days).
 */
export function ServiceDistributionDonut({
  data,
  loading = false,
}: {
  data: ServiceDistributionPoint[];
  loading?: boolean;
}) {
  const total = useMemo(() => data.reduce((acc, curr) => acc + curr.value, 0), [data]);

  const withColors = useMemo(
    () => data.map((item, index) => ({ ...item, color: SERIES_COLORS[index % SERIES_COLORS.length] })),
    [data]
  );

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      <div className="border-b border-slate-100 pb-3 space-y-1">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-blue-600" aria-hidden="true" />
          Jobs by Service
        </h3>
        <p className="text-xs text-slate-500">Booked appointments over the last 90 days.</p>
      </div>

      <div className="py-2 flex items-center justify-center relative h-52">
        {loading ? (
          <ChartSkeleton height="h-48" />
        ) : total === 0 ? (
          <ChartEmptyState
            message="No booked jobs yet"
            hint="Your service mix appears here after the first appointments are booked."
          />
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ModernTooltip />} />
                <Pie
                  data={withColors}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                >
                  {withColors.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-900 tracking-tight">{total}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Jobs</span>
            </div>
          </>
        )}
      </div>

      {total > 0 && (
        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          {withColors.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-600">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="truncate max-w-[150px]">{item.name}</span>
              </span>
              <span className="font-mono font-bold text-slate-900">
                {Math.round((item.value / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bar Chart: weekly collected revenue vs revenue attributable to AI recovery.
 */
export function RevenueRecoveryBarChart({
  data,
  loading = false,
}: {
  data: RevenueRecoveryPoint[];
  loading?: boolean;
}) {
  const totals = useMemo(
    () =>
      data.reduce(
        (acc, point) => ({
          collected: acc.collected + point.revenueCollected,
          recovered: acc.recovered + point.revenueRecovered,
        }),
        { collected: 0, recovered: 0 }
      ),
    [data]
  );

  const hasRevenue = totals.collected > 0 || totals.recovered > 0;
  const currency = (value: number) => `$${Math.round(value).toLocaleString()}`;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="space-y-0.5">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            Revenue Collected &amp; Recovered
          </h3>
          <p className="text-xs text-slate-500">
            Invoice payments received, and value from missed calls the AI won back.
          </p>
        </div>
        <span className="text-base font-extrabold text-slate-900">{currency(totals.collected)}</span>
      </div>

      <div className="h-44 w-full pt-2">
        {loading ? (
          <ChartSkeleton height="h-40" />
        ) : !hasRevenue ? (
          <ChartEmptyState message="No payments recorded yet" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickFormatter={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
              />
              <Tooltip content={<ModernTooltip />} />
              <Bar
                dataKey="revenueCollected"
                name="Collected"
                fill="#10b981"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="revenueRecovered"
                name="AI Recovered"
                fill="#f59e0b"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {hasRevenue && (
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">
            Recovered by AI: <span className="font-semibold text-slate-700">{currency(totals.recovered)}</span>
          </span>
          {totals.collected > 0 && (
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {Math.round((totals.recovered / totals.collected) * 100)}% of collected
            </span>
          )}
        </div>
      )}
    </div>
  );
}
