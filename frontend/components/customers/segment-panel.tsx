'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  SegmentService,
  Segment,
  CustomerFilter,
  CampaignResult,
  CAMPAIGN_REASON_LABELS,
  TagMatchMode,
} from '@/services/segment.service';
import { toErrorMessage } from '@/lib/api-client';
import { isOwner } from '@/types/auth';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  AlertCircle,
  Filter,
  Loader2,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';

/**
 * Saved customer segments, with counts and campaigns.
 *
 * Feature #13 had tags that were indexed, editable in the customer drawer and absent
 * from the list API's response, so there was nothing to filter on and no way to reach
 * a group of customers.
 *
 * Two things this screen is deliberate about:
 *
 *  - Counts come from the server on every read. A cached count next to a send button
 *    is how an operator texts a hundred people believing they were texting forty.
 *  - The audience is resolved per channel before sending, so an email campaign to a
 *    segment of 200 where 40 have no address shows 160 up front rather than reporting
 *    the shortfall afterwards.
 */

const TAG_MODE_LABELS: Record<TagMatchMode, string> = {
  any: 'has any of',
  all: 'has all of',
  none: 'has none of',
};

const emptyFilter = (): CustomerFilter => ({});

/** Plain-English summary of a stored filter, for the segment list. */
const describeFilter = (filter: CustomerFilter): string => {
  const parts: string[] = [];

  if (filter.tags?.length) {
    parts.push(`${TAG_MODE_LABELS[filter.tagMode ?? 'any']} ${filter.tags.join(', ')}`);
  }
  if (filter.status) parts.push(filter.status);
  if (filter.propertyType) parts.push(filter.propertyType);
  if (filter.minLifetimeValue !== undefined) parts.push(`spent $${filter.minLifetimeValue}+`);
  if (filter.maxLifetimeValue !== undefined) parts.push(`spent under $${filter.maxLifetimeValue}`);
  if (filter.neverServiced) parts.push('never serviced');
  if (filter.servicedBefore) {
    parts.push(`not serviced since ${new Date(filter.servicedBefore).toLocaleDateString()}`);
  }
  if (filter.servicedAfter) {
    parts.push(`serviced since ${new Date(filter.servicedAfter).toLocaleDateString()}`);
  }
  if (filter.equipmentBrand) parts.push(`${filter.equipmentBrand} equipment`);
  if (filter.search) parts.push(`matching "${filter.search}"`);

  return parts.join(' · ') || 'no conditions';
};

interface SegmentPanelProps {
  /**
   * Applies a segment to the customer list behind this panel.
   *
   * Receives the whole segment rather than just its filter, so the list can name what
   * it is showing. Deriving a label from the filter produced things like
   * "Showing the VIP, WINBACK segment" for a segment actually called "Overdue".
   */
  onApplySegment?: (segment: Segment) => void;
  /** Tags already in use, offered as suggestions in the builder. */
  knownTags?: string[];
}

