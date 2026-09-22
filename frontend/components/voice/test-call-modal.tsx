'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Phone,
  PhoneCall,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Bot,
  User,
  ShieldCheck,
  Clock,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TelephonyService } from '@/services/telephony.service';
import { CallLog, TestCallReadiness } from '@/types/telephony';
import { toErrorMessage } from '@/lib/api-client';
import { useDialog } from '@/lib/use-dialog';

interface TestCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessName?: string;
}

type Phase = 'checking' | 'blocked' | 'ready' | 'dialing' | 'live' | 'finished' | 'error';

/** Terminal Twilio call states. */
const ENDED_STATUSES = ['completed', 'failed', 'busy', 'no_answer', 'cancelled'];

const POLL_INTERVAL_MS = 3000;
/** Stop polling after this long so a stuck call does not poll forever. */
const MAX_POLL_MS = 10 * 60 * 1000;

function formatPhone(value: string | null): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value;
}

const OUTCOME_LABELS: Record<string, string> = {
  appointment_booked: 'Appointment booked',
  lead_captured: 'Lead captured',
  inquiry_answered: 'Question answered',
  emergency_transferred: 'Transferred to a human',
  missed_call: 'Missed',
  hangup_or_spam: 'Ended without a request',
};

/**
 * Places a real test call and reports what actually happened.
 *
 * This replaces a browser-only imitation that used `speechSynthesis` for the
 * voice, `webkitSpeechRecognition` for the microphone and a keyword if/else
 * chain for the "AI" — then saved that invented conversation to the call
 * history. None of it touched the telephony or voice pipeline, so a contractor
 * could "test Alex" successfully while the real assistant was misconfigured.
 *
 * Here the server dials the contractor from their own AI line. Answering runs
 * the identical path a customer call takes: Twilio media stream, speech
 * recognition, the language model with its booking tools, and speech synthesis.
 */
