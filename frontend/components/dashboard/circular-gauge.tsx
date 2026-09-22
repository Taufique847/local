'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface CircularGaugeProps {
  /** Current value. Pass null when there is not enough data to report one. */
  value: number | null;
  maxValue?: number;
  size?: number;
  strokeWidth?: number;
  title: string;
  subtitle?: string;
  unit?: string;
  gradientFrom?: string;
  gradientTo?: string;
  icon?: React.ReactNode;
  /** Short context line, e.g. a target or sample size. */
  trendText?: string;
  trendPositive?: boolean;
  /** Shown in place of the value when `value` is null. */
  emptyLabel?: string;
  loading?: boolean;
}

export function CircularGauge({
  value,
  maxValue = 100,
  size = 96,
  strokeWidth = 8,
  title,
  subtitle,
  unit = '%',
  gradientFrom = '#2563eb',
  gradientTo = '#38bdf8',
  icon,
  trendText,
  trendPositive = true,
  emptyLabel = 'No data yet',
  loading = false,
}: CircularGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasValue = value !== null && value !== undefined && Number.isFinite(value);
  const percentage = hasValue
    ? Math.min(100, Math.max(0, (Number(value) / maxValue) * 100))
    : 0;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const gradientId = `gauge-grad-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="space-y-0.5 min-w-0">
          <h4 className="text-xs font-bold text-slate-900 tracking-tight truncate">{title}</h4>
          {subtitle && <p className="text-[10px] text-slate-400 truncate">{subtitle}</p>}
        </div>
        {icon && (
          <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100 text-slate-600 shrink-0">
            {icon}
          </div>
        )}
      </div>

      <div className="py-2.5 flex items-center justify-center relative">
        <svg
          width={size}
          height={size}
          className="rotate-[-90deg]"
          role="img"
          aria-label={
            hasValue ? `${title}: ${value}${unit} of ${maxValue}${unit}` : `${title}: ${emptyLabel}`
          }
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientFrom} />
              <stop offset="100%" stopColor={gradientTo} />
            </linearGradient>
          </defs>

          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />

          {/* Animated Value Arc — omitted entirely when there is no value, so an
              empty account never shows a filled gauge. */}
          {hasValue && (
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke={`url(#${gradientId})`}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              strokeLinecap="round"
            />
          )}
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
          {loading ? (
            <span className="text-xs font-semibold text-slate-400">…</span>
          ) : hasValue ? (
            <>
              <div className="flex items-baseline gap-0.5">
                <span className="text-xl font-black text-slate-900 tracking-tight">{value}</span>
                <span className="text-[11px] font-bold text-slate-500">{unit}</span>
              </div>
              <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">
                {percentage.toFixed(0)}% of {maxValue}
                {unit}
              </span>
            </>
          ) : (
            <span className="text-[10px] font-semibold leading-tight text-slate-400">
              {emptyLabel}
            </span>
          )}
        </div>
      </div>

      {trendText && (
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
          <span
            className={`font-medium ${
              hasValue ? (trendPositive ? 'text-emerald-600' : 'text-amber-600') : 'text-slate-400'
            }`}
          >
            {trendText}
          </span>
        </div>
      )}
    </div>
  );
}
