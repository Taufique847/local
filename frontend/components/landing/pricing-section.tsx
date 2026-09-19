'use client';

import React, { useState } from 'react';
import { Check, Sparkles, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PricingSectionProps {
  onOpenBookingModal: () => void;
}

export function PricingSection({ onOpenBookingModal }: PricingSectionProps) {
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');

  return (
    <section id="pricing" className="py-20 sm:py-28 bg-white border-b border-slate-200/80 relative scroll-mt-16 text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Sparkles className="w-3.5 h-3.5" /> Module 26 • Transparent Contractor Pricing
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Predictable Pricing. Zero Hidden Fees.
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            Recover thousands in lost emergency calls every single month. Pick the plan that fits your fleet with instant activation and no long-term contracts.
          </p>

          {/* Billing Interval Toggle (Monthly vs Annual with 10% OFF) */}
          <div className="pt-2 flex items-center justify-center gap-3">
            <div className="bg-slate-100 p-1 rounded-2xl border border-slate-200 inline-flex items-center">
              <button
                type="button"
                onClick={() => setBillingInterval('month')}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  billingInterval === 'month'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                onClick={() => setBillingInterval('year')}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  billingInterval === 'year'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Annual Billing</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  Save 10%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 3 Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
          
          {/* Plan 1: Starter ($299) */}
          <div className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-8 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-all">
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900">Starter Plan</h3>
                <p className="text-xs text-slate-500 leading-relaxed min-h-[36px]">
                  Ideal for solo contractors and small teams ready to stop missing calls.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-slate-900">
                    ${billingInterval === 'year' ? '269.10' : '299'}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    / month
                  </span>
                </div>
                {billingInterval === 'year' ? (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-emerald-700">
                      Billed annually ($3,229.20/yr) • Save 10%
                    </p>
                    <p className="text-[11px] text-slate-400">Save $358.80/year with annual billing</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 font-medium">
                    Billed monthly, cancel anytime
                  </p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Included Capabilities:
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>250 AI Voice Minutes</strong> / month</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>1 Dedicated Local Phone Line</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Sub-60s Speed-to-Lead SMS Recovery</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Realtime Voice Engine (&lt;280ms)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Calendar Appointment Booking</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>TCPA Quiet Hours Compliance</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-8 space-y-2">
              <a
                href="/login"
                className="w-full inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs transition-colors"
              >
                Get Started
              </a>
              <p className="text-[10px] text-center text-slate-400">Instant setup • Cancel anytime</p>
            </div>
          </div>

          {/* Plan 2: Pro Fleet ($799 - Highlighted) */}
          <div className="rounded-3xl border-2 border-blue-600 bg-blue-50/20 p-7 sm:p-8 flex flex-col justify-between shadow-md relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-sm">
              MOST POPULAR
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900">Pro Fleet Plan</h3>
                <p className="text-xs text-slate-600 leading-relaxed min-h-[36px]">
                  Built for 3-10 technician fleets automating dispatch and online reviews.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-slate-900">
                    ${billingInterval === 'year' ? '719.10' : '799'}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    / month
                  </span>
                </div>
                {billingInterval === 'year' ? (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-emerald-700">
                      Billed annually ($8,629.20/yr) • Save 10%
                    </p>
                    <p className="text-[11px] text-slate-500">Save $958.80/year with annual billing</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-blue-700 font-medium">
                    Billed monthly, cancel anytime
                  </p>
                )}
              </div>

              <div className="border-t border-slate-200/80 pt-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Everything in Starter, plus:
                </p>
                <ul className="space-y-2.5 text-xs text-slate-700">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span><strong>700 AI Voice Minutes</strong> / month</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>3 Dedicated Dispatch Phone Lines</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Smart Dispatch &amp; Skill Routing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>30-Min Windshield Transit Buffer Guard</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Google 5-Star Reputation Shield</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Urgent 1-Star Owner SMS + 24h SLA</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>Customer 360 &amp; Equipment Memory</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>AI Conversation QA &amp; Coaching Hub</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-8 space-y-2">
              <a
                href="/login"
                className="w-full inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors"
              >
                Subscribe to Pro
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </a>
              <p className="text-[10px] text-center text-slate-500">Most preferred by growing HVAC fleets</p>
            </div>
          </div>

          {/* Plan 3: Enterprise ($1,499) */}
          <div className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-8 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-all">
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900">Enterprise Scale</h3>
                <p className="text-xs text-slate-500 leading-relaxed min-h-[36px]">
                  For multi-location commercial operators with high call volumes.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-slate-900">
                    ${billingInterval === 'year' ? '1,349.10' : '1,499'}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    / month
                  </span>
                </div>
                {billingInterval === 'year' ? (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-emerald-700">
                      Billed annually ($16,189.20/yr) • Save 10%
                    </p>
                    <p className="text-[11px] text-slate-400">Save $1,798.80/year with annual billing</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 font-medium">
                    Billed monthly, cancel anytime
                  </p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Everything in Pro, plus:
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>2,000+ AI Voice Minutes</strong> ($0.25/min overage)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Unlimited Dedicated Phone Lines</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Custom RAG Knowledge Base &amp; Pricing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>24/7 Dedicated AI Employee Instance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Multi-Location Territory Routing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Direct Two-Way Sync (ServiceTitan/HCP)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Executive SLA Breach Alerts &amp; Monitoring</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Dedicated Account Manager &amp; 99.9% Uptime</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-8 space-y-2">
              <a
                href="/login"
                className="w-full inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-xl text-xs shadow-xs transition-colors"
              >
                Get Started with Enterprise
              </a>
              <p className="text-[10px] text-center text-slate-400">Custom volume billing available</p>
            </div>
          </div>

        </div>

        {/* Pricing FAQs Section */}
        <div className="max-w-4xl mx-auto pt-8 border-t border-slate-200 space-y-6">
          <div className="text-center space-y-1">
            <h3 className="text-xl font-bold text-slate-900">Frequently Asked Billing Questions</h3>
            <p className="text-xs text-slate-500">Everything you need to know about plans and payments.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5">
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                What happens if we exceed our monthly minutes?
              </p>
              <p className="text-slate-600 leading-relaxed">
                Your calls will never get dropped or rejected. Additional minutes are billed at an affordable $0.25/minute rate without any service interruption.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5">
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                Can we keep our existing business phone number?
              </p>
              <p className="text-slate-600 leading-relaxed">
                Yes! You simply forward your existing business number (or after-hours overflow) to your dedicated BlueCollar AI line. Setup takes under 2 minutes.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5">
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                Are there any long-term contracts?
              </p>
              <p className="text-slate-600 leading-relaxed">
                No. Monthly plans can be canceled anytime with one click in your billing dashboard. If you choose annual billing, you receive a 10% discount on the entire year.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5">
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                Is payment processed securely through Stripe?
              </p>
              <p className="text-slate-600 leading-relaxed">
                Yes. All transactions and card details are encrypted and processed by Stripe with PCI Level 1 compliance. We never store raw credit card numbers.
              </p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
