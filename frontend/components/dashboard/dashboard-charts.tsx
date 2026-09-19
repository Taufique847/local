'use client';

import React, { useState } from 'react';
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
  Legend,
} from 'recharts';
import { PhoneCall, DollarSign, Calendar, TrendingUp, Sparkles } from 'lucide-react';

// Mock high-resolution 7-day operational timeline
const CALL_VOLUME_DATA_7D = [
  { day: 'Mon', inbound: 42, aiBooked: 28, smsRecovered: 11 },
  { day: 'Tue', inbound: 58, aiBooked: 39, smsRecovered: 15 },
  { day: 'Wed', inbound: 64, aiBooked: 46, smsRecovered: 16 },
  { day: 'Thu', inbound: 72, aiBooked: 53, smsRecovered: 18 },
  { day: 'Fri', inbound: 85, aiBooked: 61, smsRecovered: 21 },
  { day: 'Sat', inbound: 69, aiBooked: 52, smsRecovered: 14 },
  { day: 'Sun', inbound: 48, aiBooked: 36, smsRecovered: 10 },
];

const SERVICE_DISTRIBUTION_DATA = [
  { name: 'AC Repair & Diagnostics', value: 42, color: '#2563eb' }, // blue-600
  { name: 'Furnace & Heating', value: 28, color: '#0284c7' }, // sky-600
  { name: 'Emergency Water Leaks', value: 18, color: '#10b981' }, // emerald-500
  { name: 'Seasonal Tune-Ups', value: 12, color: '#f59e0b' }, // amber-500
];

const REVENUE_RECOVERY_DATA = [
  { week: 'Week 1', revenueSaved: 14400, target: 12000 },
  { week: 'Week 2', revenueSaved: 19200, target: 15000 },
  { week: 'Week 3', revenueSaved: 26400, target: 18000 },
  { week: 'Week 4', revenueSaved: 33600, target: 24000 },
];

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
              {entry.unit ? `${entry.unit}${entry.value.toLocaleString()}` : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

/**
 * Area Chart: Inbound vs AI Booked vs SMS Recovered
 */
export function CallVolumeAreaChart() {
  const [metricView, setMetricView] = useState<'all' | 'booked'>('all');

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <PhoneCall className="w-4 h-4 text-blue-600" />
              Call Traffic &amp; Autonomous Lead Recovery
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
              +18.4% this week
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Realtime 7-day distribution of incoming calls vs appointments booked directly by AI.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMetricView('all')}
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
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={CALL_VOLUME_DATA_7D} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
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
      </div>

      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            Total Inbound (438)
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            AI Dispatched (315)
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            SMS Recovered (105)
          </span>
        </div>
        <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
          96% Net Capture Rate
        </span>
      </div>
    </div>
  );
}

/**
 * Donut Chart: Trade Service Breakdown
 */
export function ServiceDistributionDonut() {
  const totalCalls = SERVICE_DISTRIBUTION_DATA.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      <div className="border-b border-slate-100 pb-3 space-y-1">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-blue-600" />
          Jobs by Trade Category
        </h3>
        <p className="text-xs text-slate-500">Autonomous intent breakdown across caller requests.</p>
      </div>

      <div className="py-2 flex items-center justify-center relative h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ModernTooltip />} />
            <Pie
              data={SERVICE_DISTRIBUTION_DATA}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {SERVICE_DISTRIBUTION_DATA.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center Donut Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-slate-900 tracking-tight">{totalCalls}</span>
          <span className="text-[10px] uppercase font-bold text-slate-400">Total Jobs</span>
        </div>
      </div>

      {/* Legend List */}
      <div className="space-y-1.5 border-t border-slate-100 pt-3">
        {SERVICE_DISTRIBUTION_DATA.map((item) => (
          <div key={item.name} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="truncate max-w-[150px]">{item.name}</span>
            </span>
            <span className="font-mono font-bold text-slate-900">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Bar Chart: Revenue Saved by Month
 */
export function RevenueRecoveryBarChart() {
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="space-y-0.5">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Revenue Recovered (Monthly)
          </h3>
          <p className="text-xs text-slate-500">Calculated from AI booked jobs ($1,200 avg ticket).</p>
        </div>
        <span className="text-base font-extrabold text-slate-900">$33,600+</span>
      </div>

      <div className="h-44 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={REVENUE_RECOVERY_DATA} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: '#64748b' }}
              tickFormatter={(v) => `$${v / 1000}k`}
            />
            <Tooltip content={<ModernTooltip />} />
            <Bar dataKey="revenueSaved" name="Revenue Saved" fill="#10b981" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">Monthly Target: $24,000</span>
        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
          140% of Goal
        </span>
      </div>
    </div>
  );
}
