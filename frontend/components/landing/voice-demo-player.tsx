'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sparkles,
  Radio,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DialogueTurn {
  role: 'customer' | 'assistant';
  speaker: string;
  timeOffset: number;
  text: string;
  toolCall?: {
    name: string;
    input: string;
    output: string;
  };
}

const SAMPLE_DIALOGUE: DialogueTurn[] = [
  {
    role: 'customer',
    speaker: 'Robert (Homeowner)',
    timeOffset: 0,
    text: "Hi! Our AC compressor is making a terrible screeching noise and water started dripping from the ceiling unit! Can someone come out today?",
  },
  {
    role: 'assistant',
    speaker: 'Alex (AI Receptionist)',
    timeOffset: 4,
    text: "I completely understand how stressful ceiling water leaks are, Robert. Don't worry, we treat this as a priority emergency. Let me check our on-call technicians in Chicago right away.",
    toolCall: {
      name: 'check_availability',
      input: '{ urgency: "emergency", zip: "60601" }',
      output: '2 slots available today (11:30 AM with Dave Miller, 2:00 PM with Carlos Mendez)',
    },
  },
  {
    role: 'assistant',
    speaker: 'Alex (AI Receptionist)',
    timeOffset: 10,
    text: "I have our senior technician Dave Miller available to arrive between 11:30 AM and 1:00 PM today. Does that time window work for you?",
  },
  {
    role: 'customer',
    speaker: 'Robert (Homeowner)',
    timeOffset: 15,
    text: "Yes, please! 11:30 AM is perfect. Gate code is #7733.",
  },
  {
    role: 'assistant',
    speaker: 'Alex (AI Receptionist)',
    timeOffset: 19,
    text: "You're all set! I've booked Dave Miller for 11:30 AM and saved your gate code #7733. You'll receive an SMS confirmation with live GPS tracking in 30 seconds. Turn off the AC thermostat now to prevent further dripping.",
    toolCall: {
      name: 'book_appointment & send_sms',
      input: '{ tech: "Dave Miller", slot: "11:30 AM", gateCode: "#7733" }',
      output: 'Appointment #AC-8891 Confirmed. SMS dispatched.',
    },
  },
];

interface VoiceDemoPlayerProps {
  onOpenBookingModal: () => void;
}

