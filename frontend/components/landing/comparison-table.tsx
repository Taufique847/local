'use client';

import React from 'react';
import { Check, X, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ComparisonTableProps {
  onOpenBookingModal: () => void;
}

const COMPARISON_ROWS = [
  {
    feature: 'Monthly Cost',
    human: '$2,500 – $4,500/mo',
    ivr: '$150 – $300/mo',
    blueCollar: 'Fraction of payroll (High ROI)',
    highlight: true,
  },
  {
    feature: 'Pickup Speed',
    human: '3 to 8 minute hold times',
    ivr: 'Robotic menu maze',
    blueCollar: 'Instant (<1 ring / <280ms voice)',
    highlight: true,
  },
  {
    feature: 'Direct Calendar Booking',
    human: 'Manual notes emailed to owner',
    ivr: 'Cannot book appointments',
    blueCollar: '100% Conflict-free live booking',
    highlight: true,
  },
  {
    feature: 'Dispatch Route Protection',
    human: 'No drive-time knowledge',
    ivr: 'None',
    blueCollar: '30-min windshield transit guard',
    highlight: false,
  },
  {
    feature: 'Missed Call Recovery',
    human: 'No follow-up on dropped calls',
    ivr: 'Caller hangs up (67% lost)',
    blueCollar: '45-second automated SMS recovery',
    highlight: true,
  },
  {
    feature: 'Google Review Shielding',
    human: 'Does not manage reviews',
    ivr: 'None',
    blueCollar: 'Automated 1-3 star shield + 24h SLA',
    highlight: false,
  },
  {
    feature: 'Equipment & Gate Code Memory',
    human: 'Notes lost across shift changes',
    ivr: 'None',
    blueCollar: 'Remembers Carrier/Trane & gate codes',
    highlight: false,
  },
  {
    feature: '24/7/365 After-Hours Coverage',
    human: 'Extra holiday/night surcharges',
    ivr: 'Voicemail graveyard',
    blueCollar: 'Included 24/7 with zero extra fees',
    highlight: false,
  },
];

export function ComparisonTable({ onOpenBookingModal }: ComparisonTableProps) {
  return (
    <section id="compare" className="py-20 sm:py-28 bg-white border-b border-slate-200/80 relative scroll-mt-16 text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Sparkles className="w-3.5 h-3.5" /> Direct Competitor Comparison
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Why Contractors Choose BlueCollar AI
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Compare human call centers and traditional robotic phone trees to an autonomous AI employee built specifically for the trades.
          </p>
        </div>

        {/* Table Container */}
        <div className="max-w-5xl mx-auto rounded-3xl border border-slate-200/90 bg-white overflow-hidden shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-5 px-6 font-semibold text-slate-700 w-1/4">Key Capability</th>
                  <th className="py-5 px-6 font-semibold text-slate-500 w-1/4">
                    Human Answering Service
                  </th>
                  <th className="py-5 px-6 font-semibold text-slate-500 w-1/4">
                    Legacy Robot IVR Menu
                  </th>
                  <th className="py-5 px-6 font-bold text-blue-950 bg-blue-50/80 border-l border-r border-blue-200 w-1/4 text-center">
                    <div className="inline-flex items-center gap-1 text-blue-700 font-bold">
                      <Sparkles className="w-4 h-4" /> BlueCollar AI
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                {COMPARISON_ROWS.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6 font-medium text-slate-900">
                      {row.feature}
                    </td>

                    <td className="py-4 px-6 text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <X className="w-4 h-4 text-rose-500 shrink-0" />
                        {row.human}
                      </span>
                    </td>

                    <td className="py-4 px-6 text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <X className="w-4 h-4 text-rose-500 shrink-0" />
                        {row.ivr}
                      </span>
                    </td>

                    <td className="py-4 px-6 font-semibold text-blue-900 bg-blue-50/30 border-l border-r border-blue-100 text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 font-bold" />
                        {row.blueCollar}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-600 text-center sm:text-left">
              Ready to eliminate hold times and capture every emergency job?
            </div>
            <Button
              onClick={onOpenBookingModal}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2 rounded-xl shadow-xs"
            >
              Replace Your Answering Service Today
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </div>

      </div>
    </section>
  );
}
