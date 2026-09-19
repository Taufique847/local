'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  RefreshCw,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { HealthService } from '@/services/health.service';
import { HealthCheckResult } from '@/types';
import { Button } from '@/components/ui/button';

export function Footer() {
  const [healthResult, setHealthResult] = useState<HealthCheckResult>({
    status: 'checking',
    data: null,
    error: null,
    latencyMs: null,
    timestamp: null,
  });
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [showTelemetry, setShowTelemetry] = useState<boolean>(false);

  const checkHealth = async () => {
    setIsRefreshing(true);
    try {
      const res = await HealthService.checkHealth();
      setHealthResult(res);
    } catch {
      setHealthResult({
        status: 'disconnected',
        data: null,
        error: 'Backend offline',
        latencyMs: null,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const isConnected = healthResult.status === 'connected';

  return (
    <footer className="bg-slate-50 border-t border-slate-200 text-slate-600 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-12">
        
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 text-left">
          
          {/* Brand Col */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                BC
              </div>
              <span className="text-base font-bold text-slate-900 tracking-tight">BlueCollar AI</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm">
              The autonomous AI voice receptionist, dispatch engine, and Google reputation funnel engineered specifically for US HVAC, plumbing, and electrical contractors.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>TCPA Quiet Hours & FCC Compliant</span>
            </div>
          </div>

          {/* Nav Col 1 */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">Product</p>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#voice-demo" className="hover:text-blue-600 transition-colors">
                  Live Voice Demo
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-blue-600 transition-colors">
                  Speed-to-Lead Engine
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-blue-600 transition-colors">
                  Smart Zone Dispatch
                </a>
              </li>
              <li>
                <a href="#reputation-shield" className="hover:text-blue-600 transition-colors">
                  Reputation Shield
                </a>
              </li>
              <li>
                <a href="#roi-calculator" className="hover:text-blue-600 transition-colors">
                  ROI Calculator
                </a>
              </li>
            </ul>
          </div>

          {/* Nav Col 2 */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">Integrations</p>
            <ul className="space-y-2 text-xs text-slate-700">
              <li>
                <span>ServiceTitan Direct</span>
              </li>
              <li>
                <span>Housecall Pro</span>
              </li>
              <li>
                <span>Jobber API</span>
              </li>
              <li>
                <span>Google Calendar</span>
              </li>
              <li>
                <span>Twilio Telephony</span>
              </li>
            </ul>
          </div>

          {/* Nav Col 3 */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">Portal Access</p>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/login" className="hover:text-blue-600 transition-colors">
                  Contractor Sign In
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-blue-600 transition-colors">
                  Create Account
                </Link>
              </li>
              <li>
                <Link href="/app/dashboard" className="hover:text-blue-600 transition-colors">
                  Dispatcher Dashboard
                </Link>
              </li>
              <li>
                <button
                  onClick={() => setShowTelemetry(!showTelemetry)}
                  className="text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1.5 font-medium"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  System Telemetry {showTelemetry ? '▲' : '▼'}
                </button>
              </li>
            </ul>
          </div>

        </div>

        {/* Expandable M1 System Telemetry Section (Preserved in White Theme) */}
        {showTelemetry && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-slate-900">Live Platform Health Telemetry</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={checkHealth}
                disabled={isRefreshing}
                className="h-7 text-[11px] bg-slate-50 border-slate-200 text-slate-700"
              >
                <RefreshCw className={`w-3 h-3 mr-1.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
                Ping Health
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="text-slate-500">Backend Status:</span>
                <span className={isConnected ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                  {isConnected ? 'ONLINE (Port 5000)' : 'OFFLINE'}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="text-slate-500">Roundtrip Latency:</span>
                <span className="text-blue-700 font-bold">
                  {healthResult.latencyMs !== null ? `${healthResult.latencyMs}ms` : '—'}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="text-slate-500">Last Telemetry Ping:</span>
                <span className="text-slate-700">{healthResult.timestamp || 'Checking...'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Bottom copyright line */}
        <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p>© {new Date().getFullYear()} BlueCollar AI Inc. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              Systems Operational
            </span>
            <span>•</span>
            <span>Privacy Policy</span>
            <span>•</span>
            <span>TCPA Compliance</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
