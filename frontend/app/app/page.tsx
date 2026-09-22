'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { BusinessService } from '@/services/business.service';
import { CustomerService } from '@/services/customer.service';
import { LeadService } from '@/services/lead.service';
import { AppointmentService } from '@/services/appointment.service';
import { TelephonyService } from '@/services/telephony.service';
import { BillingService, SubscriptionData } from '@/services/billing.service';
import { DashboardService, DashboardOverview } from '@/services/dashboard.service';
import { toErrorMessage } from '@/lib/api-client';
import { Business } from '@/types/business';
import { CustomerStats } from '@/types/customer';
import { LeadStats } from '@/types/lead';
import { Appointment } from '@/types/appointment';
import { CallStats, BusinessPhoneNumber, CallLog } from '@/types/telephony';
import { TestCallModal } from '@/components/voice/test-call-modal';

import {
  Users,
  Calendar,
  PhoneCall,
  UserPlus,
  Bot,
  ArrowUpRight,
  ShieldCheck,
  CalendarCheck,
  RefreshCw,
  Activity,
  Zap,
  PhoneForwarded,
  Headphones,
  AlertCircle,
  AlertTriangle,
  PhoneOff,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CircularGauge } from '@/components/dashboard/circular-gauge';
import { ActivationChecklist } from '@/components/dashboard/activation-checklist';
import {
  CallVolumeAreaChart,
  ServiceDistributionDonut,
  RevenueRecoveryBarChart,
} from '@/components/dashboard/dashboard-charts';