export function SegmentPanel({ onApplySegment, knownTags = [] }: SegmentPanelProps) {
  const toast = useToast();
  const { user } = useAuth();
  const viewerIsOwner = isOwner(user);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [building, setBuilding] = useState(false);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState<CustomerFilter>(emptyFilter());
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [campaignFor, setCampaignFor] = useState<Segment | null>(null);
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<CampaignResult | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSegments(await SegmentService.list());
    } catch (err) {
      setError(toErrorMessage(err, 'Could not load your segments.'));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  /**
   * The live count for the draft filter, debounced.
   *
   * Server-side rather than counted in the browser, because the browser only holds
   * one page of customers — a client-side count would be capped at the page size and
   * quietly wrong for any segment bigger than that.
   */
  useEffect(() => {
    if (!building) return;

    const hasConditions = Object.keys(filter).length > 0;
    if (!hasConditions) {
      setLiveCount(null);
      return;
    }

    const timer = setTimeout(() => {
      void SegmentService.count(filter)
        .then(setLiveCount)
        .catch(() => setLiveCount(null));
    }, 400);

    return () => clearTimeout(timer);
  }, [building, filter]);

  const patch = (changes: Partial<CustomerFilter>) => {
    setFilter((current) => {
      const next = { ...current, ...changes };
      // Cleared fields are removed, not left as empty strings — the server treats an
      // empty filter as "match everyone" and refuses it, which is the behaviour we
      // want to reach honestly rather than by sending blanks.
      for (const [key, value] of Object.entries(next)) {
        if (value === '' || value === undefined || value === null) {
          delete (next as Record<string, unknown>)[key];
        }
        if (Array.isArray(value) && value.length === 0) {
          delete (next as Record<string, unknown>)[key];
        }
      }
      return next;
    });
  };

  const toggleTag = (tag: string) => {
    const current = filter.tags ?? [];
    patch({
      tags: current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await SegmentService.create({ name, filter });
      toast.success('Segment saved', `"${name}" is now in your list.`);
      setBuilding(false);
      setName('');
      setFilter(emptyFilter());
      setLiveCount(null);
      await load();
    } catch (err) {
      // Surfaced in full: the useful rejections are specific — a duplicate name, or a
      // filter with no conditions.
      toast.error('Not saved', toErrorMessage(err, 'Check the segment and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (segment: Segment) => {
    try {
      await SegmentService.remove(segment.id);
      toast.success('Deleted', `"${segment.name}" was removed.`);
      await load();
    } catch (err) {
      toast.error('Could not delete', toErrorMessage(err, 'Please try again.'));
    }
  };

  const send = async (dryRun: boolean) => {
    if (!campaignFor) return;
    setSending(true);
    try {
      const result = await SegmentService.sendCampaign(campaignFor.id, {
        channel,
        body,
        subject: channel === 'email' ? subject : undefined,
        dryRun,
      });
      setLastResult(result);

      if (dryRun) {
        toast.success(
          'Nothing sent',
          `${result.audience} customer${result.audience === 1 ? '' : 's'} would receive this.`
        );
      } else {
        toast.success(
          'Campaign sent',
          `${result.sent} of ${result.audience} received it.`
        );
        await load();
      }
    } catch (err) {
      toast.error('Not sent', toErrorMessage(err, 'Check the message and try again.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-blue-600" />
          Saved segments
        </h2>
        <Button variant="outline" size="sm" onClick={() => setBuilding((v) => !v)}>
          {building ? <X className="w-3.5 h-3.5 mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
          {building ? 'Cancel' : 'New segment'}
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

      {building && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Segment name, e.g. Maintenance plan due"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none"
          />

          {knownTags.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600">Tags</span>
                <select
                  value={filter.tagMode ?? 'any'}
                  onChange={(e) => patch({ tagMode: e.target.value as TagMatchMode })}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px]"
                >
                  {(Object.keys(TAG_MODE_LABELS) as TagMatchMode[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {TAG_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {knownTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                      filter.tags?.includes(tag)
                        ? 'border-blue-400 bg-blue-100 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">Spent at least ($)</span>
              <input
                type="number"
                min={0}
                value={filter.minLifetimeValue ?? ''}
                onChange={(e) =>
                  patch({
                    minLifetimeValue: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">
                Not serviced since
              </span>
              <input
                type="date"
                value={filter.servicedBefore?.slice(0, 10) ?? ''}
                onChange={(e) => patch({ servicedBefore: e.target.value || undefined })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">Equipment brand</span>
              <input
                type="text"
                value={filter.equipmentBrand ?? ''}
                onChange={(e) => patch({ equipmentBrand: e.target.value || undefined })}
                placeholder="e.g. Carrier"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">Property type</span>
              <select
                value={filter.propertyType ?? ''}
                onChange={(e) =>
                  patch({ propertyType: (e.target.value || undefined) as CustomerFilter['propertyType'] })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <option value="">Any</option>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(filter.neverServiced)}
              onChange={(e) => patch({ neverServiced: e.target.checked || undefined })}
              className="accent-blue-600 cursor-pointer"
            />
            <span className="text-[11px] text-slate-600">Never serviced only</span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Plus className="w-3.5 h-3.5 mr-1.5" />
              )}
              Save segment
            </Button>
            {liveCount !== null && (
              <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                {liveCount} customer{liveCount === 1 ? '' : 's'} match right now
              </span>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading segments…
        </div>
      ) : segments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
          No saved segments yet. Save a filter to reuse it and to message everyone in it.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {segments.map((segment) => (
            <li
              key={segment.id}
              className="rounded-xl border border-slate-200 bg-white p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{segment.name}</p>
                  <p className="text-[11px] text-slate-500">{describeFilter(segment.filter)}</p>
                </div>
                <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                  {segment.count}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {onApplySegment && (
                  <Button variant="outline" size="sm" onClick={() => onApplySegment(segment)}>
                    View
                  </Button>
                )}
                {/* Sending is owner-only on the server; hidden rather than shown to
                    fail for anyone else. */}
                {viewerIsOwner && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCampaignFor(segment);
                      setLastResult(null);
                      setBody('');
                      setSubject('');
                    }}
                    disabled={segment.count === 0}
                    title={segment.count === 0 ? 'Nobody matches this segment' : undefined}
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Message
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => remove(segment)}>
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                </Button>
              </div>

              {segment.lastCampaignAt && (
                <p className="text-[10px] text-slate-400">
                  Last messaged {new Date(segment.lastCampaignAt).toLocaleDateString()}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {campaignFor && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Message “{campaignFor.name}”
              </p>
              <p className="text-[11px] text-slate-600">
                {campaignFor.count} customer{campaignFor.count === 1 ? '' : 's'} in this segment.
                Nothing sends outside 8:00 AM–9:00 PM local time. On text, anyone who
                replied STOP is skipped; on email, anyone who unsubscribed is skipped —
                these are separate consents, so opting out of one does not opt out of the
                other. Use <span className="font-semibold">Check audience</span> to see the
                real number for the channel you picked.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setCampaignFor(null)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex gap-1.5">
            {(['sms', 'email'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setChannel(option)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                  channel === option
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {option === 'sms' ? 'Text message' : 'Email'}
              </button>
            ))}
          </div>

          {channel === 'email' && (
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          )}

          <textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              channel === 'sms'
                ? 'Spring tune-up special this month. Reply STOP to unsubscribe.'
                : 'Write your message…'
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
          />

          {/* Stated before they hit send, not after the server rejects it. */}
          {channel === 'sms' && (
            <p className="text-[11px] text-amber-800">
              A campaign text must tell people how to opt out — include the word STOP.
              {body.length > 0 && ` ${body.length} / 1600 characters.`}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => send(true)}
              disabled={sending || !body.trim()}
            >
              Check audience
            </Button>
            <Button size="sm" onClick={() => send(false)} disabled={sending || !body.trim()}>
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1.5" />
              )}
              Send to {campaignFor.count}
            </Button>
          </div>

          {lastResult && (
            <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] text-slate-700 space-y-1">
              <p className="font-semibold">
                {lastResult.dryRun
                  ? `${lastResult.audience} would receive this. Nothing was sent.`
                  : `${lastResult.sent} sent · ${lastResult.skipped} skipped · ${lastResult.failed} failed`}
              </p>
              {/* Per-reason, so "why did only 38 of 42 get it" has an answer. */}
              {Object.entries(lastResult.reasons).map(([reason, count]) => (
                <p key={reason} className="text-slate-500">
                  {count} × {CAMPAIGN_REASON_LABELS[reason] ?? reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
