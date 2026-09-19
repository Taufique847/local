'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface CircularGaugeProps {
  value: number; // Current value (e.g., 96.4)
  maxValue?: number; // Max value (default 100)
  size?: number; // SVG diameter (default 110)
  strokeWidth?: number; // Thickness (default 9)
  title: string;
  subtitle?: string;
  unit?: string;
  gradientFrom?: string;
  gradientTo?: string;
  icon?: React.ReactNode;
  trendText?: string;
  trendPositive?: boolean;
}

export function CircularGauge({
  value,
  maxValue = 100,
  size = 96,
  strokeWidth = 8,
  title,
  subtitle,
  unit = '%',
  gradientFrom = '#2563eb', // blue-600
  gradientTo = '#38bdf8', // sky-400
  icon,
  trendText,
  trendPositive = true,
}: CircularGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min(100, Math.max(0, (value / maxValue) * 100));
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
        <svg width={size} height={size} className="rotate-[-90deg]">
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
            stroke="#f1f5f9" // slate-100
            strokeWidth={strokeWidth}
          />

          {/* Animated Value Arc */}
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
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="flex items-baseline gap-0.5">
            <span className="text-xl font-black text-slate-900 tracking-tight">{value}</span>
            <span className="text-[11px] font-bold text-slate-500">{unit}</span>
          </div>
          <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">
            {percentage.toFixed(0)}% of Max
          </span>
        </div>
      </div>

      {trendText && (
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span className="text-slate-500 font-medium">Target Benchmark</span>
          <span
            className={`font-semibold inline-flex items-center gap-1 ${
              trendPositive ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {trendText}
          </span>
        </div>
      )}
    </div>
  );
}
