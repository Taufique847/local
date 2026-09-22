'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { MessageService, MessageLog } from '@/services/operations.service';
import { toErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  MessageSquare,
  Send,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  Loader2,
  RefreshCw,
  Inbox,
  ShieldCheck,
} from 'lucide-react';

const DIRECTION_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'inbound', label: 'Received' },
  { id: 'outbound', label: 'Sent' },
] as const;

const STATUS_STYLES: Record<string, string> = {
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  received: 'bg-slate-100 text-slate-600 border-slate-200',
  queued: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  undelivered: 'bg-rose-50 text-rose-700 border-rose-200',
};

/**
 * SMS activity log and manual send.
 *
 * The backend has exposed /api/messages since the communication module was
 * built, but there was no UI for it at all — contractors could not see what the
 * AI had texted their customers, which is both an operational and a compliance
 * problem (TCPA opt-outs are recorded here).
 */
export default function MessagesPage() {
  const toast = useToast();

  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all');

  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { messages: list } = await MessageService.list({ limit: 100, direction });
      setMessages(list);
    } catch (err) {
      setError(toErrorMessage(err, 'Could not load your message history.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [direction]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim() || !body.trim()) return;

    setSending(true);
    try {
      await MessageService.send({ to: to.trim(), body: body.trim() });
      setBody('');
      toast.success('Message sent', 'It will appear in the log once the carrier confirms it.');
      load();
    } catch (err) {
      // A TCPA quiet-hours block or an opt-out surfaces here as a clear reason.
      toast.error('Not sent', toErrorMessage(err, 'The message could not be sent.'));
    } finally {
      setSending(false);
    }
  };

  const customerName = (message: MessageLog): string | null => {
    const c = message.customerId;
    if (!c || typeof c === 'string') return null;
    const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    return name || null;
  };

  return (
    <DashboardShell
      title="Messages"
      subtitle="Every text your AI and your team have sent or received"
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

        {/* Compose */}
        <section
          aria-labelledby="compose-heading"
          className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Send className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <h2 id="compose-heading" className="text-sm font-bold text-slate-900">
              Send a text
            </h2>
          </div>

          <form onSubmit={handleSend} className="mt-4 space-y-3" noValidate>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
              <div>
                <label htmlFor="msg-to" className="mb-1 block text-xs font-semibold text-slate-700">
                  To
                </label>
                <Input
                  id="msg-to"
                  type="tel"
                  inputMode="tel"
                  placeholder="(312) 555-0199"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="msg-body"
                  className="mb-1 block text-xs font-semibold text-slate-700"
                >
                  Message
                </label>
                <textarea
                  id="msg-body"
                  rows={2}
                  maxLength={1600}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi, your technician is on the way."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                Blocked automatically outside 8:00 AM – 9:00 PM local, and for anyone who replied
                STOP.
              </p>
              <Button
                type="submit"
                disabled={sending || !to.trim() || !body.trim()}
                className="h-9 gap-1.5 bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Send
              </Button>
            </div>
          </form>
        </section>

        {/* Log */}
        <section
          aria-labelledby="log-heading"
          className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-5"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <h2 id="log-heading" className="text-sm font-bold text-slate-900">
                Message history
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div
                role="tablist"
                aria-label="Filter by direction"
                className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold"
              >
                {DIRECTION_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={direction === f.id}
                    onClick={() => setDirection(f.id)}
                    className={`rounded-lg px-2.5 py-1 transition-all ${
                      direction === f.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
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
                <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                <Inbox className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold text-slate-600">No messages yet</p>
              <p className="max-w-xs text-[11px] text-slate-400">
                Texts appear here once the AI follows up on a missed call, or when you send one
                above.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {messages.map((m) => {
                const inbound = m.direction === 'inbound';
                const name = customerName(m);

                return (
                  <li
                    key={m._id}
                    className={`rounded-xl border p-3.5 ${
                      inbound ? 'border-slate-200 bg-slate-50/60' : 'border-blue-100 bg-blue-50/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                            inbound
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                          aria-hidden="true"
                        >
                          {inbound ? (
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          )}
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {name || (inbound ? m.from : m.to)}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {inbound ? m.from : m.to}
                            </span>
                            {m.type && m.type !== 'custom' && (
                              <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                                {m.type.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-700">
                            {m.body}
                          </p>

                          {/*
                            A failed send used to be indistinguishable from a
                            delivered one, so nobody knew why a customer never
                            replied. The reason is now stated inline.
                          */}
                          {m.status === 'failed' && (
                            <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-800">
                              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                              <span>
                                <span className="font-semibold">Not delivered.</span>{' '}
                                {m.errorCode === 'telephony_not_configured'
                                  ? 'Telephony is not configured on this server, so nothing was sent to the carrier.'
                                  : m.errorMessage || 'The carrier rejected this message.'}
                                {m.errorCode && m.errorCode !== 'telephony_not_configured' && (
                                  <span className="ml-1 font-mono text-[10px] text-rose-600">
                                    ({m.errorCode})
                                  </span>
                                )}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span
                          className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            STATUS_STYLES[m.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {m.status}
                        </span>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {new Date(m.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
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
