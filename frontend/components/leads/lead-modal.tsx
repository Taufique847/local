'use client';

import React, { useState, useEffect } from 'react';
import { Lead, CreateLeadInput, UpdateLeadInput, LeadStatus, LeadPriority, LeadSource } from '@/types/lead';
import { Customer } from '@/types/customer';
import { Business } from '@/types/business';
import { LeadService } from '@/services/lead.service';
import { CustomerService } from '@/services/customer.service';
import { BusinessService } from '@/services/business.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  X, 
  Loader2, 
  User, 
  Briefcase, 
  DollarSign, 
  AlertCircle, 
  Tag, 
  Clock, 
  FileText,
  Building2
} from 'lucide-react';

interface LeadModalProps {
  isOpen: boolean;
  lead?: Lead | null;
  initialCustomerId?: string;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
}

export function LeadModal({ isOpen, lead, initialCustomerId, onClose, onSaved }: LeadModalProps) {
  const isEditing = Boolean(lead);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const [formData, setFormData] = useState<CreateLeadInput>({
    customerId: initialCustomerId || '',
    title: '',
    description: '',
    service: '',
    status: 'new',
    priority: 'medium',
    source: 'manual',
    estimatedValue: undefined,
    notes: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load customer directory & business services on modal open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingData(true);

    async function loadOptions() {
      try {
        const [custRes, bizRes] = await Promise.all([
          CustomerService.getCustomers({ limit: 100 }).catch(() => null),
          BusinessService.getMyBusiness().catch(() => null),
        ]);

        if (isMounted) {
          if (custRes && custRes.customers) {
            setCustomers(custRes.customers);
          }
          if (bizRes) {
            setBusiness(bizRes);
          }
        }
      } catch (err) {
        console.error('Failed to load customers or business profile:', err);
      } finally {
        if (isMounted) {
          setLoadingData(false);
        }
      }
    }

    loadOptions();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Populate form if editing or when lead changes
  useEffect(() => {
    if (lead) {
      setFormData({
        customerId: lead.customerId?._id || lead.customerId?.id || '',
        title: lead.title || '',
        description: lead.description || '',
        service: lead.service || '',
        status: lead.status || 'new',
        priority: lead.priority || 'medium',
        source: lead.source || 'manual',
        estimatedValue: lead.estimatedValue,
        notes: lead.notes || '',
      });
    } else {
      setFormData({
        customerId: initialCustomerId || (customers[0]?._id || customers[0]?.id || ''),
        title: '',
        description: '',
        service: business?.services?.[0]?.name || '',
        status: 'new',
        priority: 'medium',
        source: 'manual',
        estimatedValue: undefined,
        notes: '',
      });
    }
    setError(null);
  }, [lead, initialCustomerId, isOpen, customers, business]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.customerId) {
      setError('Please select a customer for this lead');
      return;
    }

    if (!formData.title.trim()) {
      setError('Lead title is required (e.g. "AC Repair Request")');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && lead) {
        const leadId = lead._id || lead.id || '';
        const updated = await LeadService.updateLead(leadId, formData);
        onSaved(updated);
        onClose();
      } else {
        const created = await LeadService.createLead(formData);
        onSaved(created);
        onClose();
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save lead');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? 'Edit Lead' : 'Create New Lead'}
            </h3>
            <p className="text-xs text-slate-500">
              {isEditing
                ? 'Update HVAC service opportunity details and qualification status'
                : 'Log a new service opportunity attached to a customer'}
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Selection */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Associated Customer *
            </label>
            {loadingData ? (
              <div className="h-9 rounded-md border border-slate-200 bg-slate-50 flex items-center px-3 text-slate-400">
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin text-slate-500" />
                Loading customers...
              </div>
            ) : customers.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                No customers available. Please add a customer to your CRM first before creating leads.
              </div>
            ) : (
              <div className="relative">
                <select
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  required
                  className="w-full h-9 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => {
                    const cId = c.id || c._id || '';
                    return (
                      <option key={cId} value={cId}>
                        {c.firstName} {c.lastName} — {c.phone} {c.address?.city ? `(${c.address.city})` : ''}
                      </option>
                    );
                  })}
                </select>
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            )}
          </div>

          {/* Title & Service */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Lead Title *
              </label>
              <div className="relative">
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. AC Repair Request"
                  required
                  className="pl-8 text-xs h-9 bg-white"
                />
                <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Service Requested
              </label>
              <div className="relative">
                <select
                  value={formData.service}
                  onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">Select service...</option>
                  {business?.services && business.services.length > 0 ? (
                    business.services.map((svc) => (
                      <option key={svc.id} value={svc.name}>
                        {svc.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="AC Repair">AC Repair</option>
                      <option value="AC Installation">AC Installation</option>
                      <option value="Heating Repair">Heating Repair</option>
                      <option value="Furnace Installation">Furnace Installation</option>
                      <option value="Duct Cleaning">Duct Cleaning</option>
                      <option value="General HVAC Diagnostic">General HVAC Diagnostic</option>
                    </>
                  )}
                </select>
                <Briefcase className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Pipeline Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as LeadStatus })}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="new">New (Uncontacted)</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="quoted">Quoted</option>
                <option value="won">Won (Closed)</option>
                <option value="lost">Lost</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Urgency / Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as LeadPriority })}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="urgent">Urgent / Emergency</option>
              </select>
            </div>
          </div>

          {/* Estimated Value & Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Estimated Value ($ USD)
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  step="25"
                  value={formData.estimatedValue !== undefined ? formData.estimatedValue : ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      estimatedValue: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="e.g. 350"
                  className="pl-8 text-xs h-9 bg-white"
                />
                <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Lead Source
              </label>
              <select
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value as LeadSource })}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="manual">Manual Entry (Owner)</option>
                <option value="website">Website Form</option>
                <option value="referral">Customer Referral</option>
                <option value="ai_call">AI Call Reception</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Issue Description */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Issue / Service Request Context
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. Customer says compressor won't kick in, fan is blowing ambient room temperature air."
              rows={2}
              className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Internal Business Notes */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-400" />
              Internal Notes & Technician Reminders
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g. Dog in backyard, park on east side of driveway."
              rows={2}
              className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving}
              className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || customers.length === 0}
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium"
            >
              {saving && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create Opportunity'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
