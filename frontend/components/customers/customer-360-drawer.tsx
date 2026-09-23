'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CustomerService } from '@/services/customer.service';
import {
  X,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Tag,
  DollarSign,
  ShieldAlert,
  Wrench,
  Sparkles,
  MessageSquare,
  PhoneCall,
  UserCheck,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Flame,
  KeyRound,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EquipmentPanel } from './equipment-panel';

interface Customer360DrawerProps {
  customerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCustomerUpdated?: () => void;
}

export function Customer360Drawer({
  customerId,
  isOpen,
  onClose,
  onCustomerUpdated,
}: Customer360DrawerProps) {
  const [data, setData] = useState<any | null>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'equipment' | 'memory' | 'info'>(
    'timeline'
  );
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'call' | 'appointment' | 'sms' | 'lead'>('all');

  // Tag editor state
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [savingTags, setSavingTags] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const [profileData, memData] = await Promise.all([
        CustomerService.getCustomer360(customerId),
        CustomerService.getCustomerMemories(customerId).catch(() => []),
      ]);
      setData(profileData);
      setTags(profileData.customer?.tags || []);
      setMemories(memData || []);
    } catch (err) {
      console.error('Failed to load customer 360:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (isOpen && customerId) {
      fetchProfile();
    } else {
      setData(null);
      setMemories([]);
    }
  }, [isOpen, customerId, fetchProfile]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleAddTag = async () => {
    if (!newTagInput.trim() || !customerId) return;
    const cleanTag = newTagInput.trim().toUpperCase();
    if (tags.includes(cleanTag)) {
      setNewTagInput('');
      return;
    }

    const updatedTags = [...tags, cleanTag];
    setSavingTags(true);
    try {
      await CustomerService.updateTags(customerId, updatedTags);
      setTags(updatedTags);
      setNewTagInput('');
      if (onCustomerUpdated) onCustomerUpdated();
    } catch (err) {
      console.error('Failed to save tag:', err);
    } finally {
      setSavingTags(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!customerId) return;
    const updatedTags = tags.filter((t) => t !== tagToRemove);
    setSavingTags(true);
    try {
      await CustomerService.updateTags(customerId, updatedTags);
      setTags(updatedTags);
      if (onCustomerUpdated) onCustomerUpdated();
    } catch (err) {
      console.error('Failed to remove tag:', err);
    } finally {
      setSavingTags(false);
    }
  };

  if (!isOpen) return null;

  const cust = data?.customer;
  const metrics = data?.metrics;
  const timeline = (data?.timeline || []) as any[];

  const filteredTimeline = timeline.filter((event: any) => {
    if (timelineFilter === 'all') return true;
    return event.type === timelineFilter;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl border-l border-slate-200 flex flex-col transform transition-transform duration-300 animate-in slide-in-from-right">
          {/* Header */}
          <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300 font-bold text-sm">
                {cust ? `${cust.firstName?.[0] || ''}${cust.lastName?.[0] || ''}` : 'C'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight text-white">
                    {cust ? `${cust.firstName} ${cust.lastName}` : 'Customer 360 View'}
                  </h2>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                    Customer 360
                  </Badge>
                </div>
                <p className="text-xs text-slate-400">
                  {cust?.phone || 'Loading customer details...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {cust?.phone && (
                <a
                  href={`tel:${cust.phone}`}
                  className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white text-xs font-semibold border border-blue-500/40 transition-all"
                >
                  <Phone className="w-3 h-3" />
                  Call
                </a>
              )}
              <a
                href={`/app/estimates?action=new&customerId=${customerId}`}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
              >
                <DollarSign className="w-3 h-3 text-emerald-400" />
                New Quote
              </a>
              <a
                href={`/app/appointments?action=new&customerId=${customerId}`}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
              >
                <Calendar className="w-3 h-3 text-blue-400" />
                Book Job
              </a>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-xs font-medium">Assembling Customer 360 relationship timeline...</p>
            </div>
          ) : !cust ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <AlertCircle className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Customer profile not found</p>
              <p className="text-xs text-slate-400 mt-1">This record might have been removed or merged.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto flex flex-col">
              {/* LTV & Metrics Strip */}
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Lifetime Value
                    </span>
                    <span className="text-lg font-bold text-emerald-600 mt-0.5 block">
                      ${cust.lifetimeValue?.toLocaleString() || '0'}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Calls Logged
                    </span>
                    <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                      {metrics?.totalCalls || 0}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Appointments
                    </span>
                    <span className="text-lg font-bold text-blue-600 mt-0.5 block">
                      {metrics?.totalAppointments || 0}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Open Leads
                    </span>
                    <span className="text-lg font-bold text-amber-600 mt-0.5 block">
                      {metrics?.openLeads || 0}
                    </span>
                  </div>
                </div>

                {/* Tags Editor */}
                <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-1">
                    <Tag className="w-3.5 h-3.5" /> Tags:
                  </span>
                  {tags.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No tags assigned</span>
                  ) : (
                    tags.map((tag) => (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                          tag === 'VIP'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : tag === 'COMMERCIAL'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          disabled={savingTags}
                          className="hover:text-red-500 transition-colors ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}

                  <div className="flex items-center gap-1 ml-auto">
                    <input
                      type="text"
                      placeholder="+ Tag (e.g. VIP)"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      className="h-7 w-28 px-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddTag}
                      disabled={savingTags || !newTagInput.trim()}
                      className="h-7 px-2 text-xs bg-white"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-slate-200 px-6 bg-white shrink-0">
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
                    activeTab === 'timeline'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Activity Timeline ({timeline.length})
                </button>
                {/* Structured equipment and access. Separate from the memory tab
                    below, which holds what the assistant *inferred* — one is a record,
                    the other is a guess, and showing them as one thing is how a
                    regex's output came to be treated as confirmed fact. */}
                <button
                  onClick={() => setActiveTab('equipment')}
                  className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                    activeTab === 'equipment'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5 text-blue-500" />
                  Equipment & Access
                </button>
                <button
                  onClick={() => setActiveTab('memory')}
                  className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                    activeTab === 'memory'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  What the assistant learned ({memories.length})
                </button>
                <button
                  onClick={() => setActiveTab('info')}
                  className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
                    activeTab === 'info'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Contact & Property Info
                </button>
              </div>

              {/* Content Body */}
              <div className="p-6 flex-1 bg-slate-50/50">
                {activeTab === 'timeline' && (
                  <div>
                    {/* Timeline Filter Pills */}
                    <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
                      {(['all', 'call', 'appointment', 'lead', 'sms'] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setTimelineFilter(filter)}
                          className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                            timelineFilter === filter
                              ? 'bg-slate-900 text-white'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {filter === 'all' ? 'All Activities' : filter + 's'}
                        </button>
                      ))}
                    </div>

                    {filteredTimeline.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">No activity records match this filter.</p>
                      </div>
                    ) : (
                      <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                        {filteredTimeline.map((event: any) => {
                          const isCall = event.type === 'call';
                          const isAppt = event.type === 'appointment';
                          const isLead = event.type === 'lead';
                          const isSms = event.type === 'sms';

                          return (
                            <div key={event.id} className="relative group">
                              {/* Dot Icon */}
                              <div
                                className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[10px] shadow-xs ${
                                  isCall
                                    ? 'bg-blue-600 text-white'
                                    : isAppt
                                    ? 'bg-emerald-600 text-white'
                                    : isLead
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-amber-500 text-white'
                                }`}
                              >
                                {isCall ? (
                                  <Phone className="w-2.5 h-2.5" />
                                ) : isAppt ? (
                                  <Calendar className="w-2.5 h-2.5" />
                                ) : isLead ? (
                                  <Flame className="w-2.5 h-2.5" />
                                ) : (
                                  <MessageSquare className="w-2.5 h-2.5" />
                                )}
                              </div>

                              {/* Card */}
                              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-slate-900">
                                    {event.title}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {new Date(event.timestamp).toLocaleString()}
                                  </span>
                                </div>

                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                  {event.summary}
                                </p>

                                {event.metadata && (
                                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                    {event.metadata.durationSeconds !== undefined && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        {event.metadata.durationSeconds}s duration
                                      </span>
                                    )}
                                    {event.metadata.technician && (
                                      <span className="flex items-center gap-1">
                                        <Wrench className="w-3 h-3 text-slate-400" />
                                        Tech: {event.metadata.technician}
                                      </span>
                                    )}
                                    {event.metadata.status && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                        {event.metadata.status}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'equipment' && (
                  <EquipmentPanel
                    customerId={customerId!}
                    customer={data?.customer ?? null}
                    onUpdated={() => {
                      void fetchProfile();
                      onCustomerUpdated?.();
                    }}
                  />
                )}

                {activeTab === 'memory' && (
                  <div className="space-y-4">
                    {/*
                      Reworded to say what this actually is. It previously read "M19
                      Long-Term Agentic Memory Active" and claimed the assistant recalls
                      equipment, filter sizes and gate codes — which is now true, but
                      through the Equipment & Access tab, not through these rows. These
                      are the raw phrases a regex pulled off a transcript, kept for
                      provenance.
                    */}
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Picked up from phone calls</p>
                        <p className="text-amber-800 mt-0.5 leading-relaxed">
                          Phrases the assistant extracted from what callers said. Confirmed
                          details live under <span className="font-semibold">Equipment &amp;
                          Access</span> — these are kept so you can see where a value came
                          from, and they are not what the assistant reads out.
                        </p>
                      </div>
                    </div>

                    {/*
                      An "HVAC & Plumbing Equipment Registry" card used to sit here
                      showing a Carrier Infinity 16, a 20x25x4 MERV 11 filter, R-410A
                      Puron with an 8.2 lb factory charge, a Rheem tankless heater, an
                      Ecobee thermostat, a June 2021 install date and an "Active
                      Warranty" badge. None of it came from anywhere: every value was a
                      literal, so every customer in every business was shown the same
                      six specifications.

                      That is the kind of detail a technician loads a van from. Real
                      equipment now lives on the Equipment & Access tab, where an empty
                      list reads as empty.
                    */}
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                          <Wrench className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">Equipment on file</h4>
                          <p className="text-[10px] text-slate-400">
                            Recorded units, filter sizes, warranties and access details
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('equipment')}>
                        Open
                      </Button>
                    </div>

                    {memories.length === 0 ? (
                      <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400">
                        <KeyRound className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="text-xs font-semibold text-slate-700">No property memories yet</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Memories are automatically extracted from phone conversations or technician
                          notes.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {memories.map((mem: any) => (
                          <div
                            key={mem._id || mem.id}
                            className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-start justify-between"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px]">
                                  {mem.category || 'property_detail'}
                                </Badge>
                                <span className="text-xs font-semibold text-slate-900">
                                  {mem.key || 'Fact'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 font-medium">{mem.value}</p>
                              {mem.source && (
                                <span className="text-[10px] text-slate-400 block">
                                  Learned from {mem.source} • {new Date(mem.updatedAt || mem.createdAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'info' && (
                  <div className="space-y-4">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3 text-xs">
                      <h4 className="font-semibold text-slate-900 text-sm">Contact Information</h4>
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Primary Phone</span>
                          <span className="font-medium text-slate-900">{cust.phone}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Email Address</span>
                          <span className="font-medium text-slate-900">{cust.email || 'None on file'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Property Type</span>
                          <span className="font-medium text-slate-900 capitalize">
                            {cust.propertyType || 'Residential'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Client Since</span>
                          <span className="font-medium text-slate-900">
                            {new Date(cust.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {cust.address && (
                        <div className="pt-3 border-t border-slate-100">
                          <span className="text-slate-400 block text-[11px]">Service Address</span>
                          <span className="font-medium text-slate-900">
                            {typeof cust.address === 'string'
                              ? cust.address
                              : `${cust.address.street || ''}, ${cust.address.city || ''}, ${cust.address.state || ''} ${cust.address.zipCode || ''}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Actions Footer */}
              <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => window.open(`tel:${cust.phone}`)}
                  >
                    <PhoneCall className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
                    Call
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => window.open(`sms:${cust.phone}`)}
                  >
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
                    Send SMS
                  </Button>
                </div>

                <Button
                  size="sm"
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs"
                  onClick={onClose}
                >
                  Close Drawer
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
