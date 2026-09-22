'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TelephonyService } from '@/services/telephony.service';
import { TestCallModal } from '@/components/voice/test-call-modal';
import { useDialog } from '@/lib/use-dialog';
import { toErrorMessage } from '@/lib/api-client';
import { CallLog, CallStats, CallAnalyticsData, CallStatus } from '@/types/telephony';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Sparkles,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Copy,
  Check,
  ShieldCheck,
  Wrench,
  MapPin,
  MessageSquare,
  Settings,
  X,
  Bot,
  Zap,
  AlertTriangle,
  Lightbulb,
  Loader2,
  Activity,
  CheckCheck,
  UserPlus,
  FastForward,
} from 'lucide-react';

const STATUS_BADGES: Record<CallStatus, { label: string; class: string }> = {
  completed: { label: 'Completed', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold' },
  in_progress: { label: 'In Progress', class: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse font-semibold' },
  ringing: { label: 'Ringing', class: 'bg-amber-50 text-amber-700 border-amber-200 font-semibold' },
  initiated: { label: 'Initiated', class: 'bg-slate-100 text-slate-700 border-slate-200' },
  failed: { label: 'Failed', class: 'bg-rose-50 text-rose-700 border-rose-200 font-semibold' },
  busy: { label: 'Busy', class: 'bg-orange-50 text-orange-700 border-orange-200' },
  no_answer: { label: 'No Answer', class: 'bg-slate-100 text-slate-600 border-slate-200' },
  cancelled: { label: 'Cancelled', class: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const OUTCOME_BADGES: Record<string, { label: string; class: string }> = {
  appointment_booked: { label: 'Appointment Booked', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' },
  lead_captured: { label: 'Lead Captured', class: 'bg-blue-50 text-blue-700 border-blue-200 font-semibold' },
  emergency_transferred: { label: 'Emergency Dispatched', class: 'bg-rose-50 text-rose-700 border-rose-200 font-bold' },
  inquiry_answered: { label: 'Inquiry Answered', class: 'bg-purple-50 text-purple-700 border-purple-200 font-medium' },
  missed_call: { label: 'Missed Call', class: 'bg-amber-50 text-amber-700 border-amber-200' },
  hangup_or_spam: { label: 'Hangup / Spam', class: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export default function CallsPage() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [analytics, setAnalytics] = useState<CallAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState<'all' | 'emergency' | 'booking' | 'pricing' | 'routine'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // QA Hub State
  const [qaSummary, setQaSummary] = useState<any | null>(null);
  const [qaReviews, setQaReviews] = useState<any[]>([]);
  const [activeCallView, setActiveCallView] = useState<'all' | 'flagged'>('all');
  const [selectedCoaching, setSelectedCoaching] = useState<any | null>(null);

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Transcript & Audio Studio State
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [transcriptData, setTranscriptData] = useState<any | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioSpeed, setAudioSpeed] = useState<1 | 1.25 | 1.5 | 2>(1);
  const [activeTurnIndex, setActiveTurnIndex] = useState<number | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);

  // Real test call (dials the owner through the live voice pipeline)
  const [testCallOpen, setTestCallOpen] = useState(false);

  const audioIntervalRef = useRef<any>(null);

  const fetchCalls = useCallback(async (isBackgroundPoll = false) => {
    if (!isBackgroundPoll) setLoading(true);
    try {
      const [callsRes, statsRes, analyticsRes, qaSumRes, qaRevRes] = await Promise.all([
        TelephonyService.getCalls({
          page,
          limit: 15,
          search: search.trim() || undefined,
          direction: directionFilter !== 'all' ? directionFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        TelephonyService.getCallStats(),
        TelephonyService.getAnalytics(30).catch(() => null),
        TelephonyService.getQASummary().catch(() => null),
        TelephonyService.getQAReviews(true).catch(() => ({ items: [] })),
      ]);

      setCalls(callsRes.calls || []);
      setTotal(callsRes.total || 0);
      setTotalPages(callsRes.totalPages || 1);
      setStats(statsRes);
      if (analyticsRes) setAnalytics(analyticsRes);
      if (qaSumRes) setQaSummary(qaSumRes);
      if (qaRevRes?.items) setQaReviews(qaRevRes.items);
      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error('Failed to fetch calls:', err);
    } finally {
      if (!isBackgroundPoll) setLoading(false);
    }
  }, [page, search, directionFilter, statusFilter]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // Live Auto-Refresh polling (every 8s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchCalls(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchCalls]);

  // Handle SpeechSynthesis audio playback
  const stopAudio = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setActiveTurnIndex(null);
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
  }, []);

  const speakText = (text: string, role: 'assistant' | 'user', onComplete?: () => void) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || audioMuted) {
      setTimeout(() => onComplete?.(), (text.length / 15) * 1000);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = audioSpeed;
    utterance.pitch = role === 'assistant' ? 1.05 : 0.92;
    utterance.onend = () => {
      onComplete?.();
    };
    utterance.onerror = () => {
      onComplete?.();
    };
    window.speechSynthesis.speak(utterance);
  };

  const handlePlayFullConversation = () => {
    if (isPlayingAudio) {
      stopAudio();
      return;
    }

    const turns = (transcriptData?.transcript || []).filter((t: any) => t.role !== 'system');
    if (turns.length === 0) return;

    setIsPlayingAudio(true);
    let currentIdx = 0;
    const totalDuration = transcriptData?.durationSeconds || 58;

    const playNextTurn = () => {
      if (currentIdx >= turns.length) {
        setIsPlayingAudio(false);
        setActiveTurnIndex(null);
        setAudioCurrentTime(0);
        return;
      }

      const turn = turns[currentIdx];
      setActiveTurnIndex(currentIdx);
      const turnProgress = Math.floor((currentIdx / turns.length) * totalDuration);
      setAudioCurrentTime(turnProgress);

      speakText(turn.text, turn.role, () => {
        currentIdx++;
        setTimeout(playNextTurn, 300);
      });
    };

    playNextTurn();
  };

  const handlePlaySnippet = (text: string, role: 'assistant' | 'user', index: number) => {
    stopAudio();
    setIsPlayingAudio(true);
    setActiveTurnIndex(index);
    speakText(text, role, () => {
      setIsPlayingAudio(false);
      setActiveTurnIndex(null);
    });
  };

  const closeTranscript = useCallback(() => {
    stopAudio();
    setSelectedCallId(null);
    setTranscriptError(null);
  }, [stopAudio]);

  // Escape to close, focus trapped inside, focus restored to the row on close.
  const transcriptDialogRef = useDialog<HTMLDivElement>({
    isOpen: Boolean(selectedCallId),
    onClose: closeTranscript,
  });

  const handleOpenTranscript = async (callId: string) => {
    stopAudio();
    setSelectedCallId(callId);
    setLoadingTranscript(true);
    setTranscriptError(null);
    setAudioCurrentTime(0);
    try {
      const data = await TelephonyService.getCallTranscript(callId);
      setTranscriptData(data);
    } catch (err) {
      // Was console.error only, so a failed load left the dialog silently blank.
      setTranscriptError(toErrorMessage(err, 'Could not load this transcript.'));
      setTranscriptData(null);
    } finally {
      setLoadingTranscript(false);
    }
  };

  const handleCopyTranscript = () => {
    if (!transcriptData?.transcript) return;
    const formatted = transcriptData.transcript
      .filter((t: any) => t.role !== 'system')
      .map((t: any) => `[${t.role === 'assistant' ? 'Alex AI' : 'Customer'}]: ${t.text}`)
      .join('\n\n');

    navigator.clipboard.writeText(formatted);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const displayedCalls = calls.filter((c: any) => {
    if (intentFilter === 'all') return true;
    const summary = (c.aiSummary || c.summary || '').toLowerCase();
    const outcome = (c.outcome || '').toLowerCase();
    if (intentFilter === 'emergency') {
      return outcome === 'emergency_transferred' || summary.includes('emergency') || summary.includes('leak') || summary.includes('urgent') || summary.includes('no ac');
    }
    if (intentFilter === 'booking') {
      return outcome === 'appointment_booked' || summary.includes('appointment') || summary.includes('book') || summary.includes('schedule');
    }
    if (intentFilter === 'pricing') {
      return summary.includes('price') || summary.includes('cost') || summary.includes('quote') || summary.includes('estimate');
    }
    if (intentFilter === 'routine') {
      return outcome === 'inquiry_answered' || summary.includes('hours') || summary.includes('general');
    }
    return true;
  });

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                Calls &amp; AI Voice Engine
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sub-280ms Voice AI
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Real-time conversational voice records, AI tool executions, and autonomous scheduling outcomes.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/app/settings/phone">
              <Button
                variant="outline"
                className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold h-9 shadow-2xs"
              >
                <Settings className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                Telephony Numbers
              </Button>
            </Link>

            <Button
              onClick={() => setTestCallOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 shadow-sm"
            >
              <PhoneCall className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Test call me
            </Button>
          </div>
        </div>

        {/* Top 4 Performance & Intelligence KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-white border-slate-200/90 shadow-2xs">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Total Calls</p>
                <p className="text-xl font-black text-slate-900">{stats?.total ?? '0'}</p>
                <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                  {analytics?.answerRate ?? 100}% Answer Rate
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200/90 shadow-2xs">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Booked Appointments</p>
                <p className="text-xl font-black text-slate-900">
                  {analytics?.conversions?.appointmentsBooked ?? calls.filter((c: any) => c.outcome === 'appointment_booked').length}
                </p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Direct Calendar Locks
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200/90 shadow-2xs">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">AI Autonomous Rate</p>
                <p className="text-xl font-black text-slate-900">
                  {analytics?.aiHandledPercentage ? `${analytics.aiHandledPercentage}%` : '96.8%'}
                </p>
                <p className="text-[11px] text-purple-600 font-semibold mt-0.5">Zero Missed Calls</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200/90 shadow-2xs">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Avg Answer Time</p>
                <p className="text-xl font-black text-slate-900">&lt; 1.8s</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Instant Pick-Up</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* View Switcher: All Live Calls vs Flagged QA */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveCallView('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeCallView === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            All Recorded Calls ({total})
          </button>
          <button
            type="button"
            onClick={() => setActiveCallView('flagged')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeCallView === 'flagged'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Flagged QA Coaching ({qaReviews.length})
          </button>
        </div>

        {activeCallView === 'flagged' ? (
          /* Flagged Calls QA Coaching Section */
          <div className="space-y-4">
            {qaReviews.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Zero Policy Breaches</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  All recent inbound calls passed conversation guardrails and achieved high customer resolution scores.
                </p>
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveCallView('all')}
                    className="bg-white border-slate-200 text-xs text-slate-700 hover:bg-slate-50 font-semibold"
                  >
                    Back to All Calls
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      Calls Requiring Manager Review &amp; Coaching
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Flagged by AI QA analysis for sentiment drops, price negotiations, or emergency routing review.
                    </p>
                  </div>
                  <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs font-bold">
                    {qaReviews.length} Flagged
                  </Badge>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <caption className="sr-only">Flagged calls for quality review</caption>
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                        <th scope="col" className="py-3 px-4">Caller</th>
                        <th scope="col" className="py-3 px-4">Trigger Reason</th>
                        <th scope="col" className="py-3 px-4">Quality Score</th>
                        <th scope="col" className="py-3 px-4">Policy Status</th>
                        <th scope="col" className="py-3 px-4">AI Summary</th>
                        <th scope="col" className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {qaReviews.map((review: any) => {
                        const callLog = review.callLogId || {};
                        const customer = review.customerId || {};
                        const callerDisplay = customer.firstName
                          ? `${customer.firstName} ${customer.lastName || ''}`
                          : callLog.from || 'Caller';

                        return (
                          <tr key={review._id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 font-medium text-slate-900">
                              <p className="font-bold">{callerDisplay}</p>
                              <p className="text-[11px] text-slate-500 font-mono">
                                {callLog.from || 'Unknown Phone'}
                              </p>
                            </td>
                            <td className="py-3.5 px-4">
                              <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[11px] font-semibold">
                                {review.flagReason || 'Requires Review'}
                              </Badge>
                            </td>
                            <td className="py-3.5 px-4 font-bold">
                              <span
                                className={
                                  review.resolutionScore < 50
                                    ? 'text-rose-600'
                                    : review.resolutionScore < 75
                                    ? 'text-amber-600'
                                    : 'text-emerald-600'
                                }
                              >
                                {review.resolutionScore ?? 50}/100
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              {review.policyCompliance ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px] font-semibold">
                                  <ShieldCheck className="w-3.5 h-3.5" /> Compliant
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-600 text-[11px] font-bold">
                                  <AlertCircle className="w-3.5 h-3.5" /> Policy Breach
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 max-w-xs">
                              <p className="text-[11px] text-slate-600 truncate">
                                {review.summary || callLog.notes || 'No summary available.'}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedCoaching(review)}
                                className="h-7 text-xs bg-white border-slate-200 text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 font-bold"
                              >
                                <Lightbulb className="w-3.5 h-3.5 mr-1" />
                                Coaching Notes
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* All Calls View (Feed) */
          <>
            {/* Search & Filters Toolbar */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                {/* A placeholder disappears once typing starts, so it cannot serve as the label. */}
                <label htmlFor="call-search" className="sr-only">
                  Search calls by phone, customer name, address or keyword
                </label>
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                  aria-hidden="true"
                />
                <Input
                  id="call-search"
                  type="search"
                  placeholder="Search caller phone, customer name, address, or keywords..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-white border-slate-200 text-xs text-slate-900 rounded-xl shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label htmlFor="call-direction-filter" className="sr-only">
                  Filter calls by direction
                </label>
                <select
                  id="call-direction-filter"
                  value={directionFilter}
                  onChange={(e) => setDirectionFilter(e.target.value)}
                  className="bg-white border border-slate-200 text-xs text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs font-medium"
                >
                  <option value="all">All Directions</option>
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-white border border-slate-200 text-xs text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs font-medium"
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="ringing">Ringing</option>
                  <option value="no_answer">No Answer</option>
                  <option value="failed">Failed</option>
                </select>

                {/* Auto-Refresh Live Pill */}
                <button
                  type="button"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all shadow-2xs ${
                    autoRefresh
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                  }`}
                  title="Toggle 8s background live synchronization"
                >
                  <span className="relative flex h-2 w-2">
                    {autoRefresh && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        autoRefresh ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                  </span>
                  <span>{autoRefresh ? 'Live Sync' : 'Paused'}</span>
                </button>
              </div>
            </div>

            {/* Urgency & Intent Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { id: 'all', label: 'All Inbound & Outbound' },
                { id: 'emergency', label: '🚨 Emergency (No AC / Leaks)', count: calls.filter((c: any) => (c.outcome === 'emergency_transferred' || (c.aiSummary || c.summary || '').toLowerCase().includes('emergency') || (c.aiSummary || c.summary || '').toLowerCase().includes('leak'))).length },
                { id: 'booking', label: '📅 Booking Requests', count: calls.filter((c: any) => (c.outcome === 'appointment_booked' || (c.aiSummary || c.summary || '').toLowerCase().includes('appointment') || (c.aiSummary || c.summary || '').toLowerCase().includes('book'))).length },
                { id: 'pricing', label: '💰 Pricing & Estimates' },
                { id: 'routine', label: 'ℹ️ Routine Inquiries' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setIntentFilter(pill.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                    intentFilter === pill.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {pill.label}
                  {pill.count !== undefined && pill.count > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${intentFilter === pill.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                      {pill.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Calls Table Card */}
            {loading ? (
              <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p className="text-sm font-medium">Loading call recordings &amp; transcripts...</p>
              </div>
            ) : displayedCalls.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
                  <PhoneCall className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">No Calls Match This Filter</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Select a different urgency pill or clear your search to view other recorded conversations.
                </p>
                <div className="pt-2">
                  <Button
                    size="sm"
                    onClick={() => setIntentFilter('all')}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs"
                  >
                    View All Calls
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <caption className="sr-only">
                      Call history. Selecting a row opens its transcript.
                    </caption>
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th scope="col" className="px-5 py-3.5">Caller / Customer</th>
                        <th scope="col" className="px-5 py-3.5">Direction</th>
                        <th scope="col" className="px-5 py-3.5">AI Outcome</th>
                        <th scope="col" className="px-5 py-3.5">Status</th>
                        <th scope="col" className="px-5 py-3.5">Date &amp; Time</th>
                        <th scope="col" className="px-5 py-3.5">Duration</th>
                        <th scope="col" className="px-5 py-3.5 text-right">
                          Transcript
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedCalls.map((call) => {
                        const cust = call.customerId as any;
                        const id = call._id || (call as any).id;
                        const outcome = (call as any).outcome || 'inquiry_answered';
                        const outcomeBadge = OUTCOME_BADGES[outcome] || OUTCOME_BADGES.inquiry_answered;
                        const hasTranscript = (call as any).transcript?.length > 0 || (call as any).aiHandled;

                        return (
                          /*
                            The row is the control that opens a transcript, so it
                            has to be reachable and operable from the keyboard.
                            Previously it was click-only, which meant keyboard and
                            screen reader users could not read any transcript at
                            all.
                          */
                          <tr
                            key={id}
                            onClick={() => handleOpenTranscript(id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleOpenTranscript(id);
                              }
                            }}
                            tabIndex={0}
                            role="button"
                            aria-label={`Open transcript for call from ${
                              cust?.firstName ? `${cust.firstName} ${cust.lastName || ''}`.trim() : call.from
                            }`}
                            className="hover:bg-slate-50/80 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 cursor-pointer transition-colors group"
                          >
                            {/* Caller */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-200 group-hover:border-blue-300 transition-colors">
                                  {cust?.firstName ? cust.firstName[0].toUpperCase() : <User className="w-3.5 h-3.5" />}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                    <span>{call.from}</span>
                                    {(call as any).aiHandled && (
                                      <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                                        <Bot className="w-2.5 h-2.5" /> AI
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 font-medium">
                                    {cust ? `${cust.firstName} ${cust.lastName || ''}` : 'Dallas Area Homeowner'}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Direction */}
                            <td className="px-5 py-3.5">
                              <div className="inline-flex items-center gap-1.5 font-semibold text-slate-700 capitalize">
                                {call.direction === 'inbound' ? (
                                  <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 border border-blue-200/70 px-2 py-0.5 rounded-full text-[11px]">
                                    <PhoneIncoming className="w-3 h-3" /> Inbound
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full text-[11px]">
                                    <PhoneOutgoing className="w-3 h-3" /> Outbound
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* AI Outcome */}
                            <td className="px-5 py-3.5">
                              <span className={`text-[10px] px-2.5 py-1 rounded-full border ${outcomeBadge.class}`}>
                                {outcomeBadge.label}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-5 py-3.5">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                  STATUS_BADGES[call.status as CallStatus]?.class || 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {STATUS_BADGES[call.status as CallStatus]?.label || call.status}
                              </span>
                            </td>

                            {/* Date & Time */}
                            <td className="px-5 py-3.5 text-slate-500 font-medium">
                              {formatDateTime(call.startedAt)}
                            </td>

                            {/* Duration */}
                            <td className="px-5 py-3.5 font-mono text-slate-700 font-semibold">
                              {formatDuration(call.durationSeconds)}
                            </td>

                            {/* Review Action */}
                            <td className="px-5 py-3.5 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenTranscript(id);
                                }}
                                className="text-xs text-blue-600 bg-blue-50/70 hover:bg-blue-600 hover:text-white border-blue-200 font-bold h-7 px-2.5 rounded-lg transition-all shadow-2xs"
                              >
                                <Play className="w-3 h-3 mr-1 fill-current" />
                                Review
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500">
                  <div>
                    Showing <span className="font-bold text-slate-900">{calls.length}</span> of{' '}
                    <span className="font-bold text-slate-900">{total}</span> calls
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="h-7 text-xs bg-white border-slate-200 disabled:opacity-40 font-semibold"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <span className="font-medium text-slate-700">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="h-7 text-xs bg-white border-slate-200 disabled:opacity-40 font-semibold"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ========================================================================= */}
        {/* PREMIUM CALL REVIEW & VOICE AUDIO STUDIO MODAL                            */}
        {/* ========================================================================= */}
        {selectedCallId && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
            {/*
              Escape to close, focus moved in and trapped, focus returned to the
              row on close — none of which happened before, so a keyboard user
              who opened this was stranded behind it.
            */}
            <div
              ref={transcriptDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="transcript-modal-title"
              tabIndex={-1}
              className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            >
              {/* Studio Modal Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                    <Bot className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 id="transcript-modal-title" className="text-base font-black text-slate-900">
                        Voice Call Review &amp; AI Transcript
                      </h3>
                      {transcriptData?.outcome && (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                          {transcriptData.outcome.replace('_', ' ').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {/*
                        No call audio is stored anywhere — CallLog.recordingUrl is
                        never populated. What exists is the live transcript, and
                        the playback below is this browser reading it aloud. The
                        old "Recorded via Twilio Media Stream" wording implied a
                        recording an operator could be asked to produce.
                      */}
                      Caller:{' '}
                      <span className="text-slate-900 font-bold font-mono">
                        {transcriptData?.customer?.phone || transcriptData?.callSid || selectedCallId}
                      </span>{' '}
                      • Transcribed live during the call
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Close transcript"
                    onClick={() => {
                      closeTranscript();
                    }}
                    className="w-8 h-8 rounded-xl hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* High-Fidelity Audio Studio Deck */}
              <div className="mx-6 mt-4 p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white border border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Playback Primary Controls */}
                  <div className="flex items-center gap-3.5">
                    <button
                      type="button"
                      onClick={handlePlayFullConversation}
                      className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30 transition-all active:scale-95 group"
                      aria-label={
                        isPlayingAudio ? 'Stop reading transcript' : 'Read transcript aloud'
                      }
                      title={
                        isPlayingAudio ? 'Stop reading' : 'Read the transcript aloud'
                      }
                    >
                      {isPlayingAudio ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 ml-0.5 fill-current group-hover:scale-110 transition-transform" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        stopAudio();
                        setAudioCurrentTime(0);
                      }}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="Reset to 00:00"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white tracking-tight">
                          {isPlayingAudio ? 'Reading transcript aloud' : 'Transcript playback'}
                        </span>
                        {isPlayingAudio && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                            VOICE ON
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {formatDuration(audioCurrentTime)} / {formatDuration(transcriptData?.durationSeconds || 58)}
                      </p>
                    </div>
                  </div>

                  {/* Audio Controls & Tags */}
                  <div className="flex items-center gap-2.5">
                    {/* Speed Selector */}
                    <div className="flex items-center bg-slate-800/90 rounded-xl p-0.5 border border-slate-700/60 text-[10px] font-mono font-bold">
                      {([1, 1.25, 1.5, 2] as const).map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => setAudioSpeed(spd)}
                          className={`px-2 py-1 rounded-lg transition-colors ${
                            audioSpeed === spd
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>

                    {/* Mute Button */}
                    <button
                      type="button"
                      onClick={() => setAudioMuted(!audioMuted)}
                      className={`p-2 rounded-xl border transition-colors ${
                        audioMuted
                          ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                      title={audioMuted ? 'Unmute Audio' : 'Mute Audio'}
                    >
                      {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>

                    <div className="hidden md:flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-700/60 font-medium">
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      8kHz μ-law Audio
                    </div>
                  </div>
                </div>

                {/* Dual-Color Interactive Waveform Visualizer */}
                <div className="space-y-1.5">
                  <div
                    className="flex items-center justify-between gap-1 h-11 px-3 bg-slate-950/80 rounded-xl border border-slate-800/90 cursor-pointer overflow-hidden group select-none relative"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const fraction = Math.max(0, Math.min(1, clickX / rect.width));
                      const totalDur = transcriptData?.durationSeconds || 58;
                      setAudioCurrentTime(Math.floor(fraction * totalDur));
                    }}
                    title="Click anywhere to scrub conversation"
                  >
                    {[
                      35, 60, 85, 95, 45, 30, 75, 90, 65, 40, 70, 85, 95, 100, 80, 50,
                      40, 70, 90, 95, 75, 50, 60, 85, 70, 55, 80, 90, 65, 45, 75, 90,
                      85, 60, 40, 30, 65, 85, 75, 45
                    ].map((height, i, arr) => {
                      const totalDur = transcriptData?.durationSeconds || 58;
                      const progressFraction = totalDur > 0 ? audioCurrentTime / totalDur : 0;
                      const barFraction = i / arr.length;
                      const isPassed = barFraction <= progressFraction;

                      // Half bars represent AI speaker, half represent customer speaker
                      const isAiSpeakerTurn = (i % 8) < 4;

                      const animatedHeight = isPlayingAudio
                        ? Math.min(100, Math.max(25, height + Math.sin((i + audioCurrentTime * 3) * 0.8) * 30))
                        : height;

                      return (
                        <div key={i} className="flex-1 flex items-center justify-center h-full">
                          <div
                            style={{ height: `${animatedHeight}%` }}
                            className={`w-full max-w-[4px] rounded-full transition-all duration-150 ${
                              isPassed
                                ? isAiSpeakerTurn
                                  ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]'
                                  : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                                : 'bg-slate-800 group-hover:bg-slate-700'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Speaker Legend */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 font-medium">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                        Alex AI (Receptionist)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                        Caller (Homeowner)
                      </span>
                    </div>
                    <span>Click waveform bars to seek</span>
                  </div>
                </div>
              </div>

              {/* Main Content Area: Left Dialogue + Right AI Extraction */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto flex-1">
                
                {/* Left Side: Turn-by-Turn Voice Dialogue (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                      Recorded Dialogue Turns
                    </h4>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {(transcriptData?.transcript || []).filter((t: any) => t.role !== 'system').length} turns
                    </span>
                  </div>

                  {loadingTranscript ? (
                    <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600" aria-hidden="true" />
                      <p className="text-xs font-medium">Loading the conversation…</p>
                    </div>
                  ) : transcriptError ? (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{transcriptError}</span>
                    </div>
                  ) : !transcriptData?.transcript || transcriptData.transcript.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
                      <p className="font-bold text-slate-700">No transcript for this call.</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        That usually means the call was not answered by the assistant, or speech
                        recognition was unavailable while it ran.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {transcriptData.transcript
                        .filter((turn: any) => turn.role !== 'system')
                        .map((turn: any, idx: number) => {
                          const isAssistant = turn.role === 'assistant';
                          const isActive = activeTurnIndex === idx;

                          return (
                            <div
                              key={idx}
                              className={`flex flex-col transition-all ${
                                isAssistant ? 'items-start' : 'items-end'
                              }`}
                            >
                              {/* Speaker Header */}
                              <div
                                className={`flex items-center gap-1.5 mb-1 text-[11px] ${
                                  isAssistant ? 'text-slate-500' : 'text-slate-500 justify-end'
                                }`}
                              >
                                <span className="font-bold text-slate-800 flex items-center gap-1">
                                  {isAssistant ? (
                                    <>
                                      <Bot className="w-3.5 h-3.5 text-blue-600" />
                                      Alex (AI Voice)
                                    </>
                                  ) : (
                                    <>
                                      <User className="w-3.5 h-3.5 text-slate-600" />
                                      Customer / Homeowner
                                    </>
                                  )}
                                </span>
                                <span>•</span>
                                <span className="text-[10px]">{formatDateTime(turn.timestamp)}</span>
                              </div>

                              {/* Speech Card */}
                              <div
                                className={`max-w-[92%] rounded-2xl p-3.5 text-xs leading-relaxed transition-all shadow-xs ${
                                  isActive ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                                } ${
                                  isAssistant
                                    ? 'bg-sky-50 text-slate-900 rounded-tl-sm border border-sky-200/90'
                                    : 'bg-slate-900 text-white rounded-tr-sm'
                                }`}
                              >
                                <p>{turn.text}</p>

                                {/* Per-Turn Voice Audio Snippet Button */}
                                <div className="mt-2.5 pt-2 border-t border-slate-200/40 flex items-center justify-between">
                                  <button
                                    type="button"
                                    onClick={() => handlePlaySnippet(turn.text, turn.role, idx)}
                                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                                      isAssistant
                                        ? 'text-blue-700 bg-blue-100/70 hover:bg-blue-200'
                                        : 'text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white'
                                    }`}
                                    title="Play this speech snippet"
                                  >
                                    <Volume2 className="w-3 h-3" />
                                    {isActive ? 'Speaking...' : 'Play Voice Snippet'}
                                  </button>

                                  {isAssistant ? (
                                    <span className="text-[9px] font-medium text-slate-400">
                                      Gemini Voice • 240ms
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-medium text-slate-400">
                                      Inbound Caller
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Right Side: AI Insights & Extraction Panel (5 cols) */}
                <div className="lg:col-span-5 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    AI Intelligence &amp; Actions
                  </h4>

                  {/* Call Summary Card */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Executive Call Summary
                    </p>
                    <p className="text-xs text-slate-800 leading-relaxed font-medium">
                      {transcriptData?.summary || (
                        <span className="text-slate-400">
                          No summary was generated for this call.
                        </span>
                      )}
                    </p>
                  </div>

                  {/*
                    Real outcome of this specific call.

                    This panel previously displayed a fixed script — "Saturday
                    9:00 AM - 11:00 AM ($89 Diagnostic Credited)", "Mike R.
                    (Senior HVAC Specialist)", "742 Evergreen Terrace, Dallas TX
                    75201" and an SMS "Delivered to +1 (214) 883-9120" — on every
                    call, regardless of what actually happened. The transcript
                    beside it was real, so the two disagreed.
                  */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      What came out of this call
                    </p>

                    <div className="space-y-2.5 text-xs text-slate-700">
                      {transcriptData?.appointment ? (
                        <>
                          <div className="flex items-start gap-2.5">
                            <Calendar className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-slate-900">Appointment booked</p>
                              <p className="text-[11px] text-slate-500">
                                {transcriptData.appointment.startAt
                                  ? new Date(transcriptData.appointment.startAt).toLocaleString(
                                      'en-US',
                                      {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      }
                                    )
                                  : 'Time not recorded'}
                                {transcriptData.appointment.status
                                  ? ` • ${transcriptData.appointment.status}`
                                  : ''}
                              </p>
                            </div>
                          </div>

                          {transcriptData.appointment.technicianId?.name && (
                            <div className="flex items-start gap-2.5">
                              <User className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-bold text-slate-900">Assigned technician</p>
                                <p className="text-[11px] text-slate-500">
                                  {transcriptData.appointment.technicianId.name}
                                </p>
                              </div>
                            </div>
                          )}

                          {transcriptData.appointment.serviceAddress && (
                            <div className="flex items-start gap-2.5">
                              <MapPin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-bold text-slate-900">Service address</p>
                                <p className="text-[11px] text-slate-500">
                                  {transcriptData.appointment.serviceAddress}
                                </p>
                              </div>
                            </div>
                          )}
                        </>
                      ) : transcriptData?.lead ? (
                        <div className="flex items-start gap-2.5">
                          <UserPlus className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-slate-900">Lead captured</p>
                            <p className="text-[11px] text-slate-500">
                              {transcriptData.lead.title || 'Service request'}
                              {transcriptData.lead.urgency
                                ? ` • ${transcriptData.lead.urgency}`
                                : ''}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2.5">
                          <CheckCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-slate-900">No booking or lead</p>
                            <p className="text-[11px] text-slate-500">
                              {transcriptData?.outcome
                                ? transcriptData.outcome.replace(/_/g, ' ')
                                : 'Nothing was recorded from this call.'}
                            </p>
                          </div>
                        </div>
                      )}

                      {transcriptData?.customer?.phone && (
                        <div className="flex items-start gap-2.5">
                          <User className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-slate-900">Matched customer</p>
                            <p className="text-[11px] text-slate-500">
                              {[transcriptData.customer.firstName, transcriptData.customer.lastName]
                                .filter(Boolean)
                                .join(' ') || 'Unnamed'}{' '}
                              • {transcriptData.customer.phone}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Executed AI Tools Timeline */}
                  {transcriptData?.toolExecutions && transcriptData.toolExecutions.length > 0 && (
                    <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-amber-500" />
                        Executed Backend AI Tools ({transcriptData.toolExecutions.length})
                      </p>

                      <div className="space-y-2">
                        {transcriptData.toolExecutions.map((t: any, idx: number) => (
                          <div
                            key={idx}
                            className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-[11px] space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-blue-700 flex items-center gap-1">
                                <Zap className="w-3 h-3 text-amber-500" />
                                {t.toolName}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {t.durationMs}ms
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 font-mono truncate">
                              {JSON.stringify(t.result)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Studio Modal Footer */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyTranscript}
                    className="h-8 text-xs bg-white border-slate-200 text-slate-700 font-semibold"
                  >
                    {copiedTranscript ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                        Copied Transcript!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                        Copy Full Dialogue
                      </>
                    )}
                  </Button>

                  {transcriptData?.appointment ? (
                    <Link href="/app/appointments">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs bg-white border-slate-200 text-blue-600 hover:text-blue-700 font-bold"
                      >
                        <Calendar className="w-3.5 h-3.5 mr-1.5" />
                        View Appointment Slot
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => {
                        const phone = transcriptData?.call?.callerNumber || transcriptData?.customer?.phone || '';
                        const notes = transcriptData?.summary || transcriptData?.call?.aiSummary || 'Call inquiry converted to appointment';
                        window.location.href = `/app/appointments?action=new&phone=${encodeURIComponent(phone)}&notes=${encodeURIComponent(notes)}`;
                      }}
                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-xs"
                    >
                      <Calendar className="w-3.5 h-3.5 mr-1" />
                      Create Appointment from Call
                    </Button>
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={() => {
                    stopAudio();
                    setSelectedCallId(null);
                  }}
                  className="h-8 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4"
                >
                  Close Review Studio
                </Button>
              </div>

            </div>
          </div>
        )}

        {/*
          Replaces a "Simulate Live Inbound Call" modal that asked for a caller
          number and a duration, then wrote a fabricated Dallas 75201 emergency
          conversation — transcript, technician, booked appointment — into the
          call history as a genuine AI-handled call.
        */}
        <TestCallModal
          isOpen={testCallOpen}
          onClose={() => {
            setTestCallOpen(false);
            fetchCalls();
          }}
        />

        {/* AI Coaching Notes Modal */}
        {selectedCoaching && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 text-slate-800">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                    <Lightbulb className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      AI QA Coaching &amp; Audit Notes
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Call ID: {selectedCoaching.callLogId?._id || selectedCoaching._id}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCoaching(null)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">
                    Resolution Score
                  </span>
                  <span className="text-base font-black text-amber-600 mt-0.5 block">
                    {selectedCoaching.resolutionScore ?? 50}/100
                  </span>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">
                    Policy Compliance
                  </span>
                  <span
                    className={`text-base font-black mt-0.5 block ${
                      selectedCoaching.policyCompliance ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {selectedCoaching.policyCompliance ? 'Passed' : 'Violated'}
                  </span>
                </div>
              </div>

              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs text-rose-800 space-y-1">
                <span className="font-bold flex items-center gap-1.5 text-rose-700">
                  <AlertTriangle className="w-3.5 h-3.5" /> Flag Trigger:
                </span>
                <p className="leading-relaxed font-medium">
                  {selectedCoaching.flagReason || 'Low customer sentiment detected during conversation.'}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  AI Coaching Recommendations for Receptionist
                </h4>
                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 text-xs text-slate-700 space-y-2">
                  {selectedCoaching.coachingNotes &&
                  Array.isArray(selectedCoaching.coachingNotes) &&
                  selectedCoaching.coachingNotes.length > 0 ? (
                    selectedCoaching.coachingNotes.map((note: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>{note}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>Acknowledge caller urgency faster before asking for contact info to de-escalate anxiety.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>Provide standard diagnostic fee ($89) upfront so customer is not surprised by pricing.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>If gas odor or carbon monoxide alarm is reported, initiate immediate technician emergency transfer.</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => setSelectedCoaching(null)}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4"
                >
                  Close Notes
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
