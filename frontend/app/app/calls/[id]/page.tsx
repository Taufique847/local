'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TelephonyService } from '@/services/telephony.service';
import { CallLog, CallStatus } from '@/types/telephony';
import { Button } from '@/components/ui/button';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  User,
  ChevronLeft,
  Loader2,
  AlertCircle,
  MapPin,
  Mail,
  Phone,
  FileText,
  Bot,
  Hash,
} from 'lucide-react';

const STATUS_BADGES: Record<CallStatus, string> = {
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ringing: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  initiated: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  busy: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  no_answer: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  cancelled: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

export default function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const callId = resolvedParams.id;

  const [call, setCall] = useState<CallLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCall() {
      setLoading(true);
      try {
        const data = await TelephonyService.getCallById(callId);
        setCall(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load call details');
      } finally {
        setLoading(false);
      }
    }

    fetchCall();
  }, [callId]);

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <DashboardShell>
        <div className="py-32 flex flex-col items-center justify-center gap-3 text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm">Loading call details...</p>
        </div>
      </DashboardShell>
    );
  }

  if (error || !call) {
    return (
      <DashboardShell>
        <div className="max-w-xl mx-auto py-16 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-semibold text-neutral-100">Call Record Not Found</h2>
          <p className="text-sm text-neutral-400">{error || 'Unable to find call record.'}</p>
          <Link href="/app/calls">
            <Button variant="outline" className="mt-4">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Calls
            </Button>
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const cust = call.customerId as any;

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app/calls"
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
                  {call.direction === 'inbound' ? (
                    <PhoneIncoming className="w-5 h-5 text-blue-400" />
                  ) : (
                    <PhoneOutgoing className="w-5 h-5 text-emerald-400" />
                  )}
                  {call.from}
                </h1>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border uppercase ${
                    STATUS_BADGES[call.status] || 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {call.status.replace('_', ' ')}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 uppercase">
                  {call.direction}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Called {call.to} &bull; Duration {formatDuration(call.durationSeconds)}
              </p>
            </div>
          </div>
        </div>

        {/* 2-Column Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Call Metadata & AI Handoff Preview */}
          <div className="space-y-6">
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
              <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                Telephony Session Details
              </h3>

              <div className="space-y-3 pt-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-neutral-800">
                  <span className="text-neutral-500">Provider</span>
                  <span className="font-semibold text-neutral-200 capitalize">{call.provider}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-800">
                  <span className="text-neutral-500">Call SID</span>
                  <span className="font-mono text-neutral-300">{call.providerCallSid}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-neutral-800">
                  <span className="text-neutral-500">Started At</span>
                  <span className="text-neutral-200">{formatDateTime(call.startedAt)}</span>
                </div>
                {call.endedAt && (
                  <div className="flex justify-between py-1.5 border-b border-neutral-800">
                    <span className="text-neutral-500">Ended At</span>
                    <span className="text-neutral-200">{formatDateTime(call.endedAt)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5">
                  <span className="text-neutral-500">Duration</span>
                  <span className="font-semibold text-neutral-100">
                    {formatDuration(call.durationSeconds)}
                  </span>
                </div>
              </div>
            </div>

            {/* Conversation / AI Realtime Placeholder */}
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-3">
              <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                <Bot className="w-4 h-4 text-sky-400" />
                AI Voice Conversation
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Real-time audio streaming and live conversational transcripts will connect in
                Milestone 10 (AI Voice Agent) and Milestone 14 (Conversations &amp; Transcripts).
              </p>
              <div className="p-3.5 rounded-xl bg-neutral-800/40 border border-neutral-800 text-neutral-500 text-xs text-center italic">
                Telephony session captured successfully. Awaiting M10 AI Realtime Voice engine.
              </div>
            </div>
          </div>

          {/* Right Column: Customer Match & Staff Notes */}
          <div className="space-y-6">
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
              <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-400" />
                Caller Identification
              </h3>

              {cust ? (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-base text-neutral-100">
                      {cust.firstName} {cust.lastName}
                    </div>
                    <Link href={`/app/customers/${cust._id || cust.id}`}>
                      <span className="text-xs text-blue-400 hover:underline">View CRM Profile &rarr;</span>
                    </Link>
                  </div>

                  <div className="space-y-2 text-xs text-neutral-300">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-neutral-500" />
                      <a href={`tel:${cust.phone}`} className="hover:text-blue-400">
                        {cust.phone}
                      </a>
                    </div>
                    {cust.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-neutral-500" />
                        <a href={`mailto:${cust.email}`} className="hover:text-blue-400">
                          {cust.email}
                        </a>
                      </div>
                    )}
                    {cust.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                        <span>
                          {cust.address.street && `${cust.address.street}, `}
                          {cust.address.city && `${cust.address.city}, `}
                          {cust.address.state} {cust.address.zip}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-neutral-500 space-y-2">
                  <p>Unknown caller — not currently in your customer directory.</p>
                  <p className="text-[11px] text-neutral-600">
                    Caller phone: {call.from}
                  </p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-3">
              <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-neutral-400" />
                Call Notes
              </h3>
              <p className="p-3 bg-neutral-800/60 rounded-xl text-xs text-neutral-300 border border-neutral-800">
                {call.notes || 'No notes recorded for this call.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