export function VoiceDemoPlayer({ onOpenBookingModal }: VoiceDemoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const totalDuration = 26;

  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const activeTurns = SAMPLE_DIALOGUE.filter((turn) => turn.timeOffset <= currentTime);

  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-8 shadow-md overflow-hidden text-left">
      
      {/* Header bar of the player */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                How an emergency call goes
              </h3>
              {/* Honest labelling. This component animates a scripted transcript;
                  it does not stream audio and measures no latency, so it must not
                  claim either. */}
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                Scripted example
              </span>
            </div>
            <p className="text-xs text-slate-500">
              A real Sunday emergency, turn by turn. Want to hear the actual voice?{' '}
              <span className="font-semibold text-blue-600">Try the live mic demo.</span>
            </p>
          </div>
        </div>

        {/* Outcome comparison rather than an invented latency figure. */}
        <div className="hidden lg:flex items-center gap-3 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-xl text-xs">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">Voicemail</span>
            <span className="font-semibold text-rose-600">Caller hangs up</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div className="text-left">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">
              BlueCollar AI
            </span>
            <span className="font-semibold text-emerald-700">Job booked</span>
          </div>
        </div>
      </div>

      {/* Interactive Waveform Audio Scrubber */}
      <div className="py-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? 'Pause transcript playback' : 'Play transcript'}
              className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentTime(0);
                setIsPlaying(true);
              }}
              aria-label="Restart from the beginning"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
            <div>
              <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                {isPlaying ? 'Playing transcript…' : 'Play the transcript'}
              </p>
              <p className="text-[11px] text-slate-500 font-mono">
                00:{currentTime.toString().padStart(2, '0')} / 00:{totalDuration}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Named vendors must match what the backend actually calls:
                Deepgram Nova-2 for speech recognition, Deepgram Aura for speech
                synthesis, and OpenAI for reasoning and tool calling. The previous
                label credited Cartesia, which is not used anywhere. */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <Volume2 className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
              <span>Deepgram Nova-2 + Aura</span>
            </div>
          </div>
        </div>

        {/* 36-Bar Dancing Waveform */}
        {/* Scrubber. Given slider semantics and arrow-key support so it is not
            mouse-only, which a plain clickable <div> was. */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Transcript position"
          aria-valuemin={0}
          aria-valuemax={totalDuration}
          aria-valuenow={currentTime}
          aria-valuetext={`${currentTime} of ${totalDuration} seconds`}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const fraction = Math.max(0, Math.min(1, clickX / rect.width));
            setCurrentTime(Math.floor(fraction * totalDuration));
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              setCurrentTime((t) => Math.min(totalDuration, t + 1));
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setCurrentTime((t) => Math.max(0, t - 1));
            } else if (e.key === 'Home') {
              e.preventDefault();
              setCurrentTime(0);
            } else if (e.key === 'End') {
              e.preventDefault();
              setCurrentTime(totalDuration);
            }
          }}
          className="flex items-center justify-between gap-1 h-12 px-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer overflow-hidden group select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {[
            30, 50, 75, 95, 60, 40, 80, 100, 85, 45, 65, 75, 90, 100, 70, 50,
            35, 60, 85, 95, 75, 40, 55, 80, 65, 50, 70, 90, 60, 45, 30, 20,
            55, 85, 90, 40
          ].map((barHeight, idx, arr) => {
            const progressFraction = currentTime / totalDuration;
            const barFraction = idx / arr.length;
            const isPassed = barFraction <= progressFraction;

            const dynamicHeight = isPlaying
              ? Math.min(100, Math.max(25, barHeight + Math.sin((idx + currentTime * 5) * 0.8) * 30))
              : barHeight;

            return (
              <div key={idx} className="flex-1 flex items-center justify-center h-full">
                <div
                  style={{ height: `${dynamicHeight}%` }}
                  className={`w-full max-w-[4px] rounded-full transition-all duration-150 ${
                    isPassed
                      ? 'bg-blue-600'
                      : 'bg-slate-200 group-hover:bg-slate-300'
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Turn-by-Turn Dynamic Dialogue Display */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 min-h-[220px] max-h-[340px] overflow-y-auto space-y-4">
        {activeTurns.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 space-y-2">
            <Radio className="w-6 h-6 text-slate-400 mx-auto animate-pulse" />
            <p>Press the Play button above to start the live conversation simulation.</p>
          </div>
        ) : (
          activeTurns.map((turn, index) => {
            const isAssistant = turn.role === 'assistant';

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
              >
                <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500 font-medium">
                  <span className="font-semibold text-slate-700">{turn.speaker}</span>
                  <span>•</span>
                  <span className="font-mono text-slate-400">00:{turn.timeOffset.toString().padStart(2, '0')}</span>
                </div>

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                    isAssistant
                      ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-xs'
                      : 'bg-blue-600 text-white rounded-tr-sm shadow-xs'
                  }`}
                >
                  {turn.text}
                </div>

                {/* AI Tool Execution Toast */}
                {turn.toolCall && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-2 max-w-[85%] bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 flex items-start gap-2 shadow-xs"
                  >
                    <div className="p-1 rounded bg-amber-100 text-amber-700 shrink-0 mt-0.5">
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-amber-800 font-bold">
                        <span>Autonomous Tool Executed:</span>
                        <code>{turn.toolCall.name}</code>
                      </div>
                      <p className="text-amber-700 text-[10px] mt-0.5">
                        Result: {turn.toolCall.output}
                      </p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* Bottom Action Footer */}
      <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-600">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Integrated with ServiceTitan, Housecall Pro, & Google Calendar</span>
        </div>

        <Button
          onClick={onOpenBookingModal}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 rounded-xl shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          Test Call My Phone Now
        </Button>
      </div>
    </div>
  );
}
