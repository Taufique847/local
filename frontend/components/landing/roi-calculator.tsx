'use client';

import React, { useState } from 'react';
import { TrendingUp, Sparkles, ArrowRight, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RoiCalculatorProps {
  onOpenBookingModal: () => void;
}

export function RoiCalculator({ onOpenBookingModal }: RoiCalculatorProps) {
  const [missedCalls, setMissedCalls] = useState(40);
  const [ticketValue, setTicketValue] = useState(850);

  const monthlyLost = missedCalls * ticketValue;
  const monthlyRecovered = Math.round(missedCalls * 0.85 * ticketValue);
  const annualRecovered = monthlyRecovered * 12;

  return (
    <section id="roi-calculator" className="py-20 sm:py-28 bg-slate-50 border-b border-slate-200/80 relative scroll-mt-16 text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Calculator className="w-3.5 h-3.5" /> Contractor ROI Revenue Calculator
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            How Much Revenue Are You Losing To Competitors?
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Drag the sliders below to calculate how much missed call revenue BlueCollar AI will recover for your business each month.
          </p>
        </div>

        {/* Calculator Card */}
        <div className="max-w-4xl mx-auto rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-10 shadow-md">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Sliders (Left 7 cols) */}
            <div className="lg:col-span-7 space-y-8">
              
              {/* Slider 1: Missed Calls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs sm:text-sm font-semibold text-slate-900">
                    Estimated Unanswered / Missed Calls Per Month
                  </label>
                  <span className="text-base sm:text-lg font-bold font-mono text-blue-700 bg-blue-50 px-3 py-1 rounded-xl border border-blue-200">
                    {missedCalls} calls
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="5"
                  value={missedCalls}
                  onChange={(e) => setMissedCalls(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>10 calls/mo</span>
                  <span>100 calls/mo</span>
                  <span>200 calls/mo</span>
                </div>
              </div>

              {/* Slider 2: Average Ticket Value */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs sm:text-sm font-semibold text-slate-900">
                    Average Job / Ticket Revenue
                  </label>
                  <span className="text-base sm:text-lg font-bold font-mono text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                    ${ticketValue.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="3000"
                  step="50"
                  value={ticketValue}
                  onChange={(e) => setTicketValue(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>$200 (Maintenance)</span>
                  <span>$1,500 (Repair)</span>
                  <span>$3,000 (Replacement)</span>
                </div>
              </div>

              {/* Benchmark Note */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                💡 <strong className="text-slate-800">Industry Reality:</strong> 85% of missed callers who receive a sub-60 second automated text book with that contractor before dialing the next number on Google.
              </div>
            </div>

            {/* Results Display (Right 5 cols) */}
            <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-6 space-y-6 text-center shadow-lg">
              <div className="space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-rose-300 font-semibold block">
                  Current Lost Revenue
                </span>
                <p className="text-2xl font-black text-rose-300/90 line-through">
                  ${monthlyLost.toLocaleString()} / mo
                </p>
              </div>

              <div className="border-t border-slate-800 pt-4 space-y-1">
                <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold block flex items-center justify-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400" /> Revenue Recovered by BlueCollar AI
                </span>
                <p className="text-4xl sm:text-5xl font-black text-emerald-400 tracking-tight">
                  +${monthlyRecovered.toLocaleString()}
                  <span className="text-xs text-slate-400 block font-normal mt-1">per month</span>
                </p>
              </div>

              <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                <span className="text-[10px] text-slate-400 block uppercase font-mono">
                  Annual Top-Line Impact
                </span>
                <span className="text-xl font-extrabold text-white">
                  +${annualRecovered.toLocaleString()} / year
                </span>
              </div>

              <Button
                onClick={onOpenBookingModal}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-md text-xs"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Claim My Lost Revenue
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
