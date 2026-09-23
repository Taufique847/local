'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import {
  MessageTemplateService,
  MessageTemplateRow,
  MessageTemplateType,
  MESSAGE_TYPE_LABELS,
  PolicyService,
  BusinessPolicy,
  POLICY_DEFAULTS,
} from '@/services/ai-config.service';
import { toErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  AlertCircle,
  Bell,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  RotateCcw,
  Save,
} from 'lucide-react';

/**
 * Notification settings.
 *
 * Two things an owner could not do before: see what the platform actually texts and
 * emails their customers, and change it. Feature #41 shipped as string literals in a
 * switch with no per-business copy anywhere.
 *
 * The screen is built around the shipped default rather than a blank box. A business
 * that never opens this page keeps the standard wording — which carries the
 * carrier-expected opt-out notice — and "revert" deletes the override rather than
 * blanking it, so going back to default really means no override exists.
 */

const CHANNEL_META = {
  sms: { label: 'Text message', icon: MessageSquare, accent: 'text-blue-600' },
  email: { label: 'Email', icon: Mail, accent: 'text-purple-600' },
} as const;

/** One editable row, keyed by type and channel. */
interface Draft {
  enabled: boolean;
  body: string;
  subject: string;
}

const draftKey = (type: string, channel: string) => `${type}:${channel}`;

