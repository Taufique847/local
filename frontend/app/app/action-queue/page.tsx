'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import {
  MessageService,
  MessageLog,
  RescheduleRequestService,
  RescheduleRequestItem,
} from '@/services/operations.service';
import { toErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  AlertCircle,
  CalendarClock,
  Check,
  Inbox,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  X,
} from 'lucide-react';

/**
 * Everything waiting on a human.
 *
 * Two queues that did not exist and needed to:
 *
 *  - **Reschedule requests.** A customer replying `R` to a reminder now opens a
 *    request with real alternative slots. Applying one goes through the same
 *    reschedule endpoint the calendar uses, so the booking lock, conflict
 *    re-check, opening-hours check and reschedule history all still apply.
 *  - **Unanswered messages.** An inbound SMS that matched no keyword, no rating
 *    and no recovery intent used to be logged and dropped: no reply to the
 *    customer, and nothing telling the owner a question had been asked. It is now
 *    flagged on arrival and cleared only when a handler answers it, so anything
 *    left here is genuinely unanswered.
 *
 * Deliberately one screen. Two separate pages would each be empty most of the
 * time, and a queue nobody opens is the problem this is fixing.
 */

const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const customerName = (
  value: RescheduleRequestItem['customerId'] | MessageLog['customerId']
): string => {
  if (!value || typeof value === 'string') return 'Unknown customer';
  const name = [value.firstName, value.lastName].filter(Boolean).join(' ').trim();
  return name || value.phone || 'Unknown customer';
};

export default function ActionQueuePage() {
  const toast = useToast();

  const [requests, setRequests] = useState<RescheduleRequestItem[]>([]);
  const [unanswered, setUnanswered] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Id of the row currently being acted on, so only its own buttons spin. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    // Settled, not all: one failing queue must not blank the other.
    const [reqRes, msgRes] = await Promise.allSettled([
      RescheduleRequestService.list('pending'),
      MessageService.needsAttention(),
    ]);

    if (reqRes.status === 'fulfilled') setRequests(reqRes.value.requests);
    if (msgRes.status === 'fulfilled') setUnanswered(msgRes.value.messages);

    const failed = [reqRes, msgRes].filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (failed.length) {
      setError(toErrorMessage(failed[0].reason, 'Could not load your action queue.'));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const applyRequest = async (request: RescheduleRequestItem, startAt: string, endAt?: string) => {
    setBusyId(request._id);
    try {
      await RescheduleRequestService.apply(request._id, startAt, endAt);
      toast.success('Appointment moved', 'The customer has been notified of the new time.');
      await load();
    } catch (err) {
      // Surfaced, not swallowed: a 409 here means the slot was taken or is outside
      // opening hours, and the owner needs to pick again.
      toast.error('Could not move it', toErrorMessage(err, 'The new time was rejected.'));
    } finally {
      setBusyId(null);
    }
  };

  const dismissRequest = async (request: RescheduleRequestItem) => {
    setBusyId(request._id);
    try {
      await RescheduleRequestService.dismiss(request._id);
      toast.success('Request dismissed', 'It is off your queue. The appointment is unchanged.');
      await load();
    } catch (err) {
      toast.error('Could not dismiss it', toErrorMessage(err, 'Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  const resolveMessage = async (message: MessageLog) => {
    setBusyId(message._id);
    try {
      await MessageService.resolveAttention(message._id);
      toast.success('Marked as handled', 'It will not show up here again.');
      await load();
    } catch (err) {
      toast.error('Could not mark it handled', toErrorMessage(err, 'Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  const total = requests.length + unanswered.length;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Inbox className="w-7 h-7 text-blue-600" />
              Action Queue
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Customer replies the assistant could not finish on its own. {total === 0
                ? 'Nothing is waiting.'
                : `${total} item${total === 1 ? '' : 's'} waiting.`}
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing || loading}>
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading your queue…
          </div>
        ) : (
          <>
            {/* ---------------------------------------------------------------- */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-amber-600" />
                Reschedule requests
                {requests.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {requests.length}
                  </span>
                )}
              </h2>

              {requests.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
                  No customer has asked to move an appointment.
                </p>
              ) : (
                <ul className="space-y-3">
                  {requests.map((request) => {
                    const busy = busyId === request._id;
                    return (
                      <li
                        key={request._id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {customerName(request.customerId)}
                            </p>
                            <p className="text-xs text-slate-500">
                              Currently {formatWhen(request.originalStartAt)}
                              {request.appointmentId?.title ? ` · ${request.appointmentId.title}` : ''}
                            </p>
                            {request.requestText && (
                              <p className="mt-1 text-xs italic text-slate-500">
                                They texted: “{request.requestText}”
                              </p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => dismissRequest(request)}
                            disabled={busy}
                          >
                            <X className="w-3.5 h-3.5 mr-1.5" />
                            Dismiss
                          </Button>
                        </div>

                        {request.offeredSlots.length === 0 ? (
                          /* Honest about it: no slots were open when they asked, so
                             the customer was told someone would call. */
                          <p className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                            No openings were available when they asked, so they were told you would
                            be in touch. Move the appointment from the calendar instead.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Times offered to the customer
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {request.offeredSlots.map((slot) => (
                                <Button
                                  key={slot.startAt}
                                  size="sm"
                                  onClick={() => applyRequest(request, slot.startAt, slot.endAt)}
                                  disabled={busy}
                                >
                                  {busy ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5 mr-1.5" />
                                  )}
                                  {formatWhen(slot.startAt)}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ---------------------------------------------------------------- */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquareWarning className="w-4 h-4 text-rose-600" />
                Unanswered messages
                {unanswered.length > 0 && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                    {unanswered.length}
                  </span>
                )}
              </h2>

              {unanswered.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
                  Every inbound message has been handled.
                </p>
              ) : (
                <ul className="space-y-3">
                  {unanswered.map((message) => {
                    const busy = busyId === message._id;
                    return (
                      <li
                        key={message._id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {customerName(message.customerId)}{' '}
                            <span className="font-normal text-slate-400">{message.from}</span>
                          </p>
                          <p className="mt-1 text-sm text-slate-700 break-words">{message.body}</p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {formatWhen(message.createdAt)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resolveMessage(message)}
                          disabled={busy}
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          ) : (
                            <Check className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          Mark handled
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
