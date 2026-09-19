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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {isEditing ? 'Edit Appointment' : 'Book New Field Appointment'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditing
                  ? 'Update schedule or field notes for this booking'
                  : 'Select customer, service, and pick an open dispatch slot'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <p className="leading-snug text-xs font-semibold">{error}</p>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {loadingPrereqs ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
              <p className="text-xs font-semibold text-slate-500">Loading customers and services...</p>
            </div>
          ) : (
            <>
              {/* Customer & Service Select */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    Customer <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    disabled={isEditing}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-blue-600" />
                    Service <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
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
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    Appointment Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {/* Slots Grid */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      Available Time Slots
                    </span>
                    {loadingSlots && (
                      <span className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Checking availability...
                      </span>
                    )}
                  </div>

                  {slots.length === 0 && !loadingSlots ? (
                    <p className="text-xs text-slate-500 py-3 text-center font-medium bg-white rounded-lg border border-slate-200/70">
                      No availability found for this date. Business may be closed or all slots booked.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
                      {slots.map((slot) => {
                        const isSelected = selectedSlot === slot.startAt;
                        const isAvailable = slot.available || isSelected;

                        return (
                          <button
                            type="button"
                            key={slot.startAt}
                            disabled={!isAvailable}
                            onClick={() => setSelectedSlot(slot.startAt)}
                            className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1 ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400'
                                : isAvailable
                                ? 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 hover:border-slate-300'
                                : 'bg-slate-100 text-slate-400 border border-slate-200/60 cursor-not-allowed line-through'
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
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-blue-600" />
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as AppointmentPriority)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent (Emergency)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Dispatch Channel / Source
                  </label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value as AppointmentSource)}
                    disabled={isEditing}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="manual">Manual Dispatch</option>
                    <option value="website">Online Booking Form</option>
                    <option value="ai_call">Alex AI Voice Receptionist</option>
                    <option value="referral">Customer Referral</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Customer Instructions / Notes
                  </label>
                  <textarea
                    rows={2}
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder="Gate code, HVAC unit location, customer requests..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Internal Staff / Technician Notes
                  </label>
                  <textarea
                    rows={2}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Assigned tech truck, replacement filters required, pre-dispatch notes..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs h-9 px-4 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || loadingPrereqs || !selectedSlot}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-5 rounded-xl shadow-xs"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Confirm & Dispatch'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
