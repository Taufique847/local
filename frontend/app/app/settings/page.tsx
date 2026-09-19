'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'knowledge' | 'policies' | 'zones' | 'reviews'>('knowledge');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Tab 1: Knowledge Base FAQs
  const [faqs, setFaqs] = useState<any[]>([]);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newCategory, setNewCategory] = useState('pricing');

  // Tab 2: Policy Configuration
  const [policies, setPolicies] = useState<{
    minAdvanceNoticeHours: number;
    maxBookingHorizonDays: number;
    emergencyKeywords: string[];
    diagnosticFee: number;
    emergencyFee: number;
  }>({
    minAdvanceNoticeHours: 2,
    maxBookingHorizonDays: 60,
    emergencyKeywords: ['gas leak', 'carbon monoxide', 'sparks', 'smoke', 'flooding', 'freezing'],
    diagnosticFee: 89,
    emergencyFee: 149,
  });
  const [newKeywordInput, setNewKeywordInput] = useState('');

  // Tab 3: Service Zones
  const [zones, setZones] = useState<any[]>([]);

  // Tab 4: Reputation & Review Shielding
  const [reputationStats, setReputationStats] = useState<any | null>(null);
  const [googleReviewUrl, setGoogleReviewUrl] = useState(
    'https://search.google.com/local/writereview?placeid=Apex-Heating-Air'
  );

  const fetchSettingsData = useCallback(async () => {
    setLoading(true);
    try {
      const [kbRes, policyRes, zonesRes, repRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/knowledge`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({ items: [] })),
        fetch(`${API_BASE_URL}/api/policies`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({})),
        fetch(`${API_BASE_URL}/api/dispatch/zones`, { credentials: 'include' }).then((r) => r.json()).catch(() => ({ zones: [] })),
        fetch(`${API_BASE_URL}/api/reviews/stats`, { credentials: 'include' }).then((r) => r.json()).catch(() => null),
      ]);

      if (kbRes.items) setFaqs(kbRes.items);
      if (policyRes.policy) {
        setPolicies({
          minAdvanceNoticeHours: policyRes.policy.minAdvanceNoticeHours ?? 2,
          maxBookingHorizonDays: policyRes.policy.maxBookingHorizonDays ?? 60,
          emergencyKeywords: policyRes.policy.emergencyKeywords || ['gas leak', 'carbon monoxide', 'sparks', 'smoke', 'flooding'],
          diagnosticFee: policyRes.policy.diagnosticFee ?? 89,
          emergencyFee: policyRes.policy.emergencyFee ?? 149,
        });
      }
      if (zonesRes.zones) setZones(zonesRes.zones);
      if (repRes) setReputationStats(repRes);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettingsData();
  }, [fetchSettingsData]);

  // Handle saving policy configuration
  const handleSavePolicies = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/policies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(policies),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save policies:', err);
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

    try {
      const res = await fetch(`${API_BASE_URL}/api/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question: newQuestion.trim(),
          answer: newAnswer.trim(),
          category: newCategory,
        }),
      });

      if (res.ok) {
        setNewQuestion('');
        setNewAnswer('');
        setFaqModalOpen(false);
        fetchSettingsData();
      }
    } catch (err) {
      console.error('Failed to create FAQ:', err);
    }
  };

  // Delete FAQ
  const handleDeleteFAQ = async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/knowledge/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setFaqs((prev) => prev.filter((f) => f._id !== id));
    } catch (err) {
      console.error('Failed to delete FAQ:', err);
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Advance Notice Slider */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <h4 className="text-xs font-bold text-slate-900">Minimum Advance Notice</h4>
                      </div>
                      <span className="text-sm font-bold text-blue-600">
                        {policies.minAdvanceNoticeHours} Hours
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
                      value={policies.minAdvanceNoticeHours}
                      onChange={(e) =>
                        setPolicies((p) => ({ ...p, minAdvanceNoticeHours: Number(e.target.value) }))
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

            {/* Tab 3: Service Zones & Tech Routing */}
            {activeTab === 'zones' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Geographic Service Zones & Territory Clustering (M23)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Clustering zip codes minimizes technician drive-time by matching calls to certified local specialists.
                  </p>
                </div>

                {zones.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                    <MapPin className="w-10 h-10 mx-auto text-slate-300" />
                    <h4 className="text-sm font-semibold text-slate-700">No custom service zones defined</h4>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      All zip codes are currently served by the primary dispatch pool.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {zones.map((zone) => (
                      <div
                        key={zone._id}
                        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-slate-900">{zone.name}</h4>
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                            {zone.travelBufferMinutes || 30} min buffer
                          </Badge>
                        </div>

                        <div>
                          <span className="text-[11px] text-slate-400 font-medium block mb-1.5">
                            Covered Zip Codes ({zone.zipCodes?.length || 0})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(zone.zipCodes || []).map((zip: string) => (
                              <span
                                key={zip}
                                className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-mono text-xs"
                              >
                                {zip}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                          <span>Status: Active Territory</span>
                          <span className="text-blue-600 font-medium">Auto-Route Enabled</span>
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

                {/* Live Reputation KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Surveys Sent
                    </span>
                    <span className="text-xl font-bold text-slate-900 mt-0.5 block">
                      {reputationStats?.totalSurveysSent ?? 0}
                    </span>
                    <span className="text-[11px] text-slate-400">Post-service SMS</span>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Average CSAT Rating
                    </span>
                    <span className="text-xl font-bold text-amber-500 mt-0.5 block flex items-center gap-1">
                      {reputationStats?.averageRating ?? 5.0} <Star className="w-4 h-4 fill-amber-500" />
                    </span>
                    <span className="text-[11px] text-slate-400">{reputationStats?.totalResponses ?? 0} Responses</span>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      5-Star Google Redirects
                    </span>
                    <span className="text-xl font-bold text-emerald-600 mt-0.5 block">
                      {reputationStats?.positiveRedirectedCount ?? 0}
                    </span>
                    <span className="text-[11px] text-emerald-600">Public 5-Star Reviews</span>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Negative Reviews Shielded
                    </span>
                    <span className="text-xl font-bold text-rose-600 mt-0.5 block">
                      {reputationStats?.negativeShieldedCount ?? 0}
                    </span>
                    <span className="text-[11px] text-rose-600">Saved from Google</span>
                  </div>
                </div>

                {/* Google Review URL Config */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Google Business Review Link</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Provided only to customers rating their technician 4 or 5 stars.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={googleReviewUrl}
                      onChange={(e) => setGoogleReviewUrl(e.target.value)}
                      className="text-xs font-mono"
                    />
                    <Button
                      size="sm"
                      onClick={() => window.open(googleReviewUrl, '_blank')}
                      variant="outline"
                      className="text-xs shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1" />
                      Test Link
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Add FAQ Modal */}
        {faqModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Add Company Knowledge Base Item</h3>
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
                  <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-500 text-white text-xs">
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