export default function NotificationSettingsPage() {
  const toast = useToast();

  const [rows, setRows] = useState<MessageTemplateRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [policy, setPolicy] = useState<BusinessPolicy>(POLICY_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const load = useCallback(async () => {
    setError(null);

    // Settled, so a policy failure does not blank the template list and vice versa.
    const [tplRes, policyRes] = await Promise.allSettled([
      MessageTemplateService.list(),
      PolicyService.get(),
    ]);

    if (tplRes.status === 'fulfilled') {
      setRows(tplRes.value);
      const next: Record<string, Draft> = {};
      for (const row of tplRes.value) {
        next[draftKey(row.type, row.channel)] = {
          enabled: row.enabled,
          body: row.body,
          subject: row.subject,
        };
      }
      setDrafts(next);
    }

    if (policyRes.status === 'fulfilled') setPolicy(policyRes.value);

    const failed = [tplRes, policyRes].filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (failed.length) {
      setError(toErrorMessage(failed[0].reason, 'Could not load your notification settings.'));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  /** Types in a fixed, sensible order rather than whatever the API returned. */
  const grouped = useMemo(() => {
    const order: MessageTemplateType[] = [
      'appointment_confirmation',
      'appointment_reminder',
      'appointment_rescheduled',
      'appointment_cancelled',
      'estimate_sent',
      'invoice_issued',
      'payment_receipt',
      'missed_call_followup',
      'lead_followup',
    ];

    return order
      .map((type) => ({
        type,
        channels: rows.filter((r) => r.type === type),
      }))
      .filter((group) => group.channels.length > 0);
  }, [rows]);

  const updateDraft = (row: MessageTemplateRow, patch: Partial<Draft>) => {
    const key = draftKey(row.type, row.channel);
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const runPreview = async (row: MessageTemplateRow) => {
    const key = draftKey(row.type, row.channel);
    const draft = drafts[key];
    if (!draft?.body?.trim()) {
      // Nothing customised, so the preview is the shipped wording.
      setPreviews((prev) => ({ ...prev, [key]: row.defaultPreview }));
      return;
    }

    try {
      const res = await MessageTemplateService.preview({
        type: row.type,
        body: draft.body,
        subject: draft.subject,
      });
      setPreviews((prev) => ({
        ...prev,
        [key]: [res.previewSubject ? `Subject: ${res.previewSubject}` : '', res.preview]
          .filter(Boolean)
          .join('\n\n'),
      }));
    } catch (err) {
      toast.error('Could not render a preview', toErrorMessage(err, 'Please try again.'));
    }
  };

  const save = async (row: MessageTemplateRow) => {
    const key = draftKey(row.type, row.channel);
    const draft = drafts[key];
    setSavingKey(key);

    try {
      await MessageTemplateService.save({
        type: row.type,
        channel: row.channel,
        enabled: draft.enabled,
        body: draft.body,
        subject: row.channel === 'email' ? draft.subject : undefined,
      });
      toast.success('Saved', `${MESSAGE_TYPE_LABELS[row.type].title} updated.`);
      await load();
    } catch (err) {
      /**
       * Surfaced in full, because the useful rejections here are specific: an
       * unknown placeholder, or an SMS override that dropped the opt-out notice.
       * A generic "could not save" would leave the owner guessing.
       */
      toast.error('Not saved', toErrorMessage(err, 'Check the message and try again.'));
    } finally {
      setSavingKey(null);
    }
  };

  const revert = async (row: MessageTemplateRow) => {
    const key = draftKey(row.type, row.channel);
    setSavingKey(key);
    try {
      await MessageTemplateService.reset(row.type, row.channel);
      setPreviews((prev) => ({ ...prev, [key]: '' }));
      toast.success('Reverted', 'The standard wording is back in use.');
      await load();
    } catch (err) {
      toast.error('Could not revert', toErrorMessage(err, 'Please try again.'));
    } finally {
      setSavingKey(null);
    }
  };

  const savePolicy = async () => {
    setSavingPolicy(true);
    try {
      const saved = await PolicyService.update(policy);
      setPolicy((prev) => ({ ...prev, ...saved }));
      toast.success('Saved', 'Reminder timing updated.');
    } catch (err) {
      toast.error('Not saved', toErrorMessage(err, 'Please try again.'));
    } finally {
      setSavingPolicy(false);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Bell className="w-7 h-7 text-blue-600" />
            Customer Notifications
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Everything the assistant sends your customers. Leave a message untouched to keep the
            standard wording.
          </p>
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
            Loading…
          </div>
        ) : (
          <>
            {/* Reminder timing. Lives here because it only affects one of the
                notifications below, and this is where an owner looks for it. */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-sm font-bold text-slate-900">Reminder lead time</h2>
                </div>
                <span className="text-sm font-bold text-emerald-600">
                  {policy.reminderLeadHours ?? 24} hours before
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Reminders are held until 8:00 AM local time and never sent twice for the same
                appointment.
              </p>
              <input
                type="range"
                min={1}
                max={72}
                step={1}
                value={policy.reminderLeadHours ?? 24}
                aria-label="Reminder lead time in hours"
                onChange={(e) =>
                  setPolicy((p) => ({ ...p, reminderLeadHours: Number(e.target.value) }))
                }
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policy.appointmentRemindersEnabled !== false}
                    onChange={(e) =>
                      setPolicy((p) => ({ ...p, appointmentRemindersEnabled: e.target.checked }))
                    }
                    className="accent-emerald-600 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600">Send appointment reminders</span>
                </label>
                <Button size="sm" onClick={savePolicy} disabled={savingPolicy}>
                  {savingPolicy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Save timing
                </Button>
              </div>
            </section>

            {grouped.map((group) => {
              const meta = MESSAGE_TYPE_LABELS[group.type];
              return (
                <section
                  key={group.type}
                  className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
                >
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">{meta.title}</h2>
                    <p className="text-xs text-slate-500">{meta.when}</p>
                  </div>

                  <div className="space-y-4">
                    {group.channels.map((row) => {
                      const key = draftKey(row.type, row.channel);
                      const draft = drafts[key];
                      const channelMeta = CHANNEL_META[row.channel];
                      const Icon = channelMeta.icon;
                      const busy = savingKey === key;

                      if (!row.supported) {
                        /* Honest rather than hidden: an owner looking for an email
                           version of a speed-to-lead text should be told why there
                           isn't one, not left wondering. */
                        return (
                          <div
                            key={key}
                            className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 flex items-center gap-2"
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            {channelMeta.label} is not used for this notification — it is a
                            speed-to-lead message measured in seconds, and email is the wrong
                            channel for it.
                          </div>
                        );
                      }

                      return (
                        <div key={key} className="rounded-xl border border-slate-200 p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Icon className={`w-4 h-4 ${channelMeta.accent}`} />
                              <span className="text-xs font-bold text-slate-900">
                                {channelMeta.label}
                              </span>
                              {row.customised && (
                                <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                  Customised
                                </span>
                              )}
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={draft?.enabled ?? row.enabled}
                                onChange={(e) => updateDraft(row, { enabled: e.target.checked })}
                                className="accent-blue-600 cursor-pointer"
                              />
                              <span className="text-xs text-slate-600">Send this</span>
                            </label>
                          </div>

                          {/* The shipped wording, always visible. This is the
                              reference an owner is editing against. */}
                          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Standard wording
                            </p>
                            {row.defaultSubject && (
                              <p className="mt-1 text-[11px] font-semibold text-slate-600">
                                Subject: {row.defaultSubject}
                              </p>
                            )}
                            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                              {row.defaultPreview}
                            </p>
                          </div>

                          {row.channel === 'email' && (
                            <div className="space-y-1">
                              <label
                                htmlFor={`${key}-subject`}
                                className="text-[11px] font-semibold text-slate-600"
                              >
                                Your subject line (optional)
                              </label>
                              <input
                                id={`${key}-subject`}
                                type="text"
                                value={draft?.subject ?? ''}
                                placeholder="Leave blank to use the standard subject"
                                onChange={(e) => updateDraft(row, { subject: e.target.value })}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
                              />
                            </div>
                          )}

                          <div className="space-y-1">
                            <label
                              htmlFor={`${key}-body`}
                              className="text-[11px] font-semibold text-slate-600"
                            >
                              Your wording (optional)
                            </label>
                            <textarea
                              id={`${key}-body`}
                              rows={row.channel === 'sms' ? 3 : 6}
                              value={draft?.body ?? ''}
                              placeholder="Leave blank to use the standard wording"
                              onChange={(e) => updateDraft(row, { body: e.target.value })}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:border-blue-400 focus:outline-none"
                            />
                            {row.channel === 'sms' && (draft?.body?.length ?? 0) > 0 && (
                              <p className="text-[10px] text-slate-400">
                                {draft!.body.length} / 1600 characters
                              </p>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Available placeholders
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {row.variables.map((variable) => (
                                <button
                                  key={variable.name}
                                  type="button"
                                  title={variable.label}
                                  onClick={() =>
                                    updateDraft(row, {
                                      body: `${draft?.body ?? ''}{{${variable.name}}}`,
                                    })
                                  }
                                  className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-600 hover:border-blue-300 hover:text-blue-700"
                                >
                                  {`{{${variable.name}}}`}
                                </button>
                              ))}
                            </div>
                          </div>

                          {previews[key] && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                Preview with sample data
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-xs text-emerald-900">
                                {previews[key]}
                              </p>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => save(row)} disabled={busy}>
                              {busy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                              ) : (
                                <Save className="w-3.5 h-3.5 mr-1.5" />
                              )}
                              Save
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => runPreview(row)}
                              disabled={busy}
                            >
                              Preview
                            </Button>
                            {row.customised && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => revert(row)}
                                disabled={busy}
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                Use standard wording
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