export default function AppDashboardPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [callStats, setCallStats] = useState<CallStats | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallLog[]>([]);
  const [primaryPhone, setPrimaryPhone] = useState<BusinessPhoneNumber | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dispatch' | 'calls'>('dispatch');
  const [isVoiceTesterOpen, setIsVoiceTesterOpen] = useState(false);

  const loadDashboardData = useCallback(async () => {
    setLoadError(null);
    try {
      const [
        bizRes,
        custRes,
        leadRes,
        todayAptsRes,
        allAptsRes,
        callsStatsRes,
        callsListRes,
        phoneRes,
        subRes,
        overviewRes,
      ] = await Promise.allSettled([
        BusinessService.getMyBusiness(),
        CustomerService.getCustomerStats(),
        LeadService.getLeadStats(),
        AppointmentService.getTodayAppointments(),
        AppointmentService.getAppointments({ limit: 6 }),
        TelephonyService.getCallStats(),
        TelephonyService.getCalls({ limit: 6 }),
        TelephonyService.getPrimaryPhoneNumber(),
        BillingService.getSubscription(),
        DashboardService.getOverview(),
      ]);

      const value = <T,>(r: PromiseSettledResult<T>): T | null =>
        r.status === 'fulfilled' ? r.value : null;

      setBusiness(value(bizRes));
      setCustomerStats(value(custRes));
      setLeadStats(value(leadRes));
      setTodayAppointments(value(todayAptsRes) ?? []);
      setAllAppointments(value(allAptsRes)?.appointments ?? []);
      setCallStats(value(callsStatsRes));
      setRecentCalls(value(callsListRes)?.calls ?? []);
      setPrimaryPhone(value(phoneRes));
      setSubscription(value(subRes));
      setOverview(value(overviewRes));

      // Surface failures instead of swallowing them. The previous version used
      // `.catch(() => null)` on every call, so a broken API looked identical to
      // an account with no data.
      const failures = [bizRes, overviewRes].filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        setLoadError(
          toErrorMessage(
            (failures[0] as PromiseRejectedResult).reason,
            'Some dashboard data could not be loaded.'
          )
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  // Real counts only. Every `?? 5` / `|| 142` style fallback has been removed:
  // a new account now correctly reads zero instead of inventing activity.
  const totalCustomers = customerStats?.total ?? 0;
  const activeCustomers = customerStats?.active ?? 0;
  const totalLeads = leadStats?.total ?? 0;
  const activeLeads = leadStats?.active ?? 0;
  const inboundCalls = callStats?.inbound ?? 0;
  const appointmentsToday = todayAppointments.length;

  const kpis = overview?.kpis;
  const entitlement = overview?.entitlement;
  const activation = overview?.activation;

  const minutesAllocated = subscription?.minutesAllocated ?? entitlement?.minutesAllocated ?? 0;
  const minutesUsed = subscription?.minutesUsed ?? entitlement?.minutesUsed ?? 0;
  const minutesRemaining = Math.max(0, minutesAllocated - minutesUsed);

  const trialDaysLeft =
    entitlement?.status === 'trialing' && entitlement.trialEndsAt
      ? Math.max(
          0,
          Math.ceil((new Date(entitlement.trialEndsAt).getTime() - Date.now()) / 86_400_000)
        )
      : null;

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const formatStartTime = (dateStr?: string | Date) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  const formatTimeAgo = (dateStr?: string | Date) => {
    if (!dateStr) return '';
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diffMs / 60_000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins} min ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return '';
    }
  };

  const serviceArea = business?.serviceArea;
  const locationLabel = serviceArea?.primaryCity
    ? `${serviceArea.primaryCity}${serviceArea.state ? `, ${serviceArea.state}` : ''}${
        serviceArea.radiusMiles ? ` (${serviceArea.radiusMiles} mi zone)` : ''
      }`
    : null;

  // The AI can only answer calls when a number is connected AND the plan allows it.
  const receptionistLive = !!primaryPhone && entitlement?.allowed !== false;

  return (
    <DashboardShell
      title="Field Operations & AI Reception"
      subtitle="Live telemetry, dispatching, and contractor KPIs"
    >
      <div className="space-y-4 sm:space-y-5 w-full">
        {loadError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">{loadError}</p>
              <button
                type="button"
                onClick={handleManualRefresh}
                className="mt-1 font-semibold underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Top Control Bar */}
        <div className="bg-white border border-slate-200/90 rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {business?.businessType && (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {business.businessType}
                </span>
              )}

              {/* Honest status: reflects whether a number is actually connected
                  and the plan is active, instead of always claiming "Online". */}
              {receptionistLive ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                  AI Receptionist Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                  <PhoneOff className="w-3 h-3" aria-hidden="true" />
                  {primaryPhone ? 'Paused — check billing' : 'Not answering calls yet'}
                </span>
              )}

              {primaryPhone && (
                <span className="text-xs text-slate-600 font-medium">{primaryPhone.phoneNumber}</span>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                {business?.name ?? (loading ? '' : 'Your business')}
              </h2>
              {locationLabel && <span className="text-xs text-slate-500">{locationLabel}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <Button
              onClick={() => setIsVoiceTesterOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-3 rounded-xl shadow-xs gap-1.5 shrink-0"
            >
              <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
              Test call me
            </Button>

            <Button
              onClick={handleManualRefresh}
              disabled={refreshing}
              variant="outline"
              size="sm"
              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-8 px-2.5 shadow-xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1 text-slate-500 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {refreshing ? 'Syncing…' : 'Sync'}
            </Button>
          </div>
        </div>

        {/* Billing / entitlement notices */}
        {entitlement && !entitlement.allowed && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-bold">
                  {entitlement.reason === 'trial_expired'
                    ? 'Your free trial has ended'
                    : entitlement.reason === 'minutes_exhausted'
                      ? 'You have used all your AI voice minutes'
                      : 'Your subscription is not active'}
                </p>
                <p className="mt-0.5">
                  Inbound callers are being sent to voicemail until billing is updated.
                </p>
              </div>
            </div>
            <Link
              href="/app/billing"
              className="shrink-0 rounded-xl bg-rose-600 px-3 py-1.5 font-bold text-white hover:bg-rose-700"
            >
              Choose a plan
            </Link>
          </div>
        )}

        {entitlement?.status === 'trialing' && entitlement.allowed && trialDaysLeft !== null && (
          <div className="flex flex-col gap-2 rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-semibold">
              Free trial — {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left
              {minutesAllocated > 0 && ` · ${minutesRemaining} of ${minutesAllocated} AI minutes remaining`}
            </span>
            <Link href="/app/billing" className="shrink-0 font-bold underline underline-offset-2">
              Compare plans
            </Link>
          </div>
        )}

        {/* New-account activation checklist */}
        {activation && <ActivationChecklist activation={activation} />}

        {/* Primary KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/app/calls" className="group">
            <Card className="hover:border-slate-300 hover:shadow-xs transition-all bg-white border-slate-200/90">
              <CardContent className="py-2.5 px-3.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                    <PhoneCall className="w-3 h-3" aria-hidden="true" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Inbound Calls
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                    {loading ? '—' : inboundCalls}
                  </span>
                  <span className="flex items-center text-[10px] text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>Call history</span>
                    <ArrowUpRight className="w-3 h-3 ml-0.5" aria-hidden="true" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/app/appointments" className="group">
            <Card className="hover:border-slate-300 hover:shadow-xs transition-all bg-white border-slate-200/90">
              <CardContent className="py-2.5 px-3.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                    <Calendar className="w-3 h-3" aria-hidden="true" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Appointments Today
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                    {loading ? '—' : appointmentsToday}
                  </span>
                  <span className="flex items-center text-[10px] text-emerald-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>Schedule</span>
                    <ArrowUpRight className="w-3 h-3 ml-0.5" aria-hidden="true" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/app/leads" className="group">
            <Card className="hover:border-slate-300 hover:shadow-xs transition-all bg-white border-slate-200/90">
              <CardContent className="py-2.5 px-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                      <UserPlus className="w-3 h-3" aria-hidden="true" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Active Leads
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">({totalLeads} total)</span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                    {loading ? '—' : activeLeads}
                  </span>
                  <span className="flex items-center text-[10px] text-indigo-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>Pipeline</span>
                    <ArrowUpRight className="w-3 h-3 ml-0.5" aria-hidden="true" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/app/customers" className="group">
            <Card className="hover:border-slate-300 hover:shadow-xs transition-all bg-white border-slate-200/90">
              <CardContent className="py-2.5 px-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-md bg-sky-50 text-sky-600 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                      <Users className="w-3 h-3" aria-hidden="true" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Customers
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">({activeCustomers} active)</span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                    {loading ? '—' : totalCustomers}
                  </span>
                  <span className="flex items-center text-[10px] text-sky-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>CRM</span>
                    <ArrowUpRight className="w-3 h-3 ml-0.5" aria-hidden="true" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Measured operational gauges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CircularGauge
            title="Speed-to-Lead Response"
            subtitle="Time to first recovery SMS"
            value={kpis?.speedToLeadSeconds ?? null}
            maxValue={60}
            unit="s"
            gradientFrom="#10b981"
            gradientTo="#059669"
            icon={<Zap className="w-4 h-4 text-emerald-600" aria-hidden="true" />}
            trendText={
              kpis?.speedToLeadSeconds != null
                ? `Target under 60s`
                : 'No recovery campaigns in the last 30 days'
            }
            trendPositive={(kpis?.speedToLeadSeconds ?? 0) <= 60}
            emptyLabel="No data yet"
            loading={loading}
          />

          <CircularGauge
            title="AI Resolution Rate"
            subtitle="Calls booked, captured or answered"
            value={kpis?.aiResolutionRate ?? null}
            maxValue={100}
            unit="%"
            gradientFrom="#2563eb"
            gradientTo="#38bdf8"
            icon={<Bot className="w-4 h-4 text-blue-600" aria-hidden="true" />}
            trendText={
              kpis && kpis.totalCalls > 0
                ? `${kpis.resolvedCalls} of ${kpis.totalCalls} calls, last 30 days`
                : 'No calls in the last 30 days'
            }
            trendPositive={(kpis?.aiResolutionRate ?? 0) >= 80}
            emptyLabel="No calls yet"
            loading={loading}
          />

          <CircularGauge
            title="Voice Minutes Used"
            subtitle={
              subscription
                ? `${subscription.tier} plan · ${minutesAllocated} min included`
                : 'Plan allowance'
            }
            value={minutesAllocated > 0 ? minutesUsed : null}
            maxValue={Math.max(minutesAllocated, 1)}
            unit="m"
            gradientFrom="#6366f1"
            gradientTo="#8b5cf6"
            icon={<PhoneForwarded className="w-4 h-4 text-indigo-600" aria-hidden="true" />}
            trendText={
              minutesAllocated > 0
                ? `${minutesRemaining} min remaining`
                : 'No plan allowance configured'
            }
            trendPositive={minutesRemaining > 0}
            emptyLabel="No plan yet"
            loading={loading}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <CallVolumeAreaChart data={overview?.callVolume ?? []} loading={loading} />
          </div>
          <div className="lg:col-span-1">
            <ServiceDistributionDonut data={overview?.serviceDistribution ?? []} loading={loading} />
          </div>
        </div>

        {/* Dispatch & call stream */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" aria-hidden="true" />
                Dispatch &amp; Call Stream
              </h3>
              <p className="text-xs text-slate-500">
                Recent field dispatches and conversations handled by the AI receptionist.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Dispatch and calls"
              className="bg-slate-100 p-0.5 rounded-xl border border-slate-200 flex items-center text-xs font-semibold self-start sm:self-auto"
            >
              <button
                type="button"
                role="tab"
                id="tab-dispatch"
                aria-selected={activeTab === 'dispatch'}
                aria-controls="panel-dispatch"
                onClick={() => setActiveTab('dispatch')}
                className={`px-3.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'dispatch'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Appointments ({allAppointments.length})
              </button>
              <button
                type="button"
                role="tab"
                id="tab-calls"
                aria-selected={activeTab === 'calls'}
                aria-controls="panel-calls"
                onClick={() => setActiveTab('calls')}
                className={`px-3.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'calls'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Headphones className="w-3.5 h-3.5" aria-hidden="true" />
                Calls ({recentCalls.length})
              </button>
            </div>
          </div>

          {activeTab === 'dispatch' && (
            <div id="panel-dispatch" role="tabpanel" aria-labelledby="tab-dispatch" className="space-y-2.5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {allAppointments.length > 0 ? (
                  allAppointments.map((apt) => {
                    const cust = apt.customerId as any;
                    const custName =
                      cust?.firstName || cust?.lastName
                        ? `${cust.firstName ?? ''} ${cust.lastName ?? ''}`.trim()
                        : 'Customer';
                    const serviceTitle = apt.title || (apt as any).serviceType || 'Service visit';
                    const custAddress =
                      (apt as any).address ||
                      (cust?.address
                        ? `${cust.address.street ?? ''}${cust.address.city ? `, ${cust.address.city}` : ''}`.trim()
                        : null);
                    const tech = (apt as any).technicianName;

                    return (
                      <div
                        key={apt._id || (apt as any).id}
                        className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-slate-50 transition-colors flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 truncate">{custName}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0 truncate max-w-[170px]">
                              {serviceTitle}
                            </span>
                          </div>
                          {custAddress && <p className="text-xs text-slate-600 truncate">{custAddress}</p>}
                          {tech && <p className="text-[11px] text-slate-400">Tech: {tech}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono font-bold text-slate-900 block">
                            {formatStartTime(apt.startAt)}
                          </span>
                          {apt.status && (
                            <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 inline-block mt-1 uppercase">
                              {apt.status}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-2 py-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-xs text-slate-500">
                      {loading ? 'Loading appointments…' : 'No appointments yet.'}
                    </p>
                    <Link
                      href="/app/appointments"
                      className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Schedule an appointment
                    </Link>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end text-xs text-slate-500">
                <Link href="/app/appointments" className="font-semibold text-blue-600 hover:underline">
                  Open calendar &rarr;
                </Link>
              </div>
            </div>
          )}

          {activeTab === 'calls' && (
            <div id="panel-calls" role="tabpanel" aria-labelledby="tab-calls" className="space-y-2.5">
              {recentCalls.length > 0 ? (
                recentCalls.map((call) => {
                  const cust = (call as any).customerId as any;
                  const callerName =
                    (call as any).callerName ||
                    (cust?.firstName ? `${cust.firstName} ${cust.lastName ?? ''}`.trim() : call.from);
                  const outcome = (call as any).outcome as string | undefined;

                  return (
                    <div
                      key={call._id || (call as any).id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                          <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 truncate">{callerName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{call.from}</span>
                          </div>
                          {(call as any).summary && (
                            <p className="text-xs text-slate-600 font-medium truncate">
                              {(call as any).summary}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {outcome && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${
                              outcome === 'appointment_booked'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : outcome === 'missed_call' || outcome === 'hangup_or_spam'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {outcome.replace(/_/g, ' ')}
                          </span>
                        )}
                        <div className="text-right">
                          <span className="text-[11px] font-mono font-semibold text-slate-700 block">
                            {formatDuration(call.durationSeconds)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatTimeAgo(call.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-500">
                    {loading ? 'Loading calls…' : 'No calls recorded yet.'}
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end text-xs text-slate-500">
                <Link href="/app/calls" className="font-semibold text-blue-600 hover:underline">
                  Full call history &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Revenue + real telemetry */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <RevenueRecoveryBarChart data={overview?.revenueRecovery ?? []} loading={loading} />
          </div>

          <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  System &amp; Compliance Status
                </h3>
                <p className="text-xs text-slate-500">
                  Live telephony and reputation safeguards for this workspace.
                </p>
              </div>
              {kpis?.openEscalations ? (
                <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold">
                  {kpis.openEscalations} open escalation{kpis.openEscalations === 1 ? '' : 's'}
                </Badge>
              ) : (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                  No open escalations
                </Badge>
              )}
            </div>

            {/* Measured values only. Previously these four tiles were literal
                constants: "<280ms", "Enforced", "4.9 / 5.0", "Connected". */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-0.5">
                <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
                  Avg Voice Latency
                </span>
                <span className="text-sm sm:text-base font-black text-slate-900 block">
                  {kpis?.avgVoiceLatencyMs != null ? `${kpis.avgVoiceLatencyMs}ms` : '—'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {kpis?.avgVoiceLatencyMs != null ? 'Measured over recent calls' : 'No measured calls'}
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-0.5">
                <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
                  TCPA Quiet Hours
                </span>
                <span className="text-sm sm:text-base font-black text-slate-900 block">Enforced</span>
                <span className="text-[10px] text-slate-500 font-medium">8:00 AM – 9:00 PM local</span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-0.5">
                <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
                  Customer Rating
                </span>
                <span className="text-sm sm:text-base font-black text-slate-900 block">
                  {kpis?.avgReviewRating != null ? `${kpis.avgReviewRating} / 5.0` : '—'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {kpis?.reviewResponses
                    ? `${kpis.reviewResponses} response${kpis.reviewResponses === 1 ? '' : 's'}`
                    : 'No survey replies yet'}
                </span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-0.5">
                <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
                  Telephony
                </span>
                <span
                  className={`text-sm sm:text-base font-black block ${
                    kpis?.telephonyConnected ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {kpis?.telephonyConnected ? 'Connected' : 'Not connected'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Voice engine: {kpis?.voiceProvider ?? '—'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                {kpis?.shieldedNegativeCount
                  ? `${kpis.shieldedNegativeCount} negative review${
                      kpis.shieldedNegativeCount === 1 ? '' : 's'
                    } kept private`
                  : 'Negative feedback is routed privately to you'}
              </span>
              <Link href="/app/settings" className="font-semibold text-blue-600 hover:underline">
                Configure AI policies &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>

      <TestCallModal
        isOpen={isVoiceTesterOpen}
        onClose={() => setIsVoiceTesterOpen(false)}
        businessName={business?.name}
      />
    </DashboardShell>
  );
}
