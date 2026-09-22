'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import {
  ReviewService,
  ReputationStats,
  ReviewCampaign,
} from '@/services/operations.service';
import { toErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useDialog } from '@/lib/use-dialog';
import {
  Star,
  ShieldAlert,
  AlertCircle,
  Loader2,
  RefreshCw,
  Inbox,
  CheckCircle2,
  Clock,
  X,
  ExternalLink,
} from 'lucide-react';

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: 'Survey queued', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  survey_sent: { label: 'Awaiting reply', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  positive_redirected: {
    label: 'Sent to Google',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  negative_shielded: {
    label: 'Kept private',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  resolved: { label: 'Resolved', className: 'bg-teal-50 text-teal-700 border-teal-200' },
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'negative_shielded', label: 'Needs attention' },
  { id: 'positive_redirected', label: 'Happy customers' },
  { id: 'survey_sent', label: 'Awaiting reply' },
  { id: 'resolved', label: 'Resolved' },
] as const;

function Stars({ rating }: { rating?: number }) {
  if (!rating) return <span className="text-[11px] text-slate-400">No rating yet</span>;

  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
          }`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/**
 * Reputation management.
 *
 * The backend has shielded negative reviews and tracked a 24-hour resolution SLA
 * for a while, but the only UI was a read-only stats tile buried in settings —
 * so an owner had no way to actually see or resolve an escalated complaint,
 * which is the entire point of shielding it.
 */
export default function ReviewsPage() {
  const toast = useToast();

  const [stats, setStats] = useState<ReputationStats | null>(null);
  const [campaigns, setCampaigns] = useState<ReviewCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');

  const [resolving, setResolving] = useState<ReviewCampaign | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [savingResolution, setSavingResolution] = useState(false);

  const closeResolveDialog = useCallback(() => {
    setResolving(null);
    setResolutionNotes('');
  }, []);

  const dialogRef = useDialog<HTMLDivElement>({
    isOpen: resolving !== null,
    onClose: closeResolveDialog,
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statsData, list] = await Promise.all([ReviewService.getStats(), ReviewService.list()]);
      setStats(statsData);
      setCampaigns(list);
    } catch (err) {
      setError(toErrorMessage(err, 'Could not load your review activity.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (filter === 'all' ? campaigns : campaigns.filter((c) => c.status === filter)),
    [campaigns, filter]
  );

  const needsAttention = useMemo(
    () => campaigns.filter((c) => c.status === 'negative_shielded'),
    [campaigns]
  );

  const handleResolve = async () => {
    if (!resolving || resolutionNotes.trim().length < 3) return;

    setSavingResolution(true);
    try {
      await ReviewService.resolve(resolving._id, resolutionNotes.trim());
      toast.success('Marked resolved', 'This complaint is closed out and off your SLA list.');
      closeResolveDialog();
      load();
    } catch (err) {
      toast.error('Could not save', toErrorMessage(err));
    } finally {
      setSavingResolution(false);
    }
  };

  const hoursLeft = (deadline?: string): number | null => {
    if (!deadline) return null;
    return Math.round((new Date(deadline).getTime() - Date.now()) / 3_600_000);
  };

  return (
    <DashboardShell
      title="Reviews & Reputation"
      subtitle="Happy customers go to Google. Unhappy ones come straight to you."
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

        {/* Escalations first — these are time-boxed by the SLA. */}
        {needsAttention.length > 0 && (
          <section
            aria-labelledby="attention-heading"
            className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 sm:p-5"
          >
            <h2
              id="attention-heading"
              className="flex items-center gap-2 text-sm font-bold text-rose-900"
            >
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              {needsAttention.length} customer{needsAttention.length === 1 ? '' : 's'} need a call
              back
            </h2>
            <p className="mt-0.5 text-xs text-rose-800">
              These ratings were kept off Google. Call them, fix it, then mark it resolved.
            </p>

            <ul className="mt-3 space-y-2">
              {needsAttention.map((c) => {
                const left = hoursLeft(c.slaDeadlineAt);
                return (
                  <li
                    key={c._id}
                    className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {c.customerName || c.customerPhone}
                        </span>
                        <Stars rating={c.rating} />
                        {c.slaBreached ? (
                          <span className="rounded-md border border-rose-300 bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-800">
                            Overdue
                          </span>
                        ) : left !== null ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {left}h left
                          </span>
                        ) : null}
                      </div>
                      {c.feedbackText && (
                        <p className="mt-1 break-words text-xs italic text-slate-600">
                          “{c.feedbackText}”
                        </p>
                      )}
                      <a
                        href={`tel:${c.customerPhone.replace(/[^\d+]/g, '')}`}
                        className="mt-1 inline-block font-mono text-[11px] font-semibold text-blue-600 hover:underline"
                      >
                        {c.customerPhone}
                      </a>
                    </div>

                    <Button
                      type="button"
                      onClick={() => setResolving(c)}
                      className="h-8 shrink-0 bg-slate-900 text-xs font-bold text-white hover:bg-slate-800"
                    >
                      Mark resolved
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Average rating',
              value:
                loading || !stats?.totalResponses
                  ? '—'
                  : `${stats.averageRating.toFixed(1)} / 5`,
              hint: stats?.totalResponses
                ? `${stats.totalResponses} response${stats.totalResponses === 1 ? '' : 's'}`
                : 'No replies yet',
            },
            {
              label: 'Surveys sent',
              value: loading ? '—' : String(stats?.totalSurveysSent ?? 0),
              hint: stats?.responseRate ? `${stats.responseRate}% replied` : 'Awaiting replies',
            },
            {
              label: 'Sent to Google',
              value: loading ? '—' : String(stats?.positiveRedirectedCount ?? 0),
              hint: '4 and 5 star ratings',
            },
            {
              label: 'Kept private',
              value: loading ? '—' : String(stats?.negativeShieldedCount ?? 0),
              hint: '1 to 3 star ratings',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs"
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {kpi.label}
              </span>
              <p className="mt-1.5 text-2xl font-black leading-none tracking-tight text-slate-900">
                {kpi.value}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{kpi.hint}</p>
            </div>
          ))}
        </div>

        {/* All campaigns */}
        <section
          aria-labelledby="campaigns-heading"
          className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-5"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <h2
              id="campaigns-heading"
              className="flex items-center gap-2 text-sm font-bold text-slate-900"
            >
              <Star className="h-4 w-4 text-amber-500" aria-hidden="true" />
              Survey activity
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <div
                role="tablist"
                aria-label="Filter reviews"
                className="flex flex-wrap items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold"
              >
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={`rounded-lg px-2.5 py-1 transition-all ${
                      filter === f.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

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
                  className="h-16 animate-pulse rounded-xl bg-slate-100"
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                <Inbox className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold text-slate-600">
                {campaigns.length === 0 ? 'No surveys sent yet' : 'Nothing matches that filter'}
              </p>
              {campaigns.length === 0 && (
                <p className="max-w-sm text-[11px] text-slate-400">
                  A rating request goes out about two hours after each job is marked complete.
                </p>
              )}
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {filtered.map((c) => {
                const meta = STATUS_META[c.status] ?? STATUS_META.pending;
                return (
                  <li key={c._id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {c.customerName || c.customerPhone}
                        </span>
                        <Stars rating={c.rating} />
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {c.technicianName && (
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Technician: {c.technicianName}
                        </p>
                      )}
                      {c.feedbackText && (
                        <p className="mt-1 break-words text-xs italic text-slate-600">
                          “{c.feedbackText}”
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-slate-400">
                        {new Date(c.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      {c.googleReviewUrl && c.status === 'positive_redirected' && (
                        <a
                          href={c.googleReviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                        >
                          Google link
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Resolve dialog */}
      {resolving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={closeResolveDialog}
            aria-hidden="true"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolve-title"
            className="relative z-10 w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="resolve-title" className="text-base font-bold text-slate-900">
                  Mark this resolved
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {resolving.customerName || resolving.customerPhone}
                  {resolving.rating ? ` · ${resolving.rating} star` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeResolveDialog}
                aria-label="Close"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div>
              <label
                htmlFor="resolution-notes"
                className="mb-1 block text-xs font-semibold text-slate-700"
              >
                What did you do to fix it?
              </label>
              <textarea
                id="resolution-notes"
                rows={4}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Called the customer, sent Dave back out Thursday at no charge, they were happy."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Saved to the customer record as your audit trail.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeResolveDialog}
                className="border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleResolve}
                disabled={savingResolution || resolutionNotes.trim().length < 3}
                className="gap-1.5 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
              >
                {savingResolution ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Mark resolved
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
