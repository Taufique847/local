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
import { useToast } from '@/components/ui/toast';
import { TestCallModal } from '@/components/voice/test-call-modal';
import { CallForwardingWizard } from '@/components/telephony/call-forwarding-wizard';
import {
  PhoneCall,
  Phone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Search,
  ArrowLeft,
  Copy,
  Check,
  Sparkles,
  Server,
  Radio,
  X,
  PhoneForwarded,
  Volume2,
} from 'lucide-react';

export default function PhoneSettingsPage() {
  const toast = useToast();
  const [phoneNumbers, setPhoneNumbers] = useState<BusinessPhoneNumber[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<TwilioConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [isVoiceTesterOpen, setIsVoiceTesterOpen] = useState(false);

  // Carrier Forwarding Wizard State
  const [forwardingModalOpen, setForwardingModalOpen] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<'verizon' | 'att' | 'tmobile' | 'googlevoice'>('verizon');

  // Search & Connect Modal State
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'search' | 'manual'>('search');
  const [searchAreaCode, setSearchAreaCode] = useState('312');
  const [searching, setSearching] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<AvailablePhoneNumber[]>([]);
  const [manualNumber, setManualNumber] = useState('');
  const [manualSid, setManualSid] = useState('');
  const [manualFriendly, setManualFriendly] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  /**
   * Opens the real test call dialog.
   *
   * This used to synthesise a ringtone with the Web Audio API and toast
   * "Simulating Inbound Call Ring… browser test simulator" before a 1.3 second
   * delay, then open a browser imitation of the assistant. Nothing rang and
   * nothing was tested, so the theatre has been removed.
   */
  const handleTestInboundRing = () => {
    setIsVoiceTesterOpen(true);
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

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
      setError(err.message || 'Failed to search available phone numbers');
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
      setManualSid('');
      setManualFriendly('');
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
    if (!confirm('Are you sure you want to disconnect this phone number from your dispatch desk?')) return;
    try {
      await TelephonyService.deleteNumber(id);
      loadPhoneData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete phone number');
    }
  };

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto space-y-6 pb-12">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2">
          <Link
            href="/app/settings"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Settings
          </Link>
        </div>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <PhoneCall className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Phone &amp; Telephony Routing
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  Twilio Trunking
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Manage inbound business numbers, voice webhooks, and AI receptionist call routing
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestInboundRing}
              className="text-xs font-semibold h-10 px-3.5 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-all flex items-center gap-1.5"
            >
              <Volume2 className="w-4 h-4 text-emerald-600 animate-pulse" />
              Simulate Test Ring
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setForwardingModalOpen(true)}
              className="text-xs font-semibold h-10 px-3.5 rounded-xl border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100/70 transition-all flex items-center gap-1.5"
            >
              <PhoneForwarded className="w-4 h-4 text-blue-600" />
              Carrier Forwarding (*72)
            </Button>

            <Button
              onClick={() => {
                setConnectModalOpen(true);
                handleSearchNumbers();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-10 px-4 rounded-xl shadow-xs shadow-blue-600/20 transition-all"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Connect New Number
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400 bg-white border border-slate-200 rounded-2xl shadow-2xs">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-medium text-slate-600">Loading telephony infrastructure...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Twilio Infrastructure Connection Card */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Twilio Infrastructure Connection
                    </h2>
                    <p className="text-xs text-slate-500">
                      Server-side carrier connection powering automated voice reception and live call synthesis
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleVerifyConnection}
                  disabled={verifying}
                  className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-xs shadow-2xs rounded-xl h-9"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-blue-600" />
                      Testing Connection...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                      Test Connection
                    </>
                  )}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
                {/* Status Block */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Carrier Status
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          connectionStatus?.connected
                            ? 'bg-emerald-500 animate-pulse'
                            : connectionStatus?.configured
                            ? 'bg-blue-500'
                            : 'bg-amber-500'
                        }`}
                      />
                      <span
                        className={`font-bold text-xs ${
                          connectionStatus?.connected
                            ? 'text-emerald-700'
                            : connectionStatus?.configured
                            ? 'text-blue-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {connectionStatus?.connected
                          ? 'Connected & Verified'
                          : connectionStatus?.configured
                          ? 'Configured (Live Webhooks Ready)'
                          : 'Simulation / Sandbox Mode'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    {connectionStatus?.connected
                      ? 'Live inbound/outbound audio streaming active.'
                      : 'Mock telephony fallback is active for local testing.'}
                  </p>
                </div>

                {/* Voice Webhook Block */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                        Voice Inbound Webhook
                      </span>
                      <button
                        onClick={() => handleCopy('voice', '/api/webhooks/twilio/voice')}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        title="Copy webhook path"
                      >
                        {copiedKey === 'voice' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-900 break-all">
                      /api/webhooks/twilio/voice
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 block">
                    HTTP POST &bull; Returns TwiML / MediaStream
                  </span>
                </div>

                {/* Status Callback Block */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                        Status Callback Webhook
                      </span>
                      <button
                        onClick={() => handleCopy('status', '/api/webhooks/twilio/status')}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        title="Copy status callback path"
                      >
                        {copiedKey === 'status' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-900 break-all">
                      /api/webhooks/twilio/status
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 block">
                    HTTP POST &bull; Real-time duration &amp; recording sync
                  </span>
                </div>
              </div>

              {connectionStatus?.message && (
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl flex items-start gap-2.5 text-xs text-blue-800">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">System Telephony Notice:</span> {connectionStatus.message}
                  </div>
                </div>
              )}

              {/* Instant Browser Voice Demo Trigger */}
              <div className="p-4 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-blue-50/80 border border-blue-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5 text-blue-950">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Want to test Alex without configuring Twilio?</span>
                    <p className="text-[11px] text-blue-700 mt-0.5">
                      Talk directly to your AI receptionist right now from your browser microphone with real-time dispatch booking.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setIsVoiceTesterOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs shrink-0"
                >
                  🎧 Test Alex Live (Mic Demo)
                </Button>
              </div>
            </div>

            {/* 2. Active Business Phone Numbers */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">
                        Active Business Phone Numbers
                      </h2>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {phoneNumbers.length} {phoneNumbers.length === 1 ? 'Line' : 'Lines'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Customer calls ringing these numbers are answered immediately by Alex AI
                    </p>
                  </div>
                </div>
              </div>

              {phoneNumbers.length === 0 ? (
                <div className="py-12 text-center space-y-3 border-2 border-dashed border-slate-200 rounded-2xl p-8">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                    <PhoneCall className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">No Business Numbers Connected</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    You do not have a dedicated business phone line connected yet. Connect a phone number to let customers call and book appointments 24/7.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      setConnectModalOpen(true);
                      handleSearchNumbers();
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl mt-2"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Connect First Number
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {phoneNumbers.map((num) => {
                    const id = num._id || (num as any).id;
                    const isCopied = copiedKey === id;
                    return (
                      <div
                        key={id}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          num.isPrimary
                            ? 'bg-blue-50/30 border-blue-200 ring-1 ring-blue-500/20 shadow-2xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-3.5">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                              num.isPrimary
                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Phone className="w-5 h-5" />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base sm:text-lg font-bold text-slate-900 font-mono tracking-tight">
                                {num.phoneNumber}
                              </span>
                              <button
                                onClick={() => handleCopy(id, num.phoneNumber)}
                                className="text-slate-400 hover:text-blue-600 transition-colors p-1 rounded-md"
                                title="Copy number"
                              >
                                {isCopied ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>

                              {num.isPrimary && (
                                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-600 text-white uppercase tracking-wider shadow-2xs">
                                  Primary Dispatch Line
                                </span>
                              )}
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Active &bull; Ready
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">
                              <span className="font-medium text-slate-700">
                                {num.friendlyName || 'Main Reception Desk'}
                              </span>{' '}
                              &bull; Full Inbound Voice &amp; SMS Dispatch
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {!num.isPrimary && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSetPrimary(id)}
                              className="text-xs bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl shadow-2xs h-9 px-3"
                            >
                              Make Primary
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteNumber(id)}
                            className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl h-9 w-9 p-0 transition-colors"
                            title="Disconnect Number"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Carrier call-forwarding instructions. Most contractors will not
                give up the number printed on their trucks, so forwarding is the
                realistic path to going live. */}
            <CallForwardingWizard
              aiPhoneNumber={
                (phoneNumbers.find((n) => n.isPrimary) ?? phoneNumbers[0])?.phoneNumber
              }
            />
          </div>
        )}

        {/* Connect / Provision Number Modal */}
        {connectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      Connect Business Phone Line
                    </h3>
                    <p className="text-xs text-slate-500">
                      Choose a new US local number or connect your existing Twilio line
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setConnectModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Segmented Tab Bar */}
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveModalTab('search')}
                  className={`py-2 px-3 rounded-lg transition-all ${
                    activeModalTab === 'search'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Search &amp; Claim Number
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalTab('manual')}
                  className={`py-2 px-3 rounded-lg transition-all ${
                    activeModalTab === 'manual'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Connect Existing Twilio SID
                </button>
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* Tab 1: Search & Claim Available Numbers */}
              {activeModalTab === 'search' && (
                <div className="space-y-4">
                  <form onSubmit={handleSearchNumbers} className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type="text"
                        placeholder="Search by 3-digit Area Code (e.g. 312, 212, 415)"
                        value={searchAreaCode}
                        onChange={(e) => setSearchAreaCode(e.target.value)}
                        className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl h-10 pl-3 focus:bg-white"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={searching}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl h-10 px-4 shrink-0 shadow-xs"
                    >
                      {searching ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Search className="w-3.5 h-3.5 mr-1.5" />
                          Find Numbers
                        </>
                      )}
                    </Button>
                  </form>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {availableNumbers.length === 0 && !searching && (
                      <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200/80">
                        No numbers found for area code &ldquo;{searchAreaCode}&rdquo;. Try another US area code (e.g. 312, 773, 212).
                      </div>
                    )}

                    {availableNumbers.map((num) => (
                      <div
                        key={num.phoneNumber}
                        className="p-3.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors"
                      >
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-900 font-mono text-sm block">
                            {num.phoneNumber}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {num.locality ? `${num.locality}, ${num.region}` : num.friendlyName || 'United States'} &bull; Voice &amp; SMS
                          </span>
                        </div>
                        <Button
                          size="sm"
                          disabled={actionLoading}
                          onClick={() => handleProvision(num.phoneNumber)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 px-3.5 rounded-lg shadow-2xs"
                        >
                          {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Claim & Connect'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 2: Register Existing Twilio Number */}
              {activeModalTab === 'manual' && (
                <form onSubmit={handleManualAssign} className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Phone Number (E.164 Format) <span className="text-rose-500">*</span>
                      </label>
                      <Input
                        placeholder="+13125550199"
                        value={manualNumber}
                        onChange={(e) => setManualNumber(e.target.value)}
                        className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl h-10 focus:bg-white"
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Must include country code, e.g. +1 for US/Canada.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Friendly Line Label
                        </label>
                        <Input
                          placeholder="e.g. Main Dispatch Line"
                          value={manualFriendly}
                          onChange={(e) => setManualFriendly(e.target.value)}
                          className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl h-10 focus:bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Twilio Phone SID (Optional)
                        </label>
                        <Input
                          placeholder="PNxxxxxxxxxxxxxxxx"
                          value={manualSid}
                          onChange={(e) => setManualSid(e.target.value)}
                          className="bg-slate-50 border-slate-200 text-xs text-slate-900 rounded-xl h-10 focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConnectModalOpen(false)}
                      className="text-xs rounded-xl h-10 px-4 border-slate-200 text-slate-600"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={actionLoading || !manualNumber}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl h-10 px-5 shadow-xs"
                    >
                      {actionLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          Registering...
                        </>
                      ) : (
                        'Register Line'
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Carrier Call Forwarding Wizard Modal */}
        {forwardingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                    <PhoneForwarded className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Carrier Call Forwarding (*72)</h3>
                    <p className="text-xs text-slate-500">
                      Keep your existing business phone number and forward after-hours or busy calls to AI Alex
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setForwardingModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Target Forwarding Number Banner */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Your AI Receptionist Target Number</span>
                    <p className="text-sm font-bold text-slate-900 font-mono">
                      {phoneNumbers[0]?.phoneNumber || '+1 (214) 555-0199'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCopy('target_num', (phoneNumbers[0]?.phoneNumber || '+12145550199').replace(/[^0-9+]/g, ''))}
                    className="text-xs font-semibold h-8 px-3 rounded-lg border-slate-200 text-slate-700 hover:bg-white"
                  >
                    {copiedKey === 'target_num' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1" />
                        Copy Number
                      </>
                    )}
                  </Button>
                </div>

                {/* Carrier Selection Tabs */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Select Your Mobile / Landline Carrier:</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: 'verizon', name: 'Verizon' },
                      { id: 'att', name: 'AT&T' },
                      { id: 'tmobile', name: 'T-Mobile' },
                      { id: 'googlevoice', name: 'Google Voice' },
                    ].map((carrier) => (
                      <button
                        key={carrier.id}
                        type="button"
                        onClick={() => setSelectedCarrier(carrier.id as any)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border ${
                          selectedCarrier === carrier.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {carrier.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Carrier Specific Instructions */}
                <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4 text-xs text-slate-700 space-y-3">
                  {selectedCarrier === 'verizon' && (
                    <>
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                        <div>
                          <p className="font-semibold text-slate-900">Dial the Forwarding Activation Code from your business phone:</p>
                          <div className="mt-1 flex items-center gap-2">
                            <code className="bg-white border border-blue-200 px-2.5 py-1 rounded-lg font-mono text-sm font-bold text-blue-700">
                              {`*72${(phoneNumbers[0]?.phoneNumber || '+12145550199').replace(/[^0-9]/g, '')}`}
                            </code>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCopy('verizon_dial', `*72${(phoneNumbers[0]?.phoneNumber || '+12145550199').replace(/[^0-9]/g, '')}`)}
                              className="h-7 px-2 text-[11px] text-blue-700 hover:bg-blue-100"
                            >
                              {copiedKey === 'verizon_dial' ? 'Copied' : 'Copy Code'}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                        <p>Press <strong>Call</strong>. Listen for a short tone or confirmation beep, then hang up.</p>
                      </div>
                      <div className="pt-1 text-[11px] text-slate-500 border-t border-blue-100">
                        💡 <em>To deactivate forwarding later, simply dial <strong>*73</strong> and press Call.</em>
                      </div>
                    </>
                  )}

                  {selectedCarrier === 'att' && (
                    <>
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                        <div>
                          <p className="font-semibold text-slate-900">Dial the AT&T Forwarding Code:</p>
                          <div className="mt-1 flex items-center gap-2">
                            <code className="bg-white border border-blue-200 px-2.5 py-1 rounded-lg font-mono text-sm font-bold text-blue-700">
                              {`*21*${(phoneNumbers[0]?.phoneNumber || '+12145550199').replace(/[^0-9]/g, '')}#`}
                            </code>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCopy('att_dial', `*21*${(phoneNumbers[0]?.phoneNumber || '+12145550199').replace(/[^0-9]/g, '')}#`)}
                              className="h-7 px-2 text-[11px] text-blue-700 hover:bg-blue-100"
                            >
                              {copiedKey === 'att_dial' ? 'Copied' : 'Copy Code'}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                        <p>Press <strong>Call</strong>. Wait for the confirmation message on screen.</p>
                      </div>
                      <div className="pt-1 text-[11px] text-slate-500 border-t border-blue-100">
                        💡 <em>To turn off AT&T forwarding later, dial <strong>#21#</strong> and press Call.</em>
                      </div>
                    </>
                  )}

                  {selectedCarrier === 'tmobile' && (
                    <>
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                        <div>
                          <p className="font-semibold text-slate-900">Dial the T-Mobile Conditional Forwarding Code:</p>
                          <div className="mt-1 flex items-center gap-2">
                            <code className="bg-white border border-blue-200 px-2.5 py-1 rounded-lg font-mono text-sm font-bold text-blue-700">
                              {`**21*${(phoneNumbers[0]?.phoneNumber || '+12145550199').replace(/[^0-9]/g, '')}#`}
                            </code>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCopy('tmobile_dial', `**21*${(phoneNumbers[0]?.phoneNumber || '+12145550199').replace(/[^0-9]/g, '')}#`)}
                              className="h-7 px-2 text-[11px] text-blue-700 hover:bg-blue-100"
                            >
                              {copiedKey === 'tmobile_dial' ? 'Copied' : 'Copy Code'}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                        <p>Press <strong>Call</strong>. You will see a success message: &quot;Call Forwarding Registration was successful&quot;.</p>
                      </div>
                      <div className="pt-1 text-[11px] text-slate-500 border-t border-blue-100">
                        💡 <em>To deactivate T-Mobile forwarding later, dial <strong>##21#</strong>.</em>
                      </div>
                    </>
                  )}

                  {selectedCarrier === 'googlevoice' && (
                    <div className="space-y-2">
                      <p className="font-semibold text-slate-900">Forwarding from Google Voice App or Web:</p>
                      <ol className="list-decimal list-inside space-y-1 text-slate-600">
                        <li>Open Google Voice ➔ Settings ➔ <strong>Calls</strong>.</li>
                        <li>Click <strong>&quot;Forward calls to&quot;</strong> and click <strong>New linked number</strong>.</li>
                        <li>Enter your AI Receptionist Number: <code className="font-mono font-bold text-blue-700">{phoneNumbers[0]?.phoneNumber || '+1 (214) 555-0199'}</code>.</li>
                        <li>Verify and toggle forwarding ON.</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestInboundRing}
                  className="text-xs font-semibold h-9 px-3 rounded-xl border-slate-200 text-slate-700 hover:bg-white flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                  Test Ring AI Receptionist
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    setForwardingModalOpen(false);
                    toast.success('Carrier Instructions Saved', 'Forwarding dial code is ready on your mobile device.');
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-9 px-4 rounded-xl shadow-xs"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Places a real call from the AI line to the owner's own number. */}
        <TestCallModal
          isOpen={isVoiceTesterOpen}
          onClose={() => setIsVoiceTesterOpen(false)}
        />
      </div>
    </DashboardShell>
  );
}
