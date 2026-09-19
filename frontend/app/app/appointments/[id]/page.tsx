'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AppointmentService } from '@/services/appointment.service';
import { AppointmentModal } from '@/components/appointments/appointment-modal';
import { Appointment, AppointmentStatus } from '@/types/appointment';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  FileText,
  Building,
} from 'lucide-react';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_progress: 'bg-amber-50 text-amber-800 border-amber-200',
  completed: 'bg-purple-50 text-purple-700 border-purple-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  no_show: 'bg-slate-100 text-slate-700 border-slate-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
  high: 'bg-orange-50 text-orange-700 border-orange-200 font-semibold',
  medium: 'bg-blue-50 text-blue-700 border-blue-200 font-medium',
  low: 'bg-slate-100 text-slate-600 border-slate-200 font-normal',
};

export default function AppointmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const appointmentId = (params?.id as string) || '';

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
        <div className="bg-white border border-slate-200/90 rounded-2xl py-24 flex flex-col items-center justify-center gap-3 text-slate-400 shadow-xs">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-xs font-semibold text-slate-500">Loading appointment details...</p>
        </div>
      </DashboardShell>
    );
  }

  if (error || !appointment) {
    return (
      <DashboardShell>
        <div className="max-w-xl mx-auto py-16 text-center space-y-4 bg-white border border-slate-200/90 rounded-2xl p-8 shadow-xs">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Appointment Not Found</h2>
          <p className="text-xs text-slate-500">{error || 'The requested appointment could not be found in the database.'}</p>
          <Link href="/app/appointments">
            <Button variant="outline" className="mt-4 border-slate-200 text-slate-700 hover:bg-slate-50">
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
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Navigation & Header */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app/appointments"
              className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  {appointment.title || 'Field Dispatch Record'}
                </h1>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border uppercase ${
                    STATUS_COLORS[appointment.status] || STATUS_COLORS.scheduled
                  }`}
                >
                  {appointment.status.replace('_', ' ')}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                    PRIORITY_COLORS[appointment.priority] || PRIORITY_COLORS.medium
                  }`}
                >
                  {appointment.priority} priority
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Booked via <span className="capitalize">{appointment.source.replace('_', ' ')}</span> &bull; Logged by {appointment.createdBy}
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setEditModalOpen(true)}
              className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs h-9 rounded-xl shadow-xs"
            >
              <Edit2 className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
              Reschedule / Edit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-semibold text-xs h-9 rounded-xl shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
              Delete
            </Button>
          </div>
        </div>

        {/* Status Lifecycle Actions Bar */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="text-xs text-slate-600 font-medium flex items-center gap-2">
            <span>Current Dispatch Status:</span>
            <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border uppercase ${STATUS_COLORS[appointment.status]}`}>
              {appointment.status.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {appointment.status === 'scheduled' && (
              <Button
                size="sm"
                disabled={updatingStatus}
                onClick={() => handleStatusChange('confirmed')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl h-8 shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Confirm Dispatch
              </Button>
            )}

            {appointment.status === 'confirmed' && (
              <Button
                size="sm"
                disabled={updatingStatus}
                onClick={() => handleStatusChange('in_progress')}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl h-8 shadow-xs"
              >
                <Clock className="w-3.5 h-3.5 mr-1.5" />
                Mark In Field
              </Button>
            )}

            {appointment.status === 'in_progress' && (
              <Button
                size="sm"
                disabled={updatingStatus}
                onClick={() => handleStatusChange('completed')}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl h-8 shadow-xs"
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
                  className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl h-8"
                >
                  Mark No Show
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingStatus}
                  onClick={() => setCancelModalOpen(true)}
                  className="border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold rounded-xl h-8"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
                  Cancel Booking
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 2-Column Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left Column: Schedule & Service */}
          <div className="space-y-5">
            {/* Schedule Card */}
            <div className="p-5 bg-white border border-slate-200/90 rounded-2xl space-y-4 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                Schedule &amp; Time
              </h3>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Date</span>
                  <span className="text-xs sm:text-sm font-bold text-slate-900">
                    {formatDate(appointment.startAt)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Time Slot</span>
                  <span className="text-xs sm:text-sm font-bold text-slate-900">
                    {formatTime(appointment.startAt)} &mdash; {formatTime(appointment.endAt)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Timezone</span>
                  <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80 inline-block mt-0.5">
                    {appointment.timezone}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Estimated Duration</span>
                  <span className="text-xs font-bold text-slate-800">
                    {srv?.durationMinutes || 60} minutes
                  </span>
                </div>
              </div>
            </div>

            {/* Service Card */}
            <div className="p-5 bg-white border border-slate-200/90 rounded-2xl space-y-4 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-600" />
                Service Information
              </h3>

              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-slate-900">
                    {srv?.name || 'Custom HVAC Dispatch'}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {srv?.category || 'Field Service'}
                  </span>
                </div>
                {srv?.description && (
                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                    {srv.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs font-semibold text-slate-700 pt-2 border-t border-slate-100">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    Starting: ${srv?.startingPrice || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    Duration: {srv?.durationMinutes || 60}m
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Customer & Notes */}
          <div className="space-y-5">
            {/* Customer Card */}
            <div className="p-5 bg-white border border-slate-200/90 rounded-2xl space-y-4 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                Customer Details
              </h3>

              <div className="space-y-3 pt-1">
                <div className="font-bold text-base text-slate-900">
                  {cust?.firstName} {cust?.lastName}
                </div>

                <div className="space-y-2 text-xs font-medium text-slate-700">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <a href={`tel:${cust?.phone}`} className="text-blue-600 hover:underline font-bold">
                      {cust?.phone || 'No phone provided'}
                    </a>
                  </div>

                  {cust?.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <a href={`mailto:${cust?.email}`} className="text-blue-600 hover:underline">
                        {cust.email}
                      </a>
                    </div>
                  )}

                  {cust?.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
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
            <div className="p-5 bg-white border border-slate-200/90 rounded-2xl space-y-4 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Notes &amp; Field Instructions
              </h3>

              <div className="space-y-3 pt-1 text-xs">
                <div>
                  <span className="font-bold text-slate-700 block mb-1">
                    Customer Instructions:
                  </span>
                  <p className="p-3 bg-slate-50 rounded-xl text-slate-800 border border-slate-200/80 font-medium">
                    {appointment.customerNotes || 'No specific customer instructions provided.'}
                  </p>
                </div>

                <div>
                  <span className="font-bold text-slate-700 block mb-1">
                    Internal Staff Notes:
                  </span>
                  <p className="p-3 bg-slate-50 rounded-xl text-slate-800 border border-slate-200/80 font-medium">
                    {appointment.internalNotes || 'No internal technician notes.'}
                  </p>
                </div>

                {appointment.cancellationReason && (
                  <div>
                    <span className="font-bold text-rose-700 block mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      Cancellation Reason:
                    </span>
                    <p className="p-3 bg-rose-50 rounded-xl text-rose-800 border border-rose-200 font-semibold">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
            <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-2xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2.5 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">Cancel Appointment Booking</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to cancel this field dispatch? Please provide an optional reason for audit logs.
              </p>
              <textarea
                rows={3}
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Reason (customer rescheduled, weather, parts shipment delayed...)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setCancelModalOpen(false)}
                  className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl h-9"
                >
                  Keep Appointment
                </Button>
                <Button
                  onClick={() => handleStatusChange('cancelled', cancellationReason)}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl h-9 shadow-xs"
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
