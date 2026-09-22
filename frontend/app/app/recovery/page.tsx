'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import {
  RecoveryService,
  RecoveryStats,
  RecoveryCampaign,
  RecoveryStatus,
} from '@/services/operations.service';
import { toErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  Zap,
  AlertCircle,
  Loader2,
  RefreshCw,
  Inbox,
  PhoneMissed,
  CalendarCheck,
  MessageSquare,
  Play,
} from 'lucide-react';

const STATUS_META: Record<RecoveryStatus, { label: string; className: string }> = {
  pending: { label: 'Queued', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  speed_to_lead_sent: {
    label: 'First text sent',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  drip_step_2_sent: {
    label: 'Follow-up 2 sent',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  drip_step_3_sent: {
    label: 'Final offer sent',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  recovered_booked: {
    label: 'Job booked',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  recovered_responded: {
    label: 'Customer replied',
    className: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  expired: { label: 'No response', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  opted_out: { label: 'Opted out', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

/**
 * Speed-to-lead recovery console.
 *
 * This is the module that recovers missed calls, and it previously had no UI
 * whatsoever — a contractor had no way to see whether the follow-ups were even
 * running, let alone which ones won work back.
 */
export default function RecoveryPage() {
  const toast = useToast();

  const [stats, setStats] = useState<RecoveryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStats(await RecoveryService.getStats());
    } catch (err) {
      setError(toErrorMessage(err, 'Could not load recovery campaigns.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleProcessNow = async () => {
    setProcessing(true);
    try {
      const count = await RecoveryService.processDripsNow();
      toast.success(
        count > 0 ? `${count} follow-up${count === 1 ? '' : 's'} sent` : 'Nothing was due',
        count > 0
          ? 'The next step went out for every campaign that was due.'
          : 'No campaigns were due for a follow-up right now.'
      );
      load();
    } catch (err) {
      toast.error('Could not run follow-ups', toErrorMessage(err));
    } finally {
      setProcessing(false);
    }
  };

  const campaigns: RecoveryCampaign[] = stats?.campaigns ?? [];
  const currency = (v: number) => `$${Math.round(v).toLocaleString()}`;

  const appointmentOf = (c: RecoveryCampaign) =>
    c.recoveredAppointmentId && typeof c.recoveredAppointmentId === 'object'
      ? c.recoveredAppointmentId
      : null;

  return (
    <DashboardShell
      title="Missed Call Recovery"
      subtitle="Automatic text follow-ups that win back callers you could not answer"
    >
      <div className="space-y-5">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Campaigns started',
              value: loading ? '—' : String(stats?.totalInitiated ?? 0),
              icon: PhoneMissed,
              tone: 'text-blue-600 bg-blue-50',
            },
            {
              label: 'Jobs won back',
              value: loading ? '—' : String(stats?.totalRecovered ?? 0),
              icon: CalendarCheck,
              tone: 'text-emerald-600 bg-emerald-50',
            },
            {
              label: 'Recovery rate',
              value: loading ? '—' : `${stats?.recoveryRate ?? 0}%`,
              icon: Zap,
              tone: 'text-indigo-600 bg-indigo-50',
            },
            {
              label: 'Estimated value',
              value: loading ? '—' : currency(stats?.estimatedRevenueSaved ?? 0),
              icon: CalendarCheck,
              tone: 'text-amber-600 bg-amber-50',
            },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-md ${kpi.tone}`}
                    aria-hidden="true"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {kpi.label}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-black leading-none tracking-tight text-slate-900">
                  {kpi.value}
                </p>
              </div>
            );
          })}
        </div>

        {/* Estimated value caveat — this is a modelled figure, not booked revenue. */}
        <p className="text-[11px] text-slate-500">
          Estimated value assumes an average job of $1,250 per recovered booking. Actual revenue
          appears on your invoices.
        </p>

        {/* Campaign list */}
        <section
          aria-labelledby="campaigns-heading"
          className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-5"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2
                id="campaigns-heading"
                className="flex items-center gap-2 text-sm font-bold text-slate-900"
              >
                <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
                Recent campaigns
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Follow-ups run automatically. Nothing is sent outside 8:00 AM – 9:00 PM local time.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleProcessNow}
                disabled={processing}
                className="h-8 border-slate-200 text-xs text-slate-700"
                title="Send any follow-ups that are already due, without waiting for the next scheduled run"
              >
                {processing ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                )}
                Run due follow-ups
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRefreshing(true);
                  load();
                }}
                disabled={refreshing}
                className="h-8 border-slate-200 text-xs text-slate-700"
              >
                <RefreshCw
                  className={`mr-1 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                Refresh
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 pt-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl bg-slate-100"
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                <Inbox className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold text-slate-600">No recovery campaigns yet</p>
              <p className="max-w-sm text-[11px] text-slate-400">
                When a caller hangs up or the AI cannot book them, a text goes out within about a
                minute and the campaign shows up here.
              </p>
              <Link
                href="/app/calls"
                className="mt-1 text-xs font-semibold text-blue-600 hover:underline"
              >
                View call history
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {campaigns.map((c) => {
                const meta = STATUS_META[c.status] ?? STATUS_META.pending;
                const appt = appointmentOf(c);
                const isOpen = expanded === c._id;

                return (
                  <li key={c._id} className="rounded-xl border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : c._id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-start justify-between gap-3 p-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {c.customerName || 'Unknown caller'}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {c.callerPhone}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.className}`}
                          >
                            {meta.label}
                          </span>
                        </div>

                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <MessageSquare className="h-3 w-3" aria-hidden="true" />
                          {c.messages?.length ?? 0} message
                          {(c.messages?.length ?? 0) === 1 ? '' : 's'}
                          {c.nextFollowUpAt && (
                            <>
                              {' · next '}
                              {new Date(c.nextFollowUpAt).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </>
                          )}
                        </p>

                        {appt && (
                          <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                            Booked for{' '}
                            {new Date(appt.startAt).toLocaleString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                      </div>

                      <span className="shrink-0 text-[10px] text-slate-400">
                        {new Date(c.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </button>

                    {isOpen && (c.messages?.length ?? 0) > 0 && (
                      <div className="space-y-2 border-t border-slate-100 p-3.5">
                        {c.messages.map((m, i) => (
                          <div
                            key={i}
                            className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                              m.direction === 'outbound'
                                ? 'ml-auto bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                            <p
                              className={`mt-1 text-[10px] ${
                                m.direction === 'outbound' ? 'text-blue-100' : 'text-slate-400'
                              }`}
                            >
                              {new Date(m.sentAt).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
