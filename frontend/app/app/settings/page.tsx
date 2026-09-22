'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import {
  Settings,
  BookOpen,
  ShieldCheck,
  MapPin,
  Star,
  Plus,
  Trash2,
  Save,
  Loader2,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  CheckCircle2,
  ExternalLink,
  Tag,
  Sliders,
  HelpCircle,
  Wrench,
  ShieldAlert,
  PhoneForwarded,
  ChevronRight,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DispatchService, ServiceZone } from '@/services/operations.service';
import {
  KnowledgeService,
  KnowledgeItem,
  PolicyService,
  BusinessPolicy,
  POLICY_DEFAULTS,
} from '@/services/ai-config.service';
import { BusinessService } from '@/services/business.service';
import { toErrorMessage } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

export default function SettingsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'knowledge' | 'policies' | 'zones' | 'reviews'>('knowledge');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Tab 1: Knowledge Base FAQs
  const [faqs, setFaqs] = useState<KnowledgeItem[]>([]);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newCategory, setNewCategory] = useState('pricing');
  const [savingFaq, setSavingFaq] = useState(false);
  const [faqError, setFaqError] = useState<string | null>(null);

  // Tab 2: Policy Configuration
  const [policies, setPolicies] = useState<BusinessPolicy>(POLICY_DEFAULTS);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [policyError, setPolicyError] = useState<string | null>(null);

  // Tab 3: Service Zones
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [zoneFormOpen, setZoneFormOpen] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneZips, setNewZoneZips] = useState('');
  const [newZoneBuffer, setNewZoneBuffer] = useState('30');
  const [savingZone, setSavingZone] = useState(false);
  const [zoneError, setZoneError] = useState<string | null>(null);

  // Tab 4: Reputation & Review Shielding.
  // Rating KPIs now live on /app/reviews rather than being duplicated here.
  //
  // Starts empty. The previous default was a fabricated Google URL containing a
  // slug in place of a real Place ID, which produced a broken review link.
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [savingReviewUrl, setSavingReviewUrl] = useState(false);

  const fetchSettingsData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // allSettled so one failing module does not blank the whole page, but
    // failures are still surfaced instead of being swallowed by `.catch(() => {})`
    // the way they were before.
    const [kbRes, policyRes, zonesRes, bizRes] = await Promise.allSettled([
      KnowledgeService.list(),
      PolicyService.get(),
      DispatchService.getZones(),
      BusinessService.getMyBusiness(),
    ]);

    if (kbRes.status === 'fulfilled') setFaqs(kbRes.value);
    if (policyRes.status === 'fulfilled') setPolicies(policyRes.value);
    if (zonesRes.status === 'fulfilled') setZones(zonesRes.value);
    // The saved Google review link lives on the business record.
    if (bizRes.status === 'fulfilled') setGoogleReviewUrl(bizRes.value?.googleReviewUrl ?? '');

    const failed = [kbRes, policyRes, zonesRes, bizRes].filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (failed.length > 0) {
      setLoadError(
        toErrorMessage(failed[0].reason, 'Some settings could not be loaded. Try refreshing.')
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettingsData();
  }, [fetchSettingsData]);

  // Handle saving policy configuration
  const handleSavePolicies = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setPolicyError(null);
    try {
      const saved = await PolicyService.update(policies);
      setPolicies((prev) => ({ ...prev, ...saved }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      // Previously a failed save was only console.logged, so the operator saw
      // nothing and assumed their guardrails had been applied.
      setPolicyError(toErrorMessage(err, 'Could not save your guardrail settings.'));
    } finally {
      setSaving(false);
    }
  };

  // Add emergency keyword
  const handleAddKeyword = () => {
    if (!newKeywordInput.trim()) return;
    const clean = newKeywordInput.trim().toLowerCase();
    if (policies.emergencyKeywords.includes(clean)) {
      setNewKeywordInput('');
      return;
    }
    setPolicies((prev) => ({
      ...prev,
      emergencyKeywords: [...prev.emergencyKeywords, clean],
    }));
    setNewKeywordInput('');
  };

  // Remove emergency keyword
  const handleRemoveKeyword = (keyword: string) => {
    setPolicies((prev) => ({
      ...prev,
      emergencyKeywords: prev.emergencyKeywords.filter((k) => k !== keyword),
    }));
  };

  // Create new FAQ in Knowledge Base
  const handleCreateFAQ = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;

    setFaqError(null);
    setSavingFaq(true);
    try {
      await KnowledgeService.create({
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
        category: newCategory,
      });
      setNewQuestion('');
      setNewAnswer('');
      setFaqModalOpen(false);
      setFaqs(await KnowledgeService.list());
      toast.success('Answer saved', 'The AI can now use this when callers ask.');
    } catch (err) {
      setFaqError(toErrorMessage(err, 'Could not save that answer.'));
    } finally {
      setSavingFaq(false);
    }
  };

  /** Creates a service zone. Backend validates the ZIP format. */
  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setZoneError(null);

    const zipCodes = Array.from(
      new Set(
        newZoneZips
          .split(/[\s,]+/)
          .map((z) => z.trim())
          .filter(Boolean)
      )
    );

    if (!newZoneName.trim()) {
      setZoneError('Give the zone a name.');
      return;
    }
    if (zipCodes.length === 0) {
      setZoneError('Add at least one ZIP code.');
      return;
    }
    const invalid = zipCodes.filter((z) => !/^\d{5}$/.test(z));
    if (invalid.length > 0) {
      setZoneError(`These are not valid 5-digit ZIP codes: ${invalid.join(', ')}`);
      return;
    }

    setSavingZone(true);
    try {
      await DispatchService.createZone({
        name: newZoneName.trim(),
        zipCodes,
        travelBufferMinutes: Number(newZoneBuffer) || 30,
      });
      setNewZoneName('');
      setNewZoneZips('');
      setNewZoneBuffer('30');
      setZoneFormOpen(false);
      setZones(await DispatchService.getZones());
      toast.success('Zone created', 'The AI will route matching callers to this territory.');
    } catch (err) {
      setZoneError(toErrorMessage(err, 'Could not create the zone.'));
    } finally {
      setSavingZone(false);
    }
  };

  const handleDeleteZone = async (id: string, name: string) => {
    setZoneError(null);
    try {
      await DispatchService.deleteZone(id);
      setZones((prev) => prev.filter((z) => z._id !== id));
      toast.success('Zone removed', `${name} is no longer used for routing.`);
    } catch (err) {
      setZoneError(toErrorMessage(err, 'Could not remove the zone.'));
    }
  };

  /**
   * Persists the Google review link.
   *
   * This field existed in the UI with only a "Test Link" button and was never
   * saved, so the review engine had no valid URL to send happy customers to.
   */
  const handleSaveReviewUrl = async () => {
    setSavingReviewUrl(true);
    try {
      await BusinessService.savePhoneSetup({ googleReviewUrl: googleReviewUrl.trim() });
      toast.success(
        'Review link saved',
        googleReviewUrl.trim()
          ? 'Customers who rate you 4 or 5 stars will get this link.'
          : 'Link cleared — happy customers will just get a thank you.'
      );
    } catch (err) {
      toast.error('Could not save', toErrorMessage(err));
    } finally {
      setSavingReviewUrl(false);
    }
  };

  // Delete FAQ
  const handleDeleteFAQ = async (id: string) => {
    try {
      await KnowledgeService.remove(id);
      setFaqs((prev) => prev.filter((f) => f._id !== id));
    } catch (err) {
      toast.error('Could not delete', toErrorMessage(err));
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Settings className="w-7 h-7 text-blue-600" />
              Business Intelligence & Policy Settings
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Configure knowledge base answers, AI guardrails, dispatch zones, and Google 5-star review shielding
            </p>
          </div>

          {saveSuccess && (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs py-1 px-3 flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Settings saved successfully!
            </Badge>
          )}
        </div>

        {/* Load failure notice. Previously every fetch here was wrapped in
            `.catch(() => ({}))`, so an API outage rendered as "nothing is
            configured" and an operator could overwrite real settings with
            defaults. */}
        {loadError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">{loadError}</p>
              <button
                type="button"
                onClick={fetchSettingsData}
                className="mt-1 font-semibold underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Quick access to the pages these settings actually drive. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link href="/app/settings/phone">
            <div className="group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition-all hover:border-blue-200 hover:shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50">
                <PhoneForwarded className="h-5 w-5 text-blue-600" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                  Phone line &amp; call forwarding
                </span>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Connect a number, or forward your existing one to the AI
                </p>
              </div>
              <ChevronRight
                className="h-4 w-4 text-slate-300 transition-colors group-hover:text-blue-500"
                aria-hidden="true"
              />
            </div>
          </Link>

          <Link href="/app/reviews">
            <div className="group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition-all hover:border-amber-200 hover:shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50">
                <Star className="h-5 w-5 text-amber-500" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-bold text-slate-900 transition-colors group-hover:text-amber-600">
                  Reviews &amp; escalations
                </span>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  See ratings and resolve complaints kept off Google
                </p>
              </div>
              <ChevronRight
                className="h-4 w-4 text-slate-300 transition-colors group-hover:text-amber-500"
                aria-hidden="true"
              />
            </div>
          </Link>

          <Link href="/app/settings/team">
            <div className="group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition-all hover:border-violet-200 hover:shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50">
                <Users className="h-5 w-5 text-violet-600" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-bold text-slate-900 transition-colors group-hover:text-violet-600">
                  Team &amp; access
                </span>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Give staff their own logins instead of sharing yours
                </p>
              </div>
              <ChevronRight
                className="h-4 w-4 text-slate-300 transition-colors group-hover:text-violet-500"
                aria-hidden="true"
              />
            </div>
          </Link>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab('knowledge')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'knowledge'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            AI Knowledge Base & FAQs ({faqs.length})
          </button>

          <button
            onClick={() => setActiveTab('policies')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'policies'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Guardrails & Emergency Policies
          </button>

          <button
            onClick={() => setActiveTab('zones')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'zones'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Service Zones & Tech Routing ({zones.length})
          </button>

          <button
            onClick={() => setActiveTab('reviews')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'reviews'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Star className="w-4 h-4 text-amber-500" />
            Reputation & Review Shielding
          </button>
        </div>

        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-medium">Loading configuration modules...</p>
          </div>
        ) : (
          <>
            {/* Tab 1: AI Knowledge Base */}
            {activeTab === 'knowledge' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Company FAQs & Diagnostic Policies
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      The AI receptionist uses these verified facts to answer caller questions accurately.
                    </p>
                  </div>
                  <Button
                    onClick={() => setFaqModalOpen(true)}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Knowledge FAQ
                  </Button>
                </div>

                {/* Diagnostic Fee Policy Card */}
                <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-blue-950">Standard Diagnostic Trip Fee</p>
                      <p className="text-[11px] text-blue-700">
                        Quoted by the AI receptionist before confirming technician arrival windows.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-lg font-bold text-blue-900">${policies.diagnosticFee}</span>
                      <span className="text-[10px] text-blue-600 block">Residential Standard</span>
                    </div>
                    <div className="text-right border-l border-blue-200 pl-3">
                      <span className="text-lg font-bold text-blue-900">${policies.emergencyFee}</span>
                      <span className="text-[10px] text-blue-600 block">After-Hours / Emergency</span>
                    </div>
                  </div>
                </div>

                {/* FAQ List */}
                {faqs.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                    <HelpCircle className="w-10 h-10 mx-auto text-slate-300" />
                    <h4 className="text-sm font-semibold text-slate-700">No knowledge items added yet</h4>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Add answers regarding pricing, service warranties, and technician availability.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {faqs.map((faq) => (
                      <div
                        key={faq._id}
                        className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] capitalize">
                              {faq.category || 'General'}
                            </Badge>
                            <button
                              onClick={() => handleDeleteFAQ(faq._id)}
                              className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                              title="Delete FAQ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <h4 className="text-xs font-semibold text-slate-900 leading-snug">
                            {faq.question}
                          </h4>
                          <p className="text-xs text-slate-600 leading-relaxed pt-1">
                            {faq.answer}
                          </p>
                        </div>
                        <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                          <span>Verified for AI RAG</span>
                          <span>Updated {new Date(faq.updatedAt || faq.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Guardrails & Emergency Policies */}
            {activeTab === 'policies' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Autonomous Guardrails & Emergency Detection
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Control scheduling limits and keywords that force immediate emergency transfers.
                    </p>
                  </div>
                  <Button
                    onClick={handleSavePolicies}
                    disabled={saving}
                    size="sm"
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save Policy Changes
                  </Button>
                </div>

                {/* A failed policy save used to be console.logged only, so the
                    operator believed their guardrails were live when they were not. */}
                {policyError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{policyError}</span>
                  </div>
                )}

                {/*
                  Legal disclosure. Previously nothing was announced at all: the
                  assistant answered with a human first name and the call was
                  transcribed and stored with no notice to the caller.
                */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                        <h4 className="text-xs font-bold text-slate-900">
                          Spoken disclosure before the AI answers
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                        Tells callers they are speaking with an automated assistant and that the
                        call is recorded and transcribed. Around a dozen US states require every
                        party to consent before a call is recorded, and disclosure rules for
                        synthetic voices are expanding. Keep this on unless your lawyer says
                        otherwise.
                      </p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={policies.aiDisclosureEnabled !== false}
                        onChange={(e) =>
                          setPolicies((p) => ({ ...p, aiDisclosureEnabled: e.target.checked }))
                        }
                        className="h-4 w-4 cursor-pointer accent-emerald-600"
                      />
                      <span className="text-xs font-semibold text-slate-700">
                        {policies.aiDisclosureEnabled !== false ? 'On' : 'Off'}
                      </span>
                    </label>
                  </div>

                  {policies.aiDisclosureEnabled === false && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        Callers will hear no notice that they are talking to an AI or that the call
                        is recorded. In all-party consent states this can make the recording
                        unlawful.
                      </span>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="ai-disclosure-text"
                      className="mb-1.5 block text-[11px] font-bold text-slate-700"
                    >
                      Custom wording <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <Input
                      id="ai-disclosure-text"
                      type="text"
                      maxLength={400}
                      value={policies.aiDisclosureText || ''}
                      onChange={(e) =>
                        setPolicies((p) => ({ ...p, aiDisclosureText: e.target.value }))
                      }
                      placeholder="Leave blank to use the standard notice"
                      disabled={policies.aiDisclosureEnabled === false}
                      className="text-xs bg-white border-slate-200 text-slate-900 rounded-xl"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">
                      Spoken by the phone system before the assistant connects, so it cannot be
                      interrupted or skipped.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Advance Notice Slider */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <h4 className="text-xs font-bold text-slate-900">Minimum Advance Notice</h4>
                      </div>
                      <span className="text-sm font-bold text-blue-600">
                        {policies.minBookingNoticeHours} Hours
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      The AI will never book an appointment closer than this window, ensuring dispatchers have time to assign technicians.
                    </p>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      step={1}
                      value={policies.minBookingNoticeHours}
                      onChange={(e) =>
                        setPolicies((p) => ({ ...p, minBookingNoticeHours: Number(e.target.value) }))
                      }
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>1 Hour (Same Day)</span>
                      <span>6 Hours</span>
                      <span>12 Hours</span>
                    </div>
                  </div>

                  {/* Booking Horizon Slider */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-purple-600" />
                        <h4 className="text-xs font-bold text-slate-900">Maximum Booking Horizon</h4>
                      </div>
                      <span className="text-sm font-bold text-purple-600">
                        {policies.maxBookingHorizonDays} Days
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      How far into the future customers are allowed to schedule seasonal tune-ups and routine maintenance.
                    </p>
                    <input
                      type="range"
                      min={14}
                      max={90}
                      step={7}
                      value={policies.maxBookingHorizonDays}
                      onChange={(e) =>
                        setPolicies((p) => ({ ...p, maxBookingHorizonDays: Number(e.target.value) }))
                      }
                      className="w-full accent-purple-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>14 Days</span>
                      <span>45 Days</span>
                      <span>90 Days</span>
                    </div>
                  </div>
                </div>

                {/* Emergency Keywords Manager */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                        Emergency Trigger Keywords (Auto-Transfer Protocol)
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        When a caller mentions any of these phrases, the AI immediately initiates emergency dispatch or warm transfer to the on-call tech.
                      </p>
                    </div>
                  </div>

                  {/* Chips */}
                  <div className="flex flex-wrap items-center gap-2">
                    {policies.emergencyKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200"
                      >
                        {kw}
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(kw)}
                          className="hover:text-rose-900 ml-0.5"
                        >
                          ✕
                        </button>
                      </span>
                    ))}

                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="+ Keyword (e.g. electrical fire)"
                        value={newKeywordInput}
                        onChange={(e) => setNewKeywordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddKeyword();
                          }
                        }}
                        className="h-8 px-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAddKeyword}
                        disabled={!newKeywordInput.trim()}
                        className="h-8 px-2.5 text-xs"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Service Zones & Tech Routing — now full CRUD. This tab was
                previously read-only even though the backend already supported
                creating zones. */}
            {activeTab === 'zones' && (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Service zones</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Group ZIP codes into territories so the AI offers slots from a technician who
                      is already nearby.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setZoneFormOpen((v) => !v)}
                    className="shrink-0 bg-blue-600 text-xs text-white hover:bg-blue-500"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Add zone
                  </Button>
                </div>

                {zoneError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{zoneError}</span>
                  </div>
                )}

                {zoneFormOpen && (
                  <form
                    onSubmit={handleCreateZone}
                    className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4"
                    noValidate
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="zone-name"
                          className="mb-1 block text-xs font-semibold text-slate-700"
                        >
                          Zone name
                        </label>
                        <Input
                          id="zone-name"
                          value={newZoneName}
                          onChange={(e) => setNewZoneName(e.target.value)}
                          placeholder="North Dallas"
                          className="text-xs"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="zone-buffer"
                          className="mb-1 block text-xs font-semibold text-slate-700"
                        >
                          Drive-time buffer (minutes)
                        </label>
                        <Input
                          id="zone-buffer"
                          type="number"
                          min={0}
                          max={240}
                          value={newZoneBuffer}
                          onChange={(e) => setNewZoneBuffer(e.target.value)}
                          className="text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="zone-zips"
                        className="mb-1 block text-xs font-semibold text-slate-700"
                      >
                        ZIP codes
                      </label>
                      <Input
                        id="zone-zips"
                        value={newZoneZips}
                        onChange={(e) => setNewZoneZips(e.target.value)}
                        placeholder="75001, 75002, 75006"
                        className="font-mono text-xs"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Separate with commas or spaces. Five digits each.
                      </p>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setZoneFormOpen(false)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={savingZone}
                        className="bg-blue-600 text-xs text-white hover:bg-blue-500"
                      >
                        {savingZone && (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        )}
                        Create zone
                      </Button>
                    </div>
                  </form>
                )}

                {zones.length === 0 ? (
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400">
                    <MapPin className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
                    <h4 className="text-sm font-semibold text-slate-700">No service zones yet</h4>
                    <p className="mx-auto max-w-sm text-xs text-slate-400">
                      Without zones, every technician is considered equally available for every ZIP
                      code.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {zones.map((zone) => (
                      <div
                        key={zone._id}
                        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{zone.name}</h4>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Badge className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                              {zone.travelBufferMinutes ?? 30} min buffer
                            </Badge>
                            <button
                              type="button"
                              onClick={() => handleDeleteZone(zone._id, zone.name)}
                              aria-label={`Remove ${zone.name}`}
                              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <span className="mb-1.5 block text-[11px] font-medium text-slate-400">
                            {zone.zipCodes?.length ?? 0} ZIP code
                            {(zone.zipCodes?.length ?? 0) === 1 ? '' : 's'}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(zone.zipCodes || []).map((zip: string) => (
                              <span
                                key={zip}
                                className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700"
                              >
                                {zip}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Reputation & Review Shielding (M24) */}
            {activeTab === 'reviews' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Automated Review & Reputation Shielding Engine (M24)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Automatically triggers CSAT surveys after job completion. 4-5 stars are forwarded to Google Reviews; 1-3 stars are strictly shielded.
                  </p>
                </div>

                {/* Google Review URL config.
                    This field previously had only a "Test Link" button and was
                    never persisted, so the review engine had no valid URL and
                    happy customers received no Google link at all. */}
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                  <div>
                    <label
                      htmlFor="google-review-url"
                      className="text-xs font-bold text-slate-900"
                    >
                      Google review link
                    </label>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Sent only to customers who rate their technician 4 or 5 stars. Leave blank and
                      they simply get a thank you instead of a broken link.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="google-review-url"
                      type="url"
                      inputMode="url"
                      placeholder="https://g.page/r/.../review"
                      value={googleReviewUrl}
                      onChange={(e) => setGoogleReviewUrl(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveReviewUrl}
                        disabled={savingReviewUrl}
                        className="bg-blue-600 text-xs text-white hover:bg-blue-500"
                      >
                        {savingReviewUrl ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!googleReviewUrl.trim()}
                        onClick={() =>
                          window.open(googleReviewUrl.trim(), '_blank', 'noopener,noreferrer')
                        }
                        className="text-xs"
                      >
                        <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Test
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] leading-relaxed text-slate-600">
                      <span className="font-semibold text-slate-800">Where to find this:</span> open
                      your Google Business Profile, choose <em>Ask for reviews</em>, and copy the
                      short link it gives you. A link built from your business name will not work —
                      it needs your real Place ID.
                    </p>
                  </div>
                </div>

                {/* Ratings and escalations live on their own page; duplicating the
                    KPI tiles here meant two places to maintain and two numbers to
                    disagree. */}
                <Link
                  href="/app/reviews"
                  className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition-all hover:border-amber-200 hover:shadow-sm"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50">
                    <Star className="h-5 w-5 text-amber-500" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-bold text-slate-900 transition-colors group-hover:text-amber-600">
                      View ratings and escalations
                    </span>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Response rates, average rating, and complaints waiting on a call back
                    </p>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 text-slate-300 transition-colors group-hover:text-amber-500"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            )}
          </>
        )}

        {/* Add FAQ Modal */}
        {faqModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Add Company Knowledge Base Item</h3>

              {faqError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{faqError}</span>
                </div>
              )}

              <form onSubmit={handleCreateFAQ} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 outline-none"
                  >
                    <option value="pricing">Pricing & Diagnostic Fees</option>
                    <option value="warranty">Warranties & Guarantees</option>
                    <option value="service_area">Service Area & Territory</option>
                    <option value="general">General HVAC Information</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Question / Topic</label>
                  <Input
                    type="text"
                    required
                    placeholder="e.g. Do you charge a diagnostic trip fee?"
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Verified Answer</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Yes, our standard residential diagnostic fee is $89, which is waived if you proceed with the repair."
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFaqModalOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={savingFaq}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
                  >
                    {savingFaq && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    )}
                    Add Knowledge Item
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
