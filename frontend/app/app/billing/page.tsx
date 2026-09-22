'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { CostSummaryCard } from '@/components/dashboard/cost-summary-card';
import { BillingService, SubscriptionData, PlanItem } from '@/services/billing.service';
import { readPlanIntent, clearPlanIntent, type PlanTier } from '@/lib/plan-intent';
import { toErrorMessage } from '@/lib/api-client';

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter Plan',
  pro: 'Pro Fleet Plan',
  enterprise: 'Enterprise Scale',
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  trialing: {
    label: 'Free trial',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  active: {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  past_due: {
    label: 'Payment failed',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  canceled: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  incomplete: {
    label: 'Action needed',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
};
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  PhoneCall,
  Clock,
  ArrowRight,
  ShieldCheck,
  Loader2,
  FileText,
  DollarSign,
} from 'lucide-react';

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [pageError, setPageError] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanTier | null>(null);

  const handleSelectPlan = useCallback(
    async (tier: PlanTier, interval?: 'month' | 'year') => {
      setActionLoading(tier);
      setPageError(null);
      try {
        const res = await BillingService.createCheckout(tier, interval ?? billingInterval);
        if (res.checkoutUrl) {
          // The intent has been converted into a Stripe session; do not replay it.
          clearPlanIntent();
          window.location.href = res.checkoutUrl;
          return;
        }
        setPageError('Checkout is not available right now. Please try again shortly.');
      } catch (err) {
        setPageError(toErrorMessage(err, 'Could not start checkout.'));
      } finally {
        setActionLoading(null);
      }
    },
    [billingInterval]
  );

  useEffect(() => {
    async function loadData() {
      try {
        const [subData, plansData] = await Promise.all([
          BillingService.getSubscription().catch(() => null),
          BillingService.getPlans().catch(() => []),
        ]);
        if (subData) {
          setSubscription(subData);
          setBillingInterval(subData.billingInterval === 'year' ? 'year' : 'month');
        }
        setPlans(plansData);
      } catch (err) {
        setPageError(toErrorMessage(err, 'Could not load your billing details.'));
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  /**
   * Picks up the plan the visitor chose on the marketing site and surfaces it
   * here after onboarding. Checkout is NOT auto-submitted — sending someone to a
   * payment page without a click is hostile, so this pre-selects and prompts.
   */
  useEffect(() => {
    if (searchParams.get('checkout') !== '1') return;
    const intent = readPlanIntent();
    if (!intent) return;

    setPendingPlan(intent.tier);
    setBillingInterval(intent.interval);
  }, [searchParams]);

  const handleOpenPortal = async () => {
    setActionLoading('portal');
    setPageError(null);
    try {
      const res = await BillingService.createPortal();
      if (res.portalUrl) {
        window.location.href = res.portalUrl;
      }
    } catch (err) {
      setPageError(toErrorMessage(err, 'Could not open the billing portal.'));
    } finally {
      setActionLoading(null);
    }
  };

  const checkoutSuccess = searchParams.get('success') === 'true';
  const checkoutCanceled = searchParams.get('canceled') === 'true';
  const billingSimulated = searchParams.get('billing_simulated') === 'true';

  const currentTier = subscription?.tier || 'starter';
  const status = subscription?.status ?? 'trialing';
  const minutesUsed = subscription?.minutesUsed ?? 0;
  const minutesAllocated = subscription?.minutesAllocated ?? 0;
  const usagePercent =
    minutesAllocated > 0 ? Math.min(100, Math.round((minutesUsed / minutesAllocated) * 100)) : 0;

  const periodEnd =
    status === 'trialing' && subscription?.trialEndsAt
      ? subscription.trialEndsAt
      : subscription?.currentPeriodEnd;

  const periodEndLabel = periodEnd
    ? new Date(periodEnd).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'the next billing cycle';

  return (
    <DashboardShell>
      <div className="space-y-8 max-w-6xl">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <CreditCard className="w-6 h-6 text-blue-600" />
              Subscription &amp; Stripe Billing
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Manage your contractor plan tier, voice minute limits, and Stripe payment methods.
            </p>
          </div>

          <Button
            onClick={handleOpenPortal}
            disabled={actionLoading === 'portal'}
            variant="outline"
            size="sm"
            className="bg-white border-slate-300 text-slate-700 hover:bg-slate-50 text-xs shadow-xs"
          >
            {actionLoading === 'portal' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
            )}
            Stripe Customer Portal
          </Button>
        </div>

        {/* Checkout outcome + carried-over plan selection */}
        {pageError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">{pageError}</span>
          </div>
        )}

        {checkoutSuccess && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">
              Payment complete. Your plan updates as soon as Stripe confirms it, usually within a few
              seconds.
            </span>
          </div>
        )}

        {checkoutCanceled && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
            Checkout was cancelled. Your current plan is unchanged.
          </div>
        )}

        {/* Simulation mode: STRIPE_SECRET_KEY is not configured on the server, so
            no real payment can be taken. Saying so prevents a false impression
            that the account is now paid. */}
        {billingSimulated && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-bold">Billing is in simulation mode.</span> Stripe is not
              configured on this environment, so no payment was taken and your plan has not changed.
            </span>
          </div>
        )}

        {pendingPlan && !checkoutSuccess && (
          <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-blue-900">
              <p className="font-bold">
                You chose the {pendingPlan === 'pro' ? 'Pro Fleet' : pendingPlan === 'enterprise' ? 'Enterprise' : 'Starter'} plan
              </p>
              <p className="mt-0.5">
                Your free trial is already running. Add payment details whenever you are ready — you
                will not be charged until the trial ends.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                onClick={() => handleSelectPlan(pendingPlan, billingInterval)}
                disabled={actionLoading !== null}
                className="bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
              >
                {actionLoading === pendingPlan ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Continue to payment
              </Button>
              <button
                type="button"
                onClick={() => {
                  clearPlanIntent();
                  setPendingPlan(null);
                }}
                className="text-xs font-semibold text-blue-700 underline underline-offset-2"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-medium">Loading subscription details...</p>
          </div>
        ) : (
          <>
            {/* Active Subscription Overview Card */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
                      Current Subscription
                    </span>
                    {/* Real status. This badge used to read "Active"
                        unconditionally, including for trials and failed payments. */}
                    <Badge className={`text-[10px] font-semibold ${STATUS_STYLES[status].className}`}>
                      {STATUS_STYLES[status].label}
                    </Badge>
                  </div>

                  <h2 className="text-2xl font-extrabold text-slate-900">
                    {TIER_LABELS[currentTier] ?? currentTier}
                    {subscription?.amountUsd ? (
                      <span className="ml-2 text-base font-bold text-slate-500">
                        ${subscription.amountUsd.toLocaleString()} /{' '}
                        {subscription.billingInterval === 'year' ? 'yr' : 'mo'}
                      </span>
                    ) : null}
                  </h2>

                  <p className="text-xs text-slate-500">
                    {status === 'trialing' ? 'Trial ends on ' : 'Next renewal on '}
                    <strong className="text-slate-700">
                      {periodEndLabel}
                    </strong>
                    {subscription?.cancelAtPeriodEnd
                      ? '. Your plan will not renew after this date.'
                      : '.'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleOpenPortal}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs"
                  >
                    Update Card / Invoice Details
                  </Button>
                </div>
              </div>

              {/* Usage Bar */}
              <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Voice Minutes Allocation</span>
                    <span className="font-mono font-bold text-slate-900">
                      {minutesUsed} / {minutesAllocated} mins
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${usagePercent}%` }}
                      className={`h-full rounded-full transition-all ${
                        usagePercent > 85 ? 'bg-amber-500' : 'bg-blue-600'
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {minutesAllocated - minutesUsed} minutes remaining in current billing period.
                  </p>
                </div>

                <div className="space-y-1 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-mono uppercase">
                    Dedicated Phone Numbers
                  </span>
                  <p className="text-base font-bold text-slate-900">
                    {subscription?.phoneNumbersAllocated || 1} Active Lines
                  </p>
                  <p className="text-[11px] text-slate-500">Routing incoming homeowner calls 24/7.</p>
                </div>

                <div className="space-y-1 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-mono uppercase">
                    Overage Protection
                  </span>
                  <p className="text-base font-bold text-emerald-700">Zero Call Drops</p>
                  <p className="text-[11px] text-slate-500">
                    Additional minutes billed at flat $0.25/min rate.
                  </p>
                </div>
              </div>
            </div>

            {/*
              Unit economics. Every call already recorded its audio seconds,
              token counts and synthesised characters; nothing read them until
              now, so there was no way to tell whether a plan covers the calls it
              allows.
            */}
            <CostSummaryCard />

            {/* Plan Switcher Grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Available Plan Tiers</h3>
                  <p className="text-xs text-slate-500">Upgrade or switch plans anytime with one click.</p>
                </div>

                <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setBillingInterval('month')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      billingInterval === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingInterval('year')}
                    className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 ${
                      billingInterval === 'year' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    <span>Annual</span>
                    <span className="text-[9px] px-1 rounded bg-emerald-100 text-emerald-700 font-bold">
                      -10%
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map((p) => {
                  const isCurrent = currentTier === p.id;
                  const price = billingInterval === 'year' ? p.annualPricePerMonth : p.monthlyPrice;
                  const annualTotal = p.annualTotalPrice || price * 12;

                  return (
                    <div
                      key={p.id}
                      className={`rounded-2xl border p-6 flex flex-col justify-between transition-all ${
                        isCurrent
                          ? 'border-blue-600 bg-blue-50/15 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-900 text-base">{p.name}</h4>
                          {isCurrent && (
                            <Badge className="bg-blue-600 text-white text-[10px]">
                              Current Plan
                            </Badge>
                          )}
                        </div>

                        <div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-slate-900">
                              ${price.toLocaleString('en-US', { minimumFractionDigits: price % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                              / month
                            </span>
                          </div>
                          {billingInterval === 'year' ? (
                            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                              Billed annually (${annualTotal.toLocaleString('en-US', { minimumFractionDigits: annualTotal % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}/yr) • Save 10%
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Billed monthly, cancel anytime
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500 mt-1">
                            {p.id === 'enterprise' ? '2,000+' : p.minutesAllocated} voice mins •{' '}
                            {p.phoneNumbersAllocated === 999 ? 'Unlimited' : p.phoneNumbersAllocated} lines
                          </p>
                        </div>

                        <ul className="border-t border-slate-100 pt-4 space-y-2 text-xs text-slate-600">
                          {p.features.slice(0, 5).map((f, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="pt-6">
                        {isCurrent ? (
                          <Button
                            disabled
                            className="w-full bg-slate-100 text-slate-400 text-xs font-medium cursor-not-allowed"
                          >
                            Currently Active
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleSelectPlan(p.id)}
                            disabled={actionLoading === p.id}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold py-2 rounded-xl"
                          >
                            {actionLoading === p.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                            ) : null}
                            Switch to {p.name}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Invoices History Table */}
            <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Billing &amp; Invoice History
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Receipts and transaction records processed through Stripe.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Invoice ID</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {subscription?.invoicesHistory && subscription.invoicesHistory.length > 0 ? (
                      subscription.invoicesHistory.map((inv, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">
                            {inv.invoiceId}
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {new Date(inv.paidAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            ${inv.amountPaid.toFixed(2)} USD
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Paid
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={handleOpenPortal}
                              className="text-blue-600 hover:text-blue-700 font-semibold text-xs flex items-center gap-1 ml-auto"
                            >
                              View PDF <ExternalLink className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                          No previous invoices found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </DashboardShell>
  );
}
