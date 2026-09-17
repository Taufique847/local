'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TelephonyService } from '@/services/telephony.service';
import { CallLog, CallStats, CallStatus, CallDirection } from '@/types/telephony';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Search,
  Loader2,
  Clock,
  User,
  ArrowRight,
  Plus,
  Play,
  Settings,
  ChevronLeft,
  ChevronRight,
  Filter,
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

export default function CallsPage() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Simulation modal
  const [simModalOpen, setSimModalOpen] = useState(false);
  const [simPhone, setSimPhone] = useState('+1 (555) 789-0123');
  const [simDuration, setSimDuration] = useState('60');
  const [simulating, setSimulating] = useState(false);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const [callsRes, statsRes] = await Promise.all([
        TelephonyService.getCalls({
          page,
          limit: 15,
          search: search.trim() || undefined,
          direction: directionFilter !== 'all' ? directionFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        TelephonyService.getCallStats(),
      ]);

      setCalls(callsRes.calls || []);
      setTotal(callsRes.total || 0);
      setTotalPages(callsRes.totalPages || 1);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to fetch calls:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, directionFilter, statusFilter]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    try {
      await TelephonyService.simulateCall(simPhone, Number(simDuration) || 45);
      setSimModalOpen(false);
      fetchCalls();
    } catch (err: any) {
      alert(err.message || 'Failed to simulate call');
    } finally {
      setSimulating(false);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '';
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

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-100 flex items-center gap-2.5">
              <PhoneCall className="w-7 h-7 text-blue-500" />
              Calls Log
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Manage incoming customer calls, telephony sessions, and dispatch records
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/app/settings/phone">
              <Button
                variant="outline"
                className="bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 text-xs"
              >
                <Settings className="w-3.5 h-3.5 mr-1.5" />
                Phone Settings
              </Button>
            </Link>

            <Button
              onClick={() => setSimModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-lg shadow-blue-600/20"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Simulate Inbound Call
            </Button>
          </div>
        </div>

        {/* KPI Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="p-4">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                Total Calls
              </span>
              <div className="mt-2 text-2xl font-bold text-neutral-100">
                {stats?.total ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="p-4">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                Inbound
              </span>
              <div className="mt-2 text-2xl font-bold text-blue-400">
                {stats?.inbound ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="p-4">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                Completed
              </span>
              <div className="mt-2 text-2xl font-bold text-emerald-400">
                {stats?.completed ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800">
            <CardContent className="p-4">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                Missed / Busy
              </span>
              <div className="mt-2 text-2xl font-bold text-amber-400">
                {stats?.missed ?? 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Bar */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search by caller number or customer name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={directionFilter}
              onChange={(e) => {
                setDirectionFilter(e.target.value);
                setPage(1);
              }}
              className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="ringing">Ringing</option>
              <option value="no_answer">No Answer</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Calls Table */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-neutral-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm">Loading call logs...</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
              <PhoneCall className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-neutral-200">No calls yet</h3>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              Your incoming business calls will appear here once your Twilio phone number is connected,
              or trigger a simulated call below.
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <Button
                size="sm"
                onClick={() => setSimModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-xs"
              >
                Simulate Inbound Call
              </Button>
              <Link href="/app/settings/phone">
                <Button size="sm" variant="outline" className="text-xs bg-neutral-800 border-neutral-700">
                  Connect Phone Number
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-neutral-800/70 border-b border-neutral-800 uppercase tracking-wider text-neutral-400 font-semibold">
                  <tr>
                    <th className="px-5 py-3.5">Caller / Customer</th>
                    <th className="px-5 py-3.5">Called Number</th>
                    <th className="px-5 py-3.5">Direction</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Date & Time</th>
                    <th className="px-5 py-3.5">Duration</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {calls.map((call) => {
                    const cust = call.customerId as any;
                    const id = call._id || (call as any).id;

                    return (
                      <tr key={id} className="hover:bg-neutral-800/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-neutral-100">
                            {call.from}
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            {cust ? `${cust.firstName} ${cust.lastName}` : 'Unmatched Caller'}
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          <span className="font-mono text-neutral-300">{call.to}</span>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 font-medium text-neutral-200 capitalize">
                            {call.direction === 'inbound' ? (
                              <PhoneIncoming className="w-3.5 h-3.5 text-blue-400" />
                            ) : (
                              <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            {call.direction}
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${
                              STATUS_BADGES[call.status] || 'bg-neutral-800 text-neutral-400'
                            }`}
                          >
                            {call.status.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 text-neutral-400">
                          {formatDateTime(call.startedAt)}
                        </td>

                        <td className="px-5 py-3.5 font-mono text-neutral-300">
                          {formatDuration(call.durationSeconds)}
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <Link href={`/app/calls/${id}`}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                            >
                              Details
                              <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800 bg-neutral-900/80">
                <span className="text-xs text-neutral-400">
                  Page {page} of {totalPages} ({total} calls)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1 text-xs rounded-lg bg-neutral-800 text-neutral-300 disabled:opacity-50 hover:bg-neutral-700"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1 text-xs rounded-lg bg-neutral-800 text-neutral-300 disabled:opacity-50 hover:bg-neutral-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Simulate Call Modal */}
        {simModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2.5 text-blue-400">
                <PhoneCall className="w-5 h-5" />
                <h3 className="text-base font-semibold text-neutral-100">Simulate Inbound Call</h3>
              </div>
              <p className="text-xs text-neutral-400">
                Trigger a simulated incoming phone call to test customer phone mapping, duration tracking, and call logging.
              </p>
              <form onSubmit={handleSimulate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Caller Phone Number
                  </label>
                  <Input
                    value={simPhone}
                    onChange={(e) => setSimPhone(e.target.value)}
                    placeholder="+1 (555) 789-0123"
                    className="bg-neutral-800 border-neutral-700 text-neutral-100 text-xs"
                    required
                  />
                  <span className="text-[11px] text-neutral-500 mt-0.5 block">
                    Use an existing customer phone to verify automatic CRM matching.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Call Duration (seconds)
                  </label>
                  <Input
                    type="number"
                    min="5"
                    max="1800"
                    value={simDuration}
                    onChange={(e) => setSimDuration(e.target.value)}
                    className="bg-neutral-800 border-neutral-700 text-neutral-100 text-xs"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSimModalOpen(false)}
                    className="bg-neutral-800 border-neutral-700 text-neutral-300 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={simulating}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
                  >
                    {simulating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Simulating...
                      </>
                    ) : (
                      'Simulate Call'
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
