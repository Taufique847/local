'use client';

import React from 'react';
import {
  Zap,
  PhoneCall,
  MapPin,
  ShieldAlert,
  Brain,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BentoGridProps {
  onOpenBookingModal: () => void;
}

export function BentoGrid({ onOpenBookingModal }: BentoGridProps) {
  return (
    <section id="features" className="py-20 sm:py-28 bg-slate-50 border-b border-slate-200/80 relative scroll-mt-16 text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Sparkles className="w-3.5 h-3.5" /> 5 Enterprise Autonomous Engines
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Engineered Specifically For High-Volume Home Services
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Unlike generic AI tools, BlueCollar AI is pre-configured with US HVAC, plumbing, and electrical trade intelligence.
          </p>
        </div>

        {/* Bento Grid Container */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1: Speed-to-Lead (Span 2 cols on md) */}
          <div className="md:col-span-2 rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 hover:shadow-md hover:border-slate-300 transition-all duration-200 shadow-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold">
                <Zap className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono uppercase tracking-wider text-blue-600 font-bold">
                Module 1 • Autonomous Speed-to-Lead
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
              Sub-60s Missed Call Recovery Engine
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-xl mb-6">
              67% of US homeowners hire the contractor who replies first. When an emergency call is missed, our engine fires a personalized text in 45 seconds, negotiates technician availability via AI SMS, and locks in the booking before the customer contacts your competitor.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-blue-600 text-xs font-semibold">
                  <Clock className="w-3.5 h-3.5" /> 45s Drip Trigger
                </div>
                <p className="text-[11px] text-slate-500">Sub-minute emergency SMS response</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" /> 8:05 AM TCPA Safe
                </div>
                <p className="text-[11px] text-slate-500">Never texts during quiet hours</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-indigo-600 text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 3-Min Dedupe
                </div>
                <p className="text-[11px] text-slate-500">Merges repeated panic calls</p>
              </div>
            </div>
          </div>

          {/* Card 2: Realtime Voice Engine (1 col) */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 hover:shadow-md hover:border-slate-300 transition-all duration-200 shadow-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-bold">
                <PhoneCall className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono uppercase tracking-wider text-indigo-600 font-bold">
                Module 2 • Realtime Voice
              </span>
            </div>

            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
              Ultra-Low Latency &lt;280ms
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Twilio G.711 μ-law streaming with instant acoustic speech barge-in.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">HVAC Compressor Noise Gate</span>
                <span className="text-emerald-600 font-bold">Active ✓</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">TTS Stream Pre-Warming</span>
                <span className="text-blue-600 font-mono font-bold">&lt;100ms</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Acoustic Echo Cancellation</span>
                <span className="text-indigo-600 font-bold">Enabled ✓</span>
              </div>
            </div>
          </div>

          {/* Card 3: Smart Dispatch Buffer Guard (1 col) */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 hover:shadow-md hover:border-slate-300 transition-all duration-200 shadow-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-bold">
                <MapPin className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono uppercase tracking-wider text-amber-700 font-bold">
                Module 3 • Smart Dispatch
              </span>
            </div>

            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2">
              Windshield Drive-Time Buffer
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Protects technicians from back-to-back scheduling across distant zip codes.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-700 font-medium">
                <Clock className="w-3.5 h-3.5" /> 30-Min Drive Buffer Enforced
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Routes heat pump emergencies only to certified techs within target territory.
              </p>
            </div>
          </div>

          {/* Card 4: Reputation Shield (Span 2 cols on md) */}
          <div className="md:col-span-2 rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 hover:shadow-md hover:border-slate-300 transition-all duration-200 shadow-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-bold">
                Module 4 • Google 5-Star Funnel
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
              Automated Review & Reputation Shielding
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-xl mb-6">
              2 hours post-service, customers receive an automated SMS survey (1 to 5 stars). 4-5 stars are directed to your Google Business Profile; 1-3 stars are strictly suppressed from Google, triggering an instant Owner Push SMS with a 24-hour resolution SLA!
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-1">
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" /> 4-5 Star Positive Flow
                </span>
                <p className="text-[11px] text-emerald-700">
                  Direct Google Review Link + $10 loyalty credit thank-you SMS.
                </p>
              </div>

              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 space-y-1">
                <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> 1-3 Star Shielded Flow
                </span>
                <p className="text-[11px] text-rose-700">
                  Google link blocked. Immediate Owner Push SMS alert + 24h SLA.
                </p>
              </div>
            </div>
          </div>

          {/* Card 5: Customer 360 & Property Memory (Full width on 3 cols) */}
          <div className="md:col-span-3 rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 hover:shadow-md hover:border-slate-300 transition-all duration-200 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold">
                    <Brain className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider text-blue-700 font-bold">
                    Module 5 • Customer 360 & Property Memory
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Long-Term HVAC Equipment Memory & Caller Recognition
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  When a returning homeowner calls, Alex greets them by name, remembers their Carrier Heat Pump model, filter size (16x25x1), attic access gate code (#7733), and lifetime spending value ($LTV).
                </p>
              </div>

              <div className="shrink-0">
                <a
                  href="#voice-demo"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-6 py-2.5 rounded-xl shadow-xs transition-colors"
                >
                  Watch Demo
                  <ArrowRight className="w-4 h-4 ml-1" />
                </a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
