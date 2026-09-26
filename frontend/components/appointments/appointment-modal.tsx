'use client';

import React, { useState, useEffect } from 'react';
import { Appointment, AppointmentPriority, AppointmentSource, TimeSlot } from '@/types/appointment';
import { AppointmentService } from '@/services/appointment.service';
import { CustomerService } from '@/services/customer.service';
import { ServiceService } from '@/services/service.service';
import { WorkerService } from '@/services/worker.service';
import { DispatchService, type TechnicianMatch } from '@/services/operations.service';
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
  Sparkles,
  Repeat,
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
  const [technicians, setTechnicians] = useState<Array<{ _id: string; name: string }>>([]);
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
  /**
   * Assignment. Empty string means unassigned.
   *
   * There was no field for this at all — the only nearby input was a free-text
   * "Technician Notes" textarea — so `technicianId` was never sent and every job
   * was created unassigned.
   */
  const [technicianId, setTechnicianId] = useState('');

  /**
   * The suggestion, which is offered and never applied on its own.
   *
   * `findOptimalTechnician` has existed since the beginning behind
   * `POST /api/dispatch/match-tech` with no caller in the product, so its answer reached
   * nobody. Wiring it to a button rather than to the picker's default is deliberate: a
   * dispatcher knows things the matcher does not — who is training whom, whose van has the
   * part — and silently pre-filling an assignment makes it look like a decision somebody
   * made.
   */
  const [match, setMatch] = useState<TechnicianMatch | null>(null);
  const [matching, setMatching] = useState(false);

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recurrence controls
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState<'weekly' | 'monthly'>('monthly');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<'count' | 'until'>('count');
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [recurrenceUntil, setRecurrenceUntil] = useState('');

  // Load customers and services on modal open
  useEffect(() => {
    if (!isOpen) return;

    const loadPrereqs = async () => {
      setLoadingPrereqs(true);
      try {
        // Settled for the roster: a business with no technicians yet must still be
        // able to book, so an empty or failing roster cannot block the form.
        const [custData, srvData, techResult] = await Promise.all([
          CustomerService.getCustomers({ limit: 100 }),
          ServiceService.getServices({ limit: 100, status: 'active' }),
          WorkerService.getTechnicians().catch(() => [] as any[]),
        ]);
        setCustomers(custData.customers || []);
        setServices(srvData.services || []);
        setTechnicians(
          (techResult || []).map((t: any) => ({ _id: t._id, name: t.name }))
        );

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

          const assigned = (appointment as any).technicianId;
          setTechnicianId(
            typeof assigned === 'object' && assigned
              ? assigned._id || assigned.id || ''
              : assigned || ''
          );
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
            // null unassigns; the server refuses an id from another business.
            technicianId: technicianId || null,
          }
        );
        onSaved(updated);
      } else {
        const recurrence =
          !isEditing && isRecurring
            ? {
                frequency: recurrenceFreq,
                interval: Math.max(1, Math.min(52, Number(recurrenceInterval) || 1)),
                ...(recurrenceEndMode === 'count'
                  ? { count: Math.max(2, Math.min(260, Number(recurrenceCount) || 4)) }
                  : { until: recurrenceUntil || undefined }),
              }
            : undefined;

        const created = await AppointmentService.createAppointment({
          customerId,
          serviceId,
          startAt: selectedSlot,
          priority,
          source,
          description,
          customerNotes,
          internalNotes,
          ...(technicianId ? { technicianId } : {}),
          ...(recurrence ? { recurrence } : {}),
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

  /**
   * Asks the server who should take this job.
   *
   * `customerId` and `serviceId` go up rather than a ZIP and a skill tag, so the server
   * derives both from the same records the travel fee and the dispatch alert read. The
   * chosen slot goes up as `startAt`, which is what lets anyone already booked be ruled
   * out — the endpoint's one previous caller omitted it, so the availability half of the
   * matcher never ran in production.
   */
  const handleSuggest = async () => {
    setMatching(true);
    setMatch(null);
    try {
      const result = await DispatchService.suggestTechnician({
        customerId: customerId || undefined,
        serviceId: serviceId || undefined,
        startAt: selectedSlot || undefined,
      });
      setMatch(result);
    } catch (err: any) {
      setError(err.message || 'Could not work out a suggestion');
    } finally {
      setMatching(false);
    }
  };

  /** Clears a stale suggestion whenever the inputs it was based on change. */
  useEffect(() => {
    setMatch(null);
  }, [customerId, serviceId, selectedSlot]);

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

              {/* Recurrence Schedule (Series / Maintenance Plan) */}
              {!isEditing && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={isRecurring}
                        onChange={(e) => setIsRecurring(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <Repeat className="w-3.5 h-3.5 text-blue-600" />
                      Recurring Schedule / Maintenance Plan
                    </label>
                    {isRecurring && (
                      <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full">
                        Generates Series
                      </span>
                    )}
                  </div>

                  {isRecurring && (
                    <div className="pt-2 border-t border-slate-200/80 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Frequency
                          </label>
                          <select
                            value={recurrenceFreq}
                            onChange={(e) => setRecurrenceFreq(e.target.value as any)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          >
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Interval (Every X {recurrenceFreq === 'weekly' ? 'weeks' : 'months'})
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={52}
                            value={recurrenceInterval}
                            onChange={(e) => setRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            End Condition
                          </label>
                          <select
                            value={recurrenceEndMode}
                            onChange={(e) => setRecurrenceEndMode(e.target.value as any)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          >
                            <option value="count">After number of visits</option>
                            <option value="until">On a specific end date</option>
                          </select>
                        </div>

                        <div>
                          {recurrenceEndMode === 'count' ? (
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                Total Visits (Including first)
                              </label>
                              <input
                                type="number"
                                min={2}
                                max={260}
                                value={recurrenceCount}
                                onChange={(e) => setRecurrenceCount(Math.max(2, parseInt(e.target.value) || 2))}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                End Date
                              </label>
                              <input
                                type="date"
                                value={recurrenceUntil}
                                onChange={(e) => setRecurrenceUntil(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Occurrences are automatically generated up to the 120-day horizon and kept filled by the background scheduler.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Technician assignment */}
              <div>
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-blue-600" />
                    Assigned Technician
                  </label>
                  {technicians.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSuggest}
                      disabled={matching || !selectedSlot}
                      title={
                        selectedSlot
                          ? 'Work out who is free and closest'
                          : 'Pick a time slot first — without one, nobody can be ruled out as busy'
                      }
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 hover:text-blue-900 disabled:text-slate-400 disabled:cursor-not-allowed"
                    >
                      {matching ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      Suggest
                    </button>
                  )}
                </div>

                {technicians.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                    No technician records yet. Add them under Settings → Service Zones &amp; Tech
                    Routing. Until a job is assigned, it shows on every technician&apos;s board.
                  </p>
                ) : (
                  <>
                    <select
                      value={technicianId}
                      onChange={(e) => setTechnicianId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="">Unassigned</option>
                      {technicians.map((t) => {
                        // Marked, not removed: a dispatcher may still deliberately
                        // double-book someone, and the booking path is what refuses it.
                        const candidate = match?.candidates.find(
                          (c) => c.technicianId === t._id
                        );
                        return (
                          <option key={t._id} value={t._id}>
                            {t.name}
                            {candidate?.busy ? ' — already booked then' : ''}
                          </option>
                        );
                      })}
                    </select>

                    {/*
                      The suggestion, with its reasoning and a button to accept it.

                      Shown rather than applied: "suggest, do not impose" is only meaningful
                      if the reason is visible and the dispatcher has to agree.
                    */}
                    {match && (
                      <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 space-y-1.5">
                        {match.suggested ? (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-bold text-blue-900">
                                Suggested: {match.suggested.name}
                              </span>
                              {technicianId === match.suggested.technicianId ? (
                                <span className="text-[11px] font-bold text-emerald-700 shrink-0">
                                  Selected
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setTechnicianId(match.suggested!.technicianId)}
                                  className="text-[11px] font-bold text-blue-700 hover:text-blue-900 shrink-0"
                                >
                                  Use this
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-blue-800 leading-relaxed">
                              {match.reason}
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-blue-900 leading-relaxed font-medium">
                            {match.reason}
                          </p>
                        )}
                      </div>
                    )}

                    {/*
                      Stated plainly because it is the behaviour that made the
                      per-technician scoping look broken: an unassigned job is
                      visible to everyone by design, so it can be picked up.
                    */}
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      An assigned job appears only on that technician&apos;s schedule.
                      Unassigned jobs stay visible to the whole team.
                    </p>
                  </>
                )}
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
