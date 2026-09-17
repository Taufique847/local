'use client';

import React, { useState, useEffect } from 'react';
import { Service, CreateServiceInput, UpdateServiceInput, ServiceCategory, ServiceStatus } from '@/types/service';
import { ServiceService } from '@/services/service.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  X,
  Loader2,
  Wrench,
  Clock,
  DollarSign,
  Tag,
  AlertTriangle,
  FileText,
  Zap,
} from 'lucide-react';

interface ServiceModalProps {
  isOpen: boolean;
  service?: Service | null;
  onClose: () => void;
  onSaved: (service: Service) => void;
}

const CATEGORIES: ServiceCategory[] = [
  'Cooling',
  'Heating',
  'Maintenance',
  'Installation',
  'Indoor Air Quality',
  'Ductwork',
  'Emergency',
  'Other',
];

export function ServiceModal({ isOpen, service, onClose, onSaved }: ServiceModalProps) {
  const isEditing = Boolean(service);

  const [formData, setFormData] = useState<CreateServiceInput>({
    name: '',
    description: '',
    durationMinutes: 60,
    startingPrice: undefined,
    category: 'Other',
    isEmergencyService: false,
    status: 'active',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name || '',
        description: service.description || '',
        durationMinutes: service.durationMinutes || 60,
        startingPrice: service.startingPrice,
        category: service.category || 'Other',
        isEmergencyService: service.isEmergencyService || false,
        status: service.status || 'active',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        durationMinutes: 60,
        startingPrice: undefined,
        category: 'Other',
        isEmergencyService: false,
        status: 'active',
      });
    }
    setError(null);
  }, [service, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Service name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let savedService: Service;

      if (isEditing && service) {
        const serviceId = service._id || service.id;
        if (!serviceId) throw new Error('Service ID missing');

        const updatePayload: UpdateServiceInput = {
          name: formData.name.trim(),
          description: formData.description?.trim(),
          durationMinutes: formData.durationMinutes ? Number(formData.durationMinutes) : 60,
          startingPrice: formData.startingPrice !== undefined ? Number(formData.startingPrice) : undefined,
          category: formData.category,
          isEmergencyService: formData.isEmergencyService,
          status: formData.status,
        };

        savedService = await ServiceService.updateService(serviceId, updatePayload);
      } else {
        savedService = await ServiceService.createService({
          ...formData,
          name: formData.name.trim(),
          description: formData.description?.trim(),
          durationMinutes: formData.durationMinutes ? Number(formData.durationMinutes) : 60,
          startingPrice: formData.startingPrice !== undefined ? Number(formData.startingPrice) : undefined,
        });
      }

      onSaved(savedService);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save service');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 rounded-t-xl flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isEditing ? 'Edit Service' : 'Add New Service'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditing ? 'Update service details' : 'Configure a new HVAC service offering'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Service Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-slate-400" />
              Service Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. AC Repair & Diagnostic"
              className="text-sm"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Description
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this service includes..."
              rows={3}
              className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Duration & Price Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Duration (min)
              </label>
              <Input
                type="number"
                value={formData.durationMinutes || ''}
                onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || undefined })}
                placeholder="60"
                min={1}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                Starting Price ($)
              </label>
              <Input
                type="number"
                value={formData.startingPrice ?? ''}
                onChange={(e) => setFormData({ ...formData, startingPrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="149"
                min={0}
                step="0.01"
                className="text-sm"
              />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              Category
            </label>
            <select
              value={formData.category || 'Other'}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as ServiceCategory })}
              className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Emergency Service Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <div>
                <p className="text-xs font-medium text-slate-900">Emergency Service</p>
                <p className="text-[11px] text-slate-500">Mark as priority / after-hours service</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isEmergencyService: !formData.isEmergencyService })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 ${
                formData.isEmergencyService ? 'bg-amber-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  formData.isEmergencyService ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Status (only for edit mode) */}
          {isEditing && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Status</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, status: 'active' })}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                    formData.status === 'active'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  ● Active
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, status: 'inactive' })}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                    formData.status === 'inactive'
                      ? 'bg-slate-100 border-slate-300 text-slate-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  ● Inactive
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !formData.name.trim()}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium min-w-[100px]"
            >
              {saving ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </span>
              ) : isEditing ? (
                'Update Service'
              ) : (
                'Add Service'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
