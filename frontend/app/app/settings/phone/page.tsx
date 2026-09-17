'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TelephonyService } from '@/services/telephony.service';
import {
  BusinessPhoneNumber,
  AvailablePhoneNumber,
  TwilioConnectionStatus,
} from '@/types/telephony';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  PhoneCall,
  Phone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Radio,
  ExternalLink,
  ShieldCheck,
  Search,
} from 'lucide-react';

export default function PhoneSettingsPage() {
  const [phoneNumbers, setPhoneNumbers] = useState<BusinessPhoneNumber[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<TwilioConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  // Search & Connect state
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [searchAreaCode, setSearchAreaCode] = useState('312');
  const [searching, setSearching] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<AvailablePhoneNumber[]>([]);
  const [manualNumber, setManualNumber] = useState('');
  const [manualSid, setManualSid] = useState('');
  const [manualFriendly, setManualFriendly] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPhoneData = async () => {
    setLoading(true);
    try {
      const [numbers, status] = await Promise.all([
        TelephonyService.getPhoneNumbers(),
        TelephonyService.getConnectionStatus(),
      ]);
      setPhoneNumbers(numbers);
      setConnectionStatus(status);
    } catch (err) {
      console.error('Failed to load phone data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPhoneData();
  }, []);

  const handleVerifyConnection = async () => {
    setVerifying(true);
    try {
      const res = await TelephonyService.getConnectionStatus();
      setConnectionStatus(res);
    } catch (err: any) {
      alert(err.message || 'Verification check failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleSearchNumbers = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const nums = await TelephonyService.searchAvailableNumbers('US', searchAreaCode);
      setAvailableNumbers(nums);
    } catch (err: any) {
      setError(err.message || 'Failed to search phone numbers');
    } finally {
      setSearching(false);
    }
  };

  const handleProvision = async (phoneNumber: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await TelephonyService.provisionNumber(phoneNumber);
      setConnectModalOpen(false);
      loadPhoneData();
    } catch (err: any) {
      setError(err.message || 'Failed to connect number');
    } finally {
      setActionLoading(false);
    }
  };

  const handleManualAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      await TelephonyService.assignNumber({
        phoneNumber: manualNumber,
        phoneNumberSid: manualSid || undefined,
        friendlyName: manualFriendly || undefined,
        isPrimary: true,
      });
      setConnectModalOpen(false);
      setManualNumber('');
      loadPhoneData();
    } catch (err: any) {
      setError(err.message || 'Failed to register number');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      await TelephonyService.setPrimaryNumber(id);
      loadPhoneData();
    } catch (err: any) {
      alert(err.message || 'Failed to set primary number');
    }
  };

  const handleDeleteNumber = async (id: string) => {
    if (!confirm('Are you sure you want to disconnect this phone number?')) return;
    try {
      await TelephonyService.deleteNumber(id);
      loadPhoneData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete phone number');
    }
  };

  const primaryNumber = phoneNumbers.find((n) => n.isPrimary) || phoneNumbers[0];

  return (
    <DashboardShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-100 flex items-center gap-2.5">
              <Phone className="w-7 h-7 text-blue-500" />
              Phone &amp; Telephony Settings
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Configure your dedicated business phone line and Twilio telephony connection
            </p>
          </div>

          <Button
            onClick={() => {
              setConnectModalOpen(true);
              handleSearchNumbers();
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Connect New Number
          </Button>
        </div>

        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-neutral-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm">Loading telephony settings...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Twilio Connection Status Card */}
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-neutral-800 text-neutral-300 border border-neutral-700">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-neutral-100">
                      Twilio Infrastructure Connection
                    </h2>
                    <p className="text-xs text-neutral-400">
                      Server-side carrier connection powering voice reception
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleVerifyConnection}
                  disabled={verifying}
                  className="bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 text-xs"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Test Connection
                    </>
                  )}
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                <div className="p-3 bg-neutral-800/60 rounded-xl border border-neutral-800">
                  <span className="text-neutral-500 block mb-1">Status</span>
                  <span
                    className={`font-semibold ${
                      connectionStatus?.connected ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {connectionStatus?.connected
                      ? '● Connected & Verified'
                      : connectionStatus?.configured
                      ? 'Configured (Unverified)'
                      : '● Simulation / Sandbox Mode'}
                  </span>
                </div>

                <div className="p-3 bg-neutral-800/60 rounded-xl border border-neutral-800">
                  <span className="text-neutral-500 block mb-1">Voice Webhook</span>
                  <span className="font-semibold text-neutral-200">
                    /api/webhooks/twilio/voice
                  </span>
                </div>

                <div className="p-3 bg-neutral-800/60 rounded-xl border border-neutral-800">
                  <span className="text-neutral-500 block mb-1">Status Callback</span>
                  <span className="font-semibold text-neutral-200">
                    /api/webhooks/twilio/status
                  </span>
                </div>
              </div>

              {connectionStatus?.message && (
                <p className="text-[11px] text-neutral-400 pt-1">
                  Note: {connectionStatus.message}
                </p>
              )}
            </div>

            {/* 2. Active Business Phone Numbers */}
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl space-y-4">
              <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-blue-400" />
                Active Business Phone Numbers
              </h2>

              {phoneNumbers.length === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                    No dedicated business number is connected. Connect your primary number to start receiving customer calls.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      setConnectModalOpen(true);
                      handleSearchNumbers();
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-xs"
                  >
                    Connect Business Number
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {phoneNumbers.map((num) => {
                    const id = num._id || (num as any).id;
                    return (
                      <div
                        key={id}
                        className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          num.isPrimary
                            ? 'bg-neutral-800/80 border-blue-500/40 ring-1 ring-blue-500/20'
                            : 'bg-neutral-800/40 border-neutral-800'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-neutral-100 font-mono">
                              {num.phoneNumber}
                            </span>
                            {num.isPrimary && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase">
                                Primary Line
                              </span>
                            )}
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Active
                            </span>
                          </div>
                          <p className="text-xs text-neutral-400">
                            {num.friendlyName || 'Main Dispatch Line'} &bull; Voice &amp; SMS Enabled
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {!num.isPrimary && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSetPrimary(id)}
                              className="text-xs bg-neutral-800 border-neutral-700 text-neutral-300"
                            >
                              Make Primary
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteNumber(id)}
                            className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 h-8"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Connect / Provision Number Modal */}
        {connectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-5 my-8">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5 text-blue-400">
                  <Phone className="w-5 h-5" />
                  <h3 className="text-base font-semibold text-neutral-100">
                    Connect Dedicated Business Number
                  </h3>
                </div>
                <button
                  onClick={() => setConnectModalOpen(false)}
                  className="text-neutral-400 hover:text-neutral-200 text-xs"
                >
                  ✕
                </button>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Option A: Search Available Numbers */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Option 1: Pick Available US Number
                </h4>

                <form onSubmit={handleSearchNumbers} className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Area Code (e.g. 312)"
                    value={searchAreaCode}
                    onChange={(e) => setSearchAreaCode(e.target.value)}
                    className="bg-neutral-800 border-neutral-700 text-xs text-neutral-100 w-44"
                  />
                  <Button
                    type="submit"
                    disabled={searching}
                    variant="outline"
                    className="bg-neutral-800 border-neutral-700 text-neutral-200 text-xs"
                  >
                    {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1" />}
                    Search Numbers
                  </Button>
                </form>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {availableNumbers.map((num) => (
                    <div
                      key={num.phoneNumber}
                      className="p-3 bg-neutral-800/70 border border-neutral-700/80 rounded-xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-neutral-100 font-mono block">
                          {num.phoneNumber}
                        </span>
                        <span className="text-[11px] text-neutral-400">
                          {num.locality ? `${num.locality}, ${num.region}` : num.friendlyName}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        disabled={actionLoading}
                        onClick={() => handleProvision(num.phoneNumber)}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-7 px-3"
                      >
                        Claim Number
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Option B: Manual Register */}
              <div className="space-y-3 pt-3 border-t border-neutral-800">
                <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Option 2: Register Existing Twilio Number
                </h4>

                <form onSubmit={handleManualAssign} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">
                        Phone Number (E.164)
                      </label>
                      <Input
                        placeholder="+13125550199"
                        value={manualNumber}
                        onChange={(e) => setManualNumber(e.target.value)}
                        className="bg-neutral-800 border-neutral-700 text-xs text-neutral-100"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">
                        Friendly Label (Optional)
                      </label>
                      <Input
                        placeholder="Main Dispatch Line"
                        value={manualFriendly}
                        onChange={(e) => setManualFriendly(e.target.value)}
                        className="bg-neutral-800 border-neutral-700 text-xs text-neutral-100"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      type="submit"
                      disabled={actionLoading || !manualNumber}
                      className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 text-xs border border-neutral-700"
                    >
                      {actionLoading ? 'Connecting...' : 'Connect Number'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
