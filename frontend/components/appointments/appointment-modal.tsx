'use client';

import React, { useState, useEffect } from 'react';
import { Appointment, AppointmentPriority, AppointmentSource, TimeSlot } from '@/types/appointment';
import { AppointmentService } from '@/services/appointment.service';
import { CustomerService } from '@/services/customer.service';
import { ServiceService } from '@/services/service.service';
import { Customer } from '@/types/customer';
import { Service } from '@/types/service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  X,
  Loader2,
  Calendar,
  Clock,
  User,
  Wrench,
  AlertCircle,
  FileText,
  Tag,
  CheckCircle2,
} from 'lucide-react';

interface AppointmentModalProps {
  isOpen: boolean;
  appointment?: Appointment | null;
  initialDate?: string;
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
}

export function AppointmentModal({
  isOpen,
  appointment,
  initialDate,
  onClose,
  onSaved,
}: AppointmentModalProps) {
  const isEditing = Boolean(appointment);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loadingPrereqs, setLoadingPrereqs] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(
    initialDate || new Date().toISOString().split('T')[0]
  );
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [priority, setPriority] = useState<AppointmentPriority>('medium');
  const [source, setSource] = useState<AppointmentSource>('manual');
  const [description, setDescription] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load customers and services on modal open
  useEffect(() => {
    if (!isOpen) return;

    const loadPrereqs = async () => {
      setLoadingPrereqs(true);
      try {
        const [custData, srvData] = await Promise.all([
          CustomerService.getCustomers({ limit: 100 }),
          ServiceService.getServices({ limit: 100, status: 'active' }),
        ]);
        setCustomers(custData.customers || []);
        setServices(srvData.services || []);

        if (appointment) {
          const custId =
            typeof appointment.customerId === 'object'
              ? appointment.customerId._id || (appointment.customerId as any).id
              : appointment.customerId;
          const srvId =
            typeof appointment.serviceId === 'object'
              ? appointment.serviceId._id || (appointment.serviceId as any).id
              : appointment.serviceId;

          setCustomerId(custId || '');
          setServiceId(srvId || '');
          const aptDate = appointment.startAt.split('T')[0];
          setDate(aptDate);
          setSelectedSlot(appointment.startAt);
          setPriority(appointment.priority || 'medium');
          setSource(appointment.source || 'manual');
          setDescription(appointment.description || '');
          setCustomerNotes(appointment.customerNotes || '');
          setInternalNotes(appointment.internalNotes || '');
        } else {
          // Defaults for new appointment
          if (custData.customers?.length > 0 && !customerId) {
            setCustomerId(custData.customers[0]._id || (custData.customers[0] as any).id);
          }
          if (srvData.services?.length > 0 && !serviceId) {
            setServiceId(srvData.services[0]._id || (srvData.services[0] as any).id);
          }
          if (initialDate) {
            setDate(initialDate);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load customers/services');
      } finally {
        setLoadingPrereqs(false);
      }
    };

    loadPrereqs();
  }, [isOpen, appointment, initialDate]);

  // Load slots when serviceId and date change
  useEffect(() => {
    if (!isOpen || !serviceId || !date) return;

    const fetchSlots = async () => {
      setLoadingSlots(true);
      try {
        const data = await AppointmentService.getAvailableSlots(serviceId, date);
        setSlots(data.slots || []);
      } catch (err: any) {
        console.error('Error loading slots:', err);
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [isOpen, serviceId, date]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customerId) {
      setError('Please select a customer');
      return;
    }
    if (!serviceId) {
      setError('Please select a service');
      return;
    }
    if (!selectedSlot) {
      setError('Please select an available time slot');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && appointment) {
        const updated = await AppointmentService.updateAppointment(
          appointment._id || (appointment as any).id,
          {
            serviceId,
            startAt: selectedSlot,
            priority,
            description,
            customerNotes,
            internalNotes,
          }
        );
        onSaved(updated);
      } else {
        const created = await AppointmentService.createAppointment({
          customerId,
          serviceId,
          startAt: selectedSlot,
          priority,
          source,
          description,
          customerNotes,
          internalNotes,
        });
        onSaved(created);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save appointment');
    } finally {
      setSaving(false);
    }
  };

  const formatSlotTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">
                {isEditing ? 'Edit Appointment' : 'Book New Appointment'}
              </h2>
              <p className="text-xs text-neutral-400">
                {isEditing
                  ? 'Update schedule or notes for this booking'
                  : 'Select customer, service, and pick an open time slot'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="leading-snug">{error}</p>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {loadingPrereqs ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-neutral-400">
              <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
              <p className="text-sm">Loading customers and services...</p>
            </div>
          ) : (
            <>
              {/* Customer & Service Select */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    Customer <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    disabled={isEditing}
                    className="w-full bg-neutral-800/80 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-neutral-100 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => {
                      const id = c._id || (c as any).id;
                      return (
                        <option key={id} value={id}>
                          {c.firstName} {c.lastName} ({c.phone})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-blue-400" />
                    Service <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    className="w-full bg-neutral-800/80 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-neutral-100 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">Select service...</option>
                    {services.map((s) => {
                      const id = s._id || (s as any).id;
                      return (
                        <option key={id} value={id}>
                          {s.name} ({s.durationMinutes} min - ${s.startingPrice || 0})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Date Picker & Time Slots */}
              <div className="p-4 bg-neutral-800/40 rounded-xl border border-neutral-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    Appointment Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Slots Grid */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-neutral-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-400" />
                      Available Time Slots
                    </span>
                    {loadingSlots && (
                      <span className="text-xs text-blue-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Checking availability...
                      </span>
                    )}
                  </div>

                  {slots.length === 0 && !loadingSlots ? (
                    <p className="text-xs text-neutral-500 py-3 text-center">
                      No availability found for this date. Business may be closed or all slots
                      booked.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                      {slots.map((slot) => {
                        const isSelected = selectedSlot === slot.startAt;
                        const isAvailable = slot.available || isSelected;

                        return (
                          <button
                            type="button"
                            key={slot.startAt}
                            disabled={!isAvailable}
                            onClick={() => setSelectedSlot(slot.startAt)}
                            className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-center flex items-center justify-center gap-1 ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-2 ring-blue-400'
                                : isAvailable
                                ? 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600'
                                : 'bg-neutral-900/60 text-neutral-600 border border-neutral-800 cursor-not-allowed line-through'
                            }`}
                          >
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                            {formatSlotTime(slot.startAt)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Priority & Source */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-blue-400" />
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as AppointmentPriority)}
                    className="w-full bg-neutral-800/80 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Source
                  </label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value as AppointmentSource)}
                    disabled={isEditing}
                    className="w-full bg-neutral-800/80 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="manual">Manual Booking</option>
                    <option value="website">Website</option>
                    <option value="ai_call">AI Voice Agent</option>
                    <option value="referral">Referral</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Customer Notes / Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder="Gate code, pets on property, special requests..."
                    className="w-full bg-neutral-800/80 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Internal Staff Notes
                  </label>
                  <textarea
                    rows={2}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Technician assignment, pre-trip notes..."
                    className="w-full bg-neutral-800/80 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || loadingPrereqs || !selectedSlot}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-5"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                'Update Appointment'
              ) : (
                'Confirm Booking'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