export function TestCallModal({ isOpen, onClose, businessName }: TestCallModalProps) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [readiness, setReadiness] = useState<TestCallReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<CallLog | null>(null);
  const [callId, setCallId] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartedAt = useRef<number>(0);
  const titleId = 'test-call-modal-title';

  const dialogRef = useDialog<HTMLDivElement>({ isOpen, onClose });

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const checkReadiness = useCallback(async () => {
    setPhase('checking');
    setError(null);
    try {
      const result = await TelephonyService.getTestCallReadiness();
      setReadiness(result);
      setPhase(result.ready ? 'ready' : 'blocked');
    } catch (err) {
      setError(toErrorMessage(err, 'Could not check whether a test call is possible.'));
      setPhase('error');
    }
  }, []);

  // Reset to a clean state each time the dialog opens.
  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setCall(null);
      setCallId(null);
      return;
    }
    void checkReadiness();
    return stopPolling;
  }, [isOpen, checkReadiness, stopPolling]);

  const poll = useCallback(
    async (id: string) => {
      try {
        const latest = await TelephonyService.getCallById(id);
        setCall(latest);

        if (ENDED_STATUSES.includes(latest.status)) {
          setPhase('finished');
          stopPolling();
          return;
        }

        if (latest.status === 'in_progress') setPhase('live');

        if (Date.now() - pollStartedAt.current > MAX_POLL_MS) {
          stopPolling();
          return;
        }
        pollTimer.current = setTimeout(() => void poll(id), POLL_INTERVAL_MS);
      } catch {
        // A transient read failure should not kill an in-flight call view.
        if (Date.now() - pollStartedAt.current <= MAX_POLL_MS) {
          pollTimer.current = setTimeout(() => void poll(id), POLL_INTERVAL_MS);
        }
      }
    },
    [stopPolling]
  );

  const handleStartCall = useCallback(async () => {
    setPhase('dialing');
    setError(null);
    try {
      const started = await TelephonyService.startTestCall();
      setCallId(started.callId);
      pollStartedAt.current = Date.now();
      pollTimer.current = setTimeout(() => void poll(started.callId), POLL_INTERVAL_MS);
    } catch (err) {
      setError(toErrorMessage(err, 'The test call could not be placed.'));
      setPhase('error');
      // Blockers may have changed since the dialog opened.
      void checkReadiness();
    }
  }, [poll, checkReadiness]);

  if (!isOpen) return null;

  const transcript = (call?.transcript ?? []).filter((t) => t.role !== 'system');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/70 p-3 backdrop-blur-sm sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative my-4 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <PhoneCall className="h-5 w-5" />
            </div>
            <div>
              <h3 id={titleId} className="text-base font-bold tracking-tight">
                Test your AI receptionist
              </h3>
              <p className="text-xs text-slate-400">
                Alex calls your business phone so you hear exactly what a customer hears.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close test call dialog"
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
          {phase === 'checking' && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Checking your phone line and voice engine…
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Test call not placed</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {phase === 'blocked' && readiness && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">
                    Alex cannot take a call yet. Fix the following, then try again:
                  </p>
                  <ul className="mt-1.5 list-inside list-disc space-y-1">
                    {readiness.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <Button
                onClick={() => void checkReadiness()}
                variant="outline"
                className="h-9 rounded-xl border-slate-200 text-xs font-semibold"
              >
                Re-check
              </Button>
            </div>
          )}

          {readiness && (phase === 'ready' || phase === 'dialing' || phase === 'live' || phase === 'finished') && (
            <dl className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Alex calls from
                </dt>
                <dd className="mt-0.5 font-bold text-slate-900">
                  {formatPhone(readiness.aiPhoneNumber)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Your phone will ring
                </dt>
                <dd className="mt-0.5 font-bold text-slate-900">
                  {formatPhone(readiness.destinationPhone)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] text-slate-500">
                  Ringing a different number? Change your business phone in Settings — for safety
                  this dialog can only dial your own registered line.
                </p>
              </div>
            </dl>
          )}

          {phase === 'ready' && readiness && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                This places a real phone call and uses real speech and language minutes, the same as
                a customer call. It is excluded from your call stats.
                {readiness.callsRemainingThisHour <= 3 && (
                  <>
                    {' '}
                    <span className="font-semibold text-slate-800">
                      {readiness.callsRemainingThisHour} test call
                      {readiness.callsRemainingThisHour === 1 ? '' : 's'} left this hour.
                    </span>
                  </>
                )}
              </p>
              <Button
                onClick={() => void handleStartCall()}
                className="h-10 gap-2 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <Phone className="h-4 w-4" />
                Call me now
              </Button>
            </div>
          )}

          {phase === 'dialing' && (
            <div className="flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              <div>
                <p className="font-semibold">Dialing your phone now…</p>
                <p className="mt-0.5">
                  Answer it and talk to Alex like a customer would: describe a problem, ask about
                  pricing, or try to book a visit.
                </p>
              </div>
            </div>
          )}

          {phase === 'live' && (
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">Call in progress</p>
                <p className="mt-0.5">
                  The transcript appears here once you hang up{businessName ? `, ${businessName}` : ''}.
                </p>
              </div>
            </div>
          )}

          {phase === 'finished' && call && (
            <div className="space-y-3">
              <div
                className={`flex items-start gap-2 rounded-2xl border p-3 text-xs ${
                  call.status === 'completed'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {call.status === 'completed' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <div>
                  <p className="font-semibold">
                    {call.status === 'completed'
                      ? 'Test call finished'
                      : `Call ended: ${call.status.replace(/_/g, ' ')}`}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {typeof call.durationSeconds === 'number' && call.durationSeconds > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {call.durationSeconds}s
                      </span>
                    )}
                    {call.outcome && (
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        {OUTCOME_LABELS[call.outcome] ?? call.outcome.replace(/_/g, ' ')}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {transcript.length > 0 ? (
                <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    What was said
                  </h4>
                  {transcript.map((turn, idx) => (
                    <div
                      key={`${turn.timestamp}-${idx}`}
                      className={`flex items-start gap-2 ${
                        turn.role === 'user' ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white ${
                          turn.role === 'assistant' ? 'bg-blue-600' : 'bg-slate-800'
                        }`}
                      >
                        {turn.role === 'assistant' ? (
                          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <User className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </span>
                      <p
                        className={`max-w-[84%] rounded-2xl p-2.5 text-xs leading-relaxed ${
                          turn.role === 'assistant'
                            ? 'rounded-tl-none border border-blue-100 bg-blue-50/70 text-blue-950'
                            : 'rounded-tr-none bg-slate-100 font-medium text-slate-900'
                        }`}
                      >
                        <span className="sr-only">
                          {turn.role === 'assistant' ? 'Alex said: ' : 'You said: '}
                        </span>
                        {turn.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
                  No transcript was recorded. That usually means the call was not answered, or the
                  assistant could not reach its speech provider during the call.
                </p>
              )}

              {(call.toolExecutions?.length ?? 0) > 0 && (
                <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-white p-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Actions Alex took
                  </h4>
                  <ul className="space-y-1">
                    {call.toolExecutions!.map((t, idx) => (
                      <li
                        key={`${t.toolName}-${idx}`}
                        className="flex items-center justify-between gap-2 text-xs text-slate-700"
                      >
                        <span className="font-mono text-[11px]">{t.toolName}</span>
                        <span className="text-[10px] text-slate-400">{t.durationMs}ms</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                onClick={() => void checkReadiness()}
                variant="outline"
                className="h-9 rounded-xl border-slate-200 text-xs font-semibold"
              >
                Run another test
              </Button>
            </div>
          )}

          {phase === 'error' && (
            <Button
              onClick={() => void checkReadiness()}
              variant="outline"
              className="h-9 rounded-xl border-slate-200 text-xs font-semibold"
            >
              Try again
            </Button>
          )}

          {callId && phase !== 'finished' && (
            <p className="text-[10px] text-slate-400">
              This call is recorded in your history as a test and is left out of your reports.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
