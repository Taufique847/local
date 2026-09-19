'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Sparkles, Menu, X, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavbarProps {
  onOpenBookingModal: () => void;
}

export function Navbar({ onOpenBookingModal }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/95 border-b border-slate-200/80 shadow-xs transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Logo & Brand */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-sm group-hover:bg-blue-700 transition-colors">
            BC
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-900 tracking-tight">BlueCollar AI</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                PRO
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Autonomous Voice & Dispatch</span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-600">
          <a href="#voice-demo" className="hover:text-blue-600 transition-colors flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            Live Voice Demo
          </a>
          <a href="#features" className="hover:text-blue-600 transition-colors">
            Features
          </a>
          <a href="#reputation-shield" className="hover:text-blue-600 transition-colors">
            Reputation Shield
          </a>
          <a href="#roi-calculator" className="hover:text-blue-600 transition-colors">
            ROI Calculator
          </a>
          <a href="#pricing" className="hover:text-blue-600 transition-colors">
            Pricing
          </a>
          <a href="#compare" className="hover:text-blue-600 transition-colors">
            Why Us
          </a>
        </nav>

        {/* Desktop Action Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/login"
            className="text-xs font-medium text-slate-700 hover:text-slate-900 px-3.5 py-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Sign In
          </Link>
          <a
            href="#voice-demo"
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 h-9 rounded-xl shadow-sm transition-all active:scale-95"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            Watch Demo
          </a>
        </div>

        {/* Mobile Hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white p-4 space-y-3 text-xs shadow-lg">
          <div className="space-y-2">
            <a
              href="#voice-demo"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 hover:text-blue-600 font-medium"
            >
              🎙️ Live AI Voice Demo
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 hover:text-blue-600 font-medium"
            >
              ⚡ Enterprise Features
            </a>
            <a
              href="#reputation-shield"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 hover:text-blue-600 font-medium"
            >
              🛡️ Google Reputation Shield
            </a>
            <a
              href="#roi-calculator"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 hover:text-blue-600 font-medium"
            >
              💰 ROI Revenue Calculator
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 hover:text-blue-600 font-medium"
            >
              💳 Plans & Pricing
            </a>
            <a
              href="#compare"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-slate-700 hover:text-blue-600 font-medium"
            >
              ⚖️ Human vs BlueCollar AI
            </a>
          </div>

          <div className="pt-3 border-t border-slate-200 flex flex-col gap-2">
            <a
              href="#voice-demo"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2.5 rounded-xl shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              Watch Demo
            </a>
            <Link
              href="/login"
              className="text-center py-2 text-xs text-slate-600 hover:text-slate-900"
            >
              Sign In to Dashboard
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
