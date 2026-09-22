'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, PhoneCall, ArrowRight, Star, Play, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VoiceDemoPlayer } from './voice-demo-player';

interface HeroSectionProps {
  onOpenBookingModal: () => void;
}

export function HeroSection({ onOpenBookingModal }: HeroSectionProps) {
  return (
    <section className="relative pt-12 pb-20 sm:pt-20 sm:pb-28 overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 border-b border-slate-200/80">
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
        
        {/* Floating Announcement Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold shadow-xs"
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
          </span>
          <span>⚡ Built Exclusively for US HVAC, Plumbing & Electrical Contractors</span>
        </motion.div>

        {/* Hero Main Headline */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-4xl mx-auto space-y-4"
        >
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
            Never Miss Another{' '}
            <span className="text-blue-600">
              $1,200 Emergency Call.
            </span>
          </h1>

          <p className="text-base sm:text-lg lg:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
            The 24/7 Autonomous AI Voice Employee that answers calls in &lt;1 ring, schedules jobs directly into your dispatch board, and shields your Google rating from bad reviews.
          </p>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2"
        >
          {/*
            Points at the scripted demo below rather than a "live microphone
            demo". The old button opened a browser imitation — Web Speech API
            voice and a keyword script — presented as talking to the real
            assistant. Contractors try the real thing from their dashboard after
            signing up, where it places an actual phone call.
          */}
          <a
            href="#voice-demo"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm px-8 h-12 rounded-xl shadow-lg shadow-blue-500/25 transition-all active:scale-95 group"
          >
            <Play className="w-4 h-4 shrink-0" aria-hidden="true" />
            Hear an emergency call
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </a>

          <a
            href="#pricing"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-300 text-sm px-7 h-12 rounded-xl transition-colors shadow-xs"
          >
            <CreditCard className="w-4 h-4 text-blue-600" />
            View Pricing Plans
          </a>
        </motion.div>

        {/* Social Proof Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="pt-8 border-t border-slate-200 max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center"
        >
          <div className="space-y-1">
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">$4.2M+</p>
            <p className="text-xs text-slate-500 font-medium">Contractor Revenue Saved</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight">&lt;280ms</p>
            <p className="text-xs text-slate-500 font-medium">Ultra-Low Voice Latency</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl sm:text-3xl font-black text-blue-600 tracking-tight">45 Sec</p>
            <p className="text-xs text-slate-500 font-medium">Speed-to-Lead SMS Recovery</p>
          </div>
          <div className="space-y-1">
            <p className="text-2xl sm:text-3xl font-black text-amber-500 tracking-tight flex items-center justify-center gap-1">
              4.9 <Star className="w-5 h-5 fill-amber-400 text-amber-500 inline" />
            </p>
            <p className="text-xs text-slate-500 font-medium">Google CSAT Average</p>
          </div>
        </motion.div>

        {/* Embedded Interactive Voice Demo Player */}
        <div id="voice-demo" className="pt-10 scroll-mt-24">
          <VoiceDemoPlayer onOpenBookingModal={onOpenBookingModal} />
        </div>
      </div>
    </section>
  );
}
