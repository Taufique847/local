'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AppointmentService } from '@/services/appointment.service';
import { AppointmentModal } from '@/components/appointments/appointment-modal';
import { Appointment, AppointmentStatus } from '@/types/appointment';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  Clock,
  User,
  Wrench,
  ChevronLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Tag,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  cancelled: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  no_show: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

export default function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const appointmentId = resolvedParams.id;

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status modal / cancel prompt
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  // Edit Modal
  const [editModalOpen, setEditModalOpen] = useState(false);

  const fetchAppointment = async () => {
    setLoading(true);
    try {
      const data = await AppointmentService.getAppointmentById(appointmentId);
      setAppointment(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load appointment details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointment();
  }, [appointmentId]);

  const handleStatusChange = async (newStatus: AppointmentStatus, reason?: string) => {
    setUpdatingStatus(true);
    try {
      const updated = await AppointmentService.updateStatus(appointmentId, newStatus, reason);
      setAppointment(updated);
      setCancelModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to permanently delete this appointment?')) return;

    try {
      await AppointmentService.deleteAppointment(appointmentId);
      router.push('/app/appointments');
    } catch (err: any) {
      alert(err.message || 'Failed to delete appointment');
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <DashboardShell>
        <div className="py-32 flex flex-col items-center justify-center gap-3 text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm">Loading appointment details...</p>
        </div>
      </DashboardShell>
    );
  }

  if (error || !appointment) {
    return (
      <DashboardShell>
        <div className="max-w-xl mx-auto py-16 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-semibold text-neutral-100">Appointment Not Found</h2>
          <p className="text-sm text-neutral-400">{error || 'The requested appointment could not be found.'}</p>
          <Link href="/app/appointments">
            <Button variant="outline" className="mt-4">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Appointments
            </Button>
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const cust = appointment.customerId as any;
  const srv = appointment.serviceId as any;

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app/appointments"
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-neutral-100">
                  {appointment.title || 'Appointment Details'}
                </h1>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border uppercase ${
                    STATUS_COLORS[appointment.status]
                  }`}
                >
                  {appointment.status.replace('_', ' ')}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 uppercase">
                  {appointment.priority} priority
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Booked via {appointment.source.replace('_', ' ')} &bull; Created by {appointment.createdBy}
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setEditModalOpen(true)}
              className="bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700 text-xs h-9"
            >
              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
              Reschedule / Edit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30 text-xs h-9"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>

        {/* Status Lifecycle Actions Bar */}
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-neutral-400">
            Current Status: <span className="font-semibold text-neutral-200 uppercase">{appointment.status.replace('_', ' ')}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {appointment.status === 'scheduled' && (
              <Button
                size="sm"
                disabled={updatingStatus}
                onClick={() => handleStatusChange('confirmed')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Confirm Booking
              </Button>
            )}

            {appointment.status === 'confirmed' && (
              <Button
                size="sm"
                disabled={updatingStatus}
                onClick={() => handleStatusChange('in_progress')}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs"
              >
                <Clock className="w-3.5 h-3.5 mr-1.5" />
                Mark In Progress
              </Button>
            )}

            {appointment.status === 'in_progress' && (
              <Button
                size="sm"
                disabled={updatingStatus}
                onClick={() => handleStatusChange('completed')}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Mark Completed
              </Button>
            )}

            {appointment.status !== 'cancelled' && appointment.status !== 'completed' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingStatus}
                  onClick={() => handleStatusChange('no_show')}
                  className="bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 text-xs"
                >
                  Mark No Show
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingStatus}
                  onClick={() => setCancelModalOpen(true)}
                  className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Cancel Appointment
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 2-Column Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Schedule & Service */}
          <div className="space-y-6">
            {/* Schedule Card */}
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
              <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                Schedule & Time
              </h3>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <span className="text-xs text-neutral-500 block">Date</span>
                  <span className="text-sm font-medium text-neutral-200">
                    {formatDate(appointment.startAt)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block">Time Slot</span>
                  <span className="text-sm font-medium text-neutral-200">
                    {formatTime(appointment.startAt)} &mdash; {formatTime(appointment.endAt)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block">Timezone</span>
                  <span className="text-xs font-mono text-neutral-300">
                    {appointment.timezone}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 block">Duration</span>
                  <span className="text-xs text-neutral-300">
                    {srv?.durationMinutes || 60} minutes
                  </span>
                </div>
              </div>
            </div>

            {/* Service Card */}
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
              <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-400" />
                Service Information
              </h3>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-neutral-100">
                    {srv?.name || 'Custom Service'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-blue-400 border border-neutral-700">
                    {srv?.category || 'Service'}
                  </span>
                </div>
                {srv?.description && (
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    {srv.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-neutral-400 pt-2 border-t border-neutral-800">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    Starting Price: ${srv?.startingPrice || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    Duration: {srv?.durationMinutes || 60}m
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Customer & Notes */}
          <div className="space-y-6">
            {/* Customer Card */}
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
              <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-400" />
                Customer Details
              </h3>

              <div className="space-y-3 pt-2">
                <div className="font-semibold text-base text-neutral-100">
                  {cust?.firstName} {cust?.lastName}
                </div>

                <div className="space-y-2 text-xs text-neutral-300">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-neutral-500" />
                    <a href={`tel:${cust?.phone}`} className="hover:text-blue-400 transition-colors">
                      {cust?.phone || 'No phone provided'}
                    </a>
                  </div>

                  {cust?.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-neutral-500" />
                      <a href={`mailto:${cust?.email}`} className="hover:text-blue-400 transition-colors">
                        {cust.email}
                      </a>
                    </div>
                  )}

                  {cust?.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                      <span>
                        {cust.address.street && `${cust.address.street}, `}
                        {cust.address.city && `${cust.address.city}, `}
                        {cust.address.state} {cust.address.zip}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Notes & Instructions */}
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
              <h3 className="text-sm font-semibold text-neutral-200">
                Notes & Instructions
              </h3>

              <div className="space-y-3 pt-2 text-xs">
                <div>
                  <span className="font-medium text-neutral-400 block mb-1">
                    Customer Instructions:
                  </span>
                  <p className="p-3 bg-neutral-800/60 rounded-xl text-neutral-200 border border-neutral-800">
                    {appointment.customerNotes || 'No customer notes provided.'}
                  </p>
                </div>

                <div>
                  <span className="font-medium text-neutral-400 block mb-1">
                    Internal Staff Notes:
                  </span>
                  <p className="p-3 bg-neutral-800/60 rounded-xl text-neutral-200 border border-neutral-800">
                    {appointment.internalNotes || 'No internal notes.'}
                  </p>
                </div>

                {appointment.cancellationReason && (
                  <div>
                    <span className="font-medium text-rose-400 block mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Cancellation Reason:
                    </span>
                    <p className="p-3 bg-rose-500/10 rounded-xl text-rose-300 border border-rose-500/20">
                      {appointment.cancellationReason}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cancellation Reason Modal */}
        {cancelModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2.5 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-semibold text-neutral-100">Cancel Appointment</h3>
              </div>
              <p className="text-xs text-neutral-400">
                Are you sure you want to cancel this booking? Please provide an optional reason for your records.
              </p>
              <textarea
                rows={3}
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Reason (customer rescheduled, weather, parts delayed...)"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl p-3 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500"
              />
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setCancelModalOpen(false)}
                  className="bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 text-xs"
                >
                  Keep Appointment
                </Button>
                <Button
                  onClick={() => handleStatusChange('cancelled', cancellationReason)}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium"
                >
                  Confirm Cancellation
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Reschedule / Edit Modal */}
        <AppointmentModal
          isOpen={editModalOpen}
          appointment={appointment}
          onClose={() => setEditModalOpen(false)}
          onSaved={(updated) => {
            setAppointment(updated);
            setEditModalOpen(false);
          }}
        />
      </div>
    </DashboardShell>
  );
}
