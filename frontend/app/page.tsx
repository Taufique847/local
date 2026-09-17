'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { HealthService } from '@/services/health.service';
import { HealthCheckResult } from '@/types';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { 
  Activity, 
  Server, 
  Monitor, 
  Globe, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Layers,
  Terminal,
  ShieldCheck
} from 'lucide-react';

export default function FoundationPage() {
  const [healthResult, setHealthResult] = useState<HealthCheckResult>({
    status: 'checking',
    data: null,
    error: null,
    latencyMs: null,
    timestamp: null,
  });
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const performHealthCheck = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await HealthService.checkHealth();
      setHealthResult(result);
    } catch {
      setHealthResult({
        status: 'disconnected',
        data: null,
        error: 'Failed to complete health check',
        latencyMs: null,
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    performHealthCheck();
  }, [performHealthCheck]);

  const isConnected = healthResult.status === 'connected';

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between p-4 sm:p-8 md:p-12">
      <div className="max-w-5xl w-full mx-auto space-y-8">
        
        {/* Top Bar / Header */}
        <header className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
                BC
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                BlueCollar AI
              </h1>
              <Badge variant="outline" className="border-sky-200 text-sky-700 bg-sky-50 text-[11px] font-mono font-semibold">
                M1 FOUNDATION
              </Badge>
            </div>
            <p className="text-sm sm:text-base text-slate-600">
              AI Employee Platform for Home-Service Businesses
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={performHealthCheck}
              disabled={isRefreshing}
              variant="outline"
              size="sm"
              className="border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 shadow-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
              <span>{isRefreshing ? 'Checking...' : 'Ping Health'}</span>
            </Button>

            <a
              href="/login"
              className="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs h-9 px-3 gap-1.5 shadow-xs"
            >
              Sign in
            </a>

            <a
              href="/signup"
              className="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 bg-sky-600 hover:bg-sky-700 text-white text-xs h-9 px-3 gap-1.5 shadow-xs font-semibold"
            >
              Create account
            </a>
          </div>
        </header>

        {/* System Status Metrics Cards */}
        <section aria-labelledby="system-status-title" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="system-status-title" className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-sky-600" />
              System Status Overview
            </h2>
            {healthResult.timestamp && (
              <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3 text-slate-400" />
                Last ping: {healthResult.timestamp}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Frontend Status */}
            <Card className="bg-white border-slate-200/90 shadow-xs hover:border-slate-300 transition-colors">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-medium uppercase tracking-wider">Frontend</span>
                  <Monitor className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xl font-semibold text-slate-900">Running</span>
                  <Badge variant="success" className="gap-1.5 py-0.5">
                    <StatusIndicator status="running" />
                    Active
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 font-mono">Next.js 14 (App Router)</p>
              </CardContent>
            </Card>

            {/* Backend Status */}
            <Card className="bg-white border-slate-200/90 shadow-xs hover:border-slate-300 transition-colors">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-medium uppercase tracking-wider">Backend</span>
                  <Server className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xl font-semibold text-slate-900">
                    {healthResult.status === 'checking'
                      ? 'Checking...'
                      : isConnected
                      ? 'Connected'
                      : 'Disconnected'}
                  </span>
                  {healthResult.status === 'checking' ? (
                    <Badge variant="warning" className="gap-1.5 py-0.5">
                      <StatusIndicator status="checking" />
                      Probing
                    </Badge>
                  ) : isConnected ? (
                    <Badge variant="success" className="gap-1.5 py-0.5">
                      <StatusIndicator status="connected" />
                      Healthy
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1.5 py-0.5">
                      <StatusIndicator status="disconnected" />
                      Offline
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-mono">Node.js + Express (TS)</p>
              </CardContent>
            </Card>

            {/* Environment */}
            <Card className="bg-white border-slate-200/90 shadow-xs hover:border-slate-300 transition-colors">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-medium uppercase tracking-wider">Environment</span>
                  <Globe className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xl font-semibold text-slate-900 capitalize">
                    {healthResult.data?.environment || 'Development'}
                  </span>
                  <Badge variant="secondary" className="py-0.5 font-mono text-[11px]">
                    Local
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 font-mono">Config: Centralized</p>
              </CardContent>
            </Card>

            {/* Roundtrip Latency */}
            <Card className="bg-white border-slate-200/90 shadow-xs hover:border-slate-300 transition-colors">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-medium uppercase tracking-wider">Roundtrip Latency</span>
                  <Activity className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xl font-semibold text-slate-900">
                    {healthResult.latencyMs !== null ? `${healthResult.latencyMs} ms` : '—'}
                  </span>
                  <Badge variant="outline" className="py-0.5 font-mono text-[11px] text-slate-600">
                    REST API
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 font-mono">GET /api/health</p>
              </CardContent>
            </Card>

          </div>
        </section>

        {/* Diagnostic Inspector Section */}
        <section aria-labelledby="diagnostics-title" className="space-y-4">
          <h2 id="diagnostics-title" className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-sky-600" />
            Health Check API Diagnostic Details
          </h2>

          <Card className="bg-white border-slate-200/90 shadow-xs overflow-hidden">
            <CardHeader className="border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded border border-sky-200">
                    GET
                  </span>
                  <span className="text-xs font-mono text-slate-700 font-medium">
                    {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/health
                  </span>
                </div>
                <div>
                  {isConnected ? (
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      200 OK — Expected Schema Valid
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded border border-rose-200 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                      Endpoint Unreachable or Error
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              {isConnected ? (
                <div className="space-y-3">
                  <div className="text-xs text-slate-600 flex items-center justify-between">
                    <span>Raw JSON response payload verified against M1 specification:</span>
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Payload Validated
                    </span>
                  </div>
                  <pre className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto shadow-inner">
                    {JSON.stringify(healthResult.data, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-rose-900">Backend Connection Inactive</h4>
                      <p className="text-xs text-rose-700 font-mono">
                        {healthResult.error || 'Connection refused or request timed out.'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
                    <p className="text-xs font-semibold text-slate-800">Developer Troubleshooting Steps:</p>
                    <ol className="text-xs text-slate-600 list-decimal list-inside space-y-1 font-mono">
                      <li>Ensure backend service is running: <span className="text-sky-700 font-semibold">cd backend && npm run dev</span></li>
                      <li>Verify backend is listening on port <span className="text-sky-700 font-semibold">5000</span> (matches <span className="text-sky-700 font-semibold">NEXT_PUBLIC_API_URL</span>)</li>
                      <li>Check CORS configuration in <span className="text-sky-700 font-semibold">backend/src/config/env.ts</span></li>
                    </ol>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Milestone 1 Architecture Scope Card */}
        <section aria-labelledby="foundation-scope-title" className="space-y-4">
          <h2 id="foundation-scope-title" className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-sky-600" />
            Architecture & Foundation Scope (M1)
          </h2>

          <Card className="bg-white border-slate-200/90 shadow-xs">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase text-slate-800 tracking-wider">
                    Foundation Boundaries Enforced:
                  </h3>
                  <ul className="text-xs text-slate-700 space-y-2">
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Monorepo separation (frontend / backend / root config)</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Strict TypeScript compilation with zero errors</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Centralized environment variable handling</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Centralized error handling and 404 middleware</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Frontend API service layer with native fetch</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                    Upcoming Milestones (Intentionally Deferred):
                  </h3>
                  <ul className="text-xs text-slate-500 space-y-2">
                    <li className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                      <span>M2: Authentication (JWT, Sessions, Multi-tenant structure)</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                      <span>M3: Database & Models (MongoDB, Mongoose, Tenant Isolation)</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                      <span>M4: Telephony Integration (Twilio Voice, Realtime Webhooks)</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                      <span>M5: AI Voice Employee (Azure OpenAI, Gemini, Scheduling CRM)</span>
                    </li>
                  </ul>
                </div>

              </div>
            </CardContent>
          </Card>
        </section>

      </div>

      {/* Footer */}
      <footer className="max-w-5xl w-full mx-auto pt-8 border-t border-slate-200 mt-12 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-500">
        <div>BlueCollar AI &copy; {new Date().getFullYear()} — Enterprise Foundation</div>
        <div className="font-mono text-[11px] text-slate-500">
          Status: Foundation Ready &bull; Port: 3000 (Web) &bull; Port: 5000 (API)
        </div>
      </footer>
    </main>
  );
}
