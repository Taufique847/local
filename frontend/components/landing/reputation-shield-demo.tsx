'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert,
  ShieldCheck,
  Star,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReputationShieldDemoProps {
  onOpenBookingModal: () => void;
}

export function ReputationShieldDemo({ onOpenBookingModal }: ReputationShieldDemoProps) {
  const [selectedRating, setSelectedRating] = useState<5 | 1>(5);

  return (
    <section id="reputation-shield" className="py-20 sm:py-28 bg-white border-b border-slate-200/80 relative scroll-mt-16 text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5" /> Google Review Shielding Engine
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Stop Public 1-Star Reviews Before They Hit Google
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Unhappy customers vent immediately, while happy customers forget to leave reviews. See how our autonomous reputation shield intercepts bad reviews while funneling 5-star ratings to Google.
          </p>
        </div>

        {/* Interactive Rating Simulator Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center max-w-5xl mx-auto">
          
          {/* Left Controls & Explanation */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                Interactive CSAT Simulation
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Click below to simulate how the system handles a 5-Star customer vs a dissatisfied 1-Star customer:
              </p>
            </div>

            {/* Selector Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedRating(5)}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  selectedRating === 5
                    ? 'bg-emerald-50 border-emerald-500 text-slate-900 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-1 text-amber-500 mb-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                  ))}
                </div>
                <span className="text-xs font-bold block text-slate-900">Test 5-Star Rating</span>
                <span className="text-[10px] text-slate-500">Google Redirect Flow</span>
              </button>

              <button
                onClick={() => setSelectedRating(1)}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  selectedRating === 1
                    ? 'bg-rose-50 border-rose-500 text-slate-900 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-1 text-rose-500 mb-1">
                  <Star className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                </div>
                <span className="text-xs font-bold block text-slate-900">Test 1-Star Complaint</span>
                <span className="text-[10px] text-slate-500">Internal Shield Flow</span>
              </button>
            </div>

            {/* Key Differentiator Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Why this protects your brand:
              </div>
              <ul className="text-slate-600 space-y-1.5 text-[11px] leading-relaxed">
                <li>• Public Google Review link is strictly suppressed for 1-3 stars.</li>
                <li>• Owner receives instant Push SMS with one-touch phone callback.</li>
                <li>• 24-Hour SLA countdown ensures customer is made whole before complaining online.</li>
              </ul>
            </div>

            <Button
              onClick={onOpenBookingModal}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-xs shadow-sm"
            >
              Protect My Google Business Rating
            </Button>
          </div>

          {/* Right Mobile Phone Simulator */}
          <div className="lg:col-span-7 flex justify-center">
            <div className="relative w-full max-w-sm rounded-[36px] border-4 border-slate-300 bg-slate-100 p-4 shadow-xl space-y-4">
              
              {/* Phone Speaker & Notch */}
              <div className="w-24 h-4 bg-slate-300 rounded-full mx-auto" />

              {/* SMS Header */}
              <div className="text-center border-b border-slate-200 pb-3">
                <p className="text-[10px] uppercase font-mono text-slate-500">
                  SMS Message • Apex Heating & Air
                </p>
                <p className="text-xs font-bold text-slate-900 mt-0.5">Automated CSAT Survey</p>
              </div>

              {/* SMS Dialogue Bubbles */}
              <div className="space-y-3 min-h-[260px] text-xs">
                
                {/* Outbound Survey Message */}
                <div className="flex flex-col items-start">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%] text-slate-800 shadow-xs">
                    Hi Alice, Dave Miller just completed your HVAC service. On a scale of 1 to 5, how satisfied are you with your service today?
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1">2 hours post-job</span>
                </div>

                {/* Customer Reply Bubble */}
                <div className="flex flex-col items-end">
                  <div className={`rounded-2xl rounded-tr-sm px-4 py-2 text-white font-semibold shadow-xs ${
                    selectedRating === 5 ? 'bg-emerald-600' : 'bg-rose-600'
                  }`}>
                    {selectedRating === 5 ? '5 Stars! Dave was phenomenal.' : '1 - Tech was late and tracked mud inside.'}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1">Just now</span>
                </div>

                {/* AI System Response */}
                <AnimatePresence mode="wait">
                  {selectedRating === 5 ? (
                    <motion.div
                      key="5-star"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="flex flex-col items-start"
                    >
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[90%] text-emerald-900 space-y-1.5 shadow-xs">
                        <span className="text-[10px] font-bold text-emerald-700 block uppercase">
                          ⭐ Google 5-Star Funnel
                        </span>
                        <p className="text-[11px] leading-relaxed text-emerald-900">
                          Thank you so much, Alice! Could you take 30 seconds to share your experience on Google? It helps our small business immensely:
                        </p>
                        <a
                          href="#"
                          onClick={(e) => e.preventDefault()}
                          className="text-[11px] text-blue-700 underline font-mono block break-all font-semibold"
                        >
                          https://search.google.com/local/writereview?placeid=ApexHeating
                        </a>
                        <p className="text-[10px] text-emerald-700 font-medium">
                          As a thank you, we've credited $10 to your next tune-up!
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="1-star"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="flex flex-col items-start space-y-2 w-full"
                    >
                      <div className="bg-rose-50 border border-rose-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[90%] text-rose-900 space-y-1 shadow-xs">
                        <span className="text-[10px] font-bold text-rose-700 block uppercase flex items-center gap-1">
                          🛡️ Google Review Shielded
                        </span>
                        <p className="text-[11px] leading-relaxed text-rose-900">
                          We are truly sorry your service did not meet expectations. Our management team has been alerted immediately and will personally follow up to resolve this for you.
                        </p>
                        <span className="inline-block text-[9px] px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 font-mono font-semibold">
                          Google Link Suppressed
                        </span>
                      </div>

                      {/* Immediate Push Alert to Owner */}
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full bg-amber-50 border border-amber-300 rounded-xl p-2.5 text-[10px] text-amber-950 shadow-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-amber-800 font-bold">
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> URGENT OWNER PUSH ALERT
                          </span>
                          <span className="font-mono text-[9px] text-rose-700 font-bold">24h SLA Active</span>
                        </div>
                        <p className="text-amber-900">
                          Customer Bob rated 1 Star! Tap to call customer and resolve before public review.
                        </p>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>

              {/* Home indicator bar */}
              <div className="w-32 h-1 bg-slate-300 rounded-full mx-auto" />
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
