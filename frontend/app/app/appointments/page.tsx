'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AppointmentService } from '@/services/appointment.service';
import { AppointmentModal } from '@/components/appointments/appointment-modal';
import { Appointment, AppointmentStatus } from '@/types/appointment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Calendar as CalendarIcon,
  Plus,
  Search,
  Loader2,
  Clock,
  User,
  Wrench,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  List,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Eye,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  cancelled: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  no_show: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

const PRIORITY_BADGES: Record<string, string> = {
  urgent: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  low: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

export default function AppointmentsPage() {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Pagination for list view
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      };

      if (viewMode === 'calendar') {
        params.date = selectedDate;
        params.limit = 100;
      } else {
        params.page = page;
        params.limit = 15;
      }

      const res = await AppointmentService.getAppointments(params);
      setAppointments(res.appointments || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setLoading(false);
    }
  }, [viewMode, selectedDate, search, statusFilter, page]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Date Navigation
  const changeDateByDays = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const setToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  // Quick Status Update
  const handleStatusChange = async (id: string, newStatus: AppointmentStatus) => {
    try {
      await AppointmentService.updateStatus(id, newStatus);
      fetchAppointments();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  // Format Helpers
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(`${dateStr}T12:00:00`);
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Calendar Day View Hours (8 AM to 6 PM)
  const calendarHours = Array.from({ length: 11 }, (_, i) => i + 8); // 8 to 18

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-100 flex items-center gap-2.5">
              <CalendarIcon className="w-7 h-7 text-blue-500" />
              Appointments & Calendar
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Manage scheduled bookings, technician dispatches, and customer visits
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl p-1">
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'calendar'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Day View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                List View
              </button>
            </div>

            <Button
              onClick={() => {
                setEditingAppointment(null);
                setModalOpen(true);
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Appointment
            </Button>
          </div>
        </div>

        {/* Filters & Date Bar */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Calendar Date Navigator */}
          {viewMode === 'calendar' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeDateByDays(-1)}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={setToday}
                className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => changeDateByDays(1)}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
              />
              <span className="text-sm font-semibold text-neutral-200 ml-2 hidden sm:inline">
                {formatDateDisplay(selectedDate)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <span>Total Bookings:</span>
              <span className="font-semibold text-neutral-200">{total}</span>
            </div>
          )}

          {/* Search & Status Pill Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="Search appointments..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
          </div>
        </div>

        {/* Main Content Area */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-neutral-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium">Loading schedule...</p>
          </div>
        ) : viewMode === 'calendar' ? (
          /* ================= DAY CALENDAR VIEW ================= */
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h2 className="text-base font-semibold text-neutral-200">
                Timeline for {formatDateDisplay(selectedDate)}
              </h2>
              <span className="text-xs text-neutral-400">
                {appointments.length} booking{appointments.length === 1 ? '' : 's'} on this date
              </span>
            </div>

            <div className="space-y-3">
              {calendarHours.map((hour) => {
                const hourFormatted = `${String(hour).padStart(2, '0')}:00`;
                const nextHourFormatted = `${String(hour + 1).padStart(2, '0')}:00`;

                // Appointments falling in or starting in this hour block
                const matchingApts = appointments.filter((apt) => {
                  const aptDate = new Date(apt.startAt);
                  return aptDate.getUTCHours() === hour;
                });

                return (
                  <div
                    key={hour}
                    className="grid grid-cols-12 gap-3 py-2 border-b border-neutral-800/60 items-start min-h-[64px]"
                  >
                    {/* Hour Column */}
                    <div className="col-span-2 sm:col-span-1 text-xs font-semibold text-neutral-400 pt-1">
                      {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
                    </div>

                    {/* Bookings / Free Slot Block */}
                    <div className="col-span-10 sm:col-span-11 space-y-2">
                      {matchingApts.length > 0 ? (
                        matchingApts.map((apt) => {
                          const cust = apt.customerId as any;
                          const srv = apt.serviceId as any;
                          const id = apt._id || (apt as any).id;

                          return (
                            <div
                              key={id}
                              className="p-3.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
                            >
                              <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                                  <Clock className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-neutral-100">
                                      {formatTime(apt.startAt)} - {formatTime(apt.endAt)}
                                    </span>
                                    <span
                                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                        STATUS_COLORS[apt.status]
                                      }`}
                                    >
                                      {apt.status.replace('_', ' ').toUpperCase()}
                                    </span>
                                    <span
                                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                        PRIORITY_BADGES[apt.priority]
                                      }`}
                                    >
                                      {apt.priority}
                                    </span>
                                  </div>
                                  <p className="text-xs text-neutral-300 font-medium mt-1">
                                    {srv?.name || 'Service'} &bull; Customer:{' '}
                                    {cust?.firstName} {cust?.lastName} ({cust?.phone || 'No phone'})
                                  </p>
                                  {apt.customerNotes && (
                                    <p className="text-[11px] text-neutral-400 italic mt-0.5">
                                      Note: &ldquo;{apt.customerNotes}&rdquo;
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Action buttons */}
                              <div className="flex items-center gap-2 shrink-0">
                                {apt.status === 'scheduled' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleStatusChange(id, 'confirmed')}
                                    className="h-7 text-xs bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30"
                                  >
                                    Confirm
                                  </Button>
                                )}
                                {apt.status === 'confirmed' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleStatusChange(id, 'in_progress')}
                                    className="h-7 text-xs bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 border border-amber-500/30"
                                  >
                                    Start
                                  </Button>
                                )}
                                {apt.status === 'in_progress' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleStatusChange(id, 'completed')}
                                    className="h-7 text-xs bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/30"
                                  >
                                    Complete
                                  </Button>
                                )}

                                <Link href={`/app/appointments/${id}`}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700"
                                  >
                                    <Eye className="w-3.5 h-3.5 mr-1" />
                                    Details
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div
                          onClick={() => {
                            setSelectedDate(selectedDate);
                            setEditingAppointment(null);
                            setModalOpen(true);
                          }}
                          className="h-9 rounded-lg border border-dashed border-neutral-800 hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors cursor-pointer flex items-center px-3 text-xs text-neutral-600 hover:text-blue-400 group"
                        >
                          <Plus className="w-3 h-3 mr-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            Available — Click to schedule at {hourFormatted}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ================= LIST TABLE VIEW ================= */
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-neutral-800/70 border-b border-neutral-800 uppercase tracking-wider text-neutral-400 font-semibold">
                  <tr>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Service</th>
                    <th className="px-5 py-3.5">Schedule</th>
                    <th className="px-5 py-3.5">Priority</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {appointments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-neutral-500">
                        No appointments found matching the current criteria.
                      </td>
                    </tr>
                  ) : (
                    appointments.map((apt) => {
                      const cust = apt.customerId as any;
                      const srv = apt.serviceId as any;
                      const id = apt._id || (apt as any).id;
                      const aptDate = apt.startAt.split('T')[0];

                      return (
                        <tr
                          key={id}
                          className="hover:bg-neutral-800/40 transition-colors cursor-pointer"
                        >
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-neutral-100">
                              {cust?.firstName} {cust?.lastName}
                            </div>
                            <div className="text-[11px] text-neutral-400">
                              {cust?.phone || 'No phone'}
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <div className="font-medium text-neutral-200">
                              {srv?.name || 'Service'}
                            </div>
                            <div className="text-[11px] text-neutral-400">
                              {srv?.durationMinutes || 60}m &bull; ${srv?.startingPrice || 0}
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <div className="font-medium text-neutral-200">
                              {formatDateDisplay(aptDate)}
                            </div>
                            <div className="text-[11px] text-neutral-400">
                              {formatTime(apt.startAt)} - {formatTime(apt.endAt)}
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${
                                PRIORITY_BADGES[apt.priority]
                              }`}
                            >
                              {apt.priority}
                            </span>
                          </td>

                          <td className="px-5 py-3.5">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${
                                STATUS_COLORS[apt.status]
                              }`}
                            >
                              {apt.status.replace('_', ' ')}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 text-right">
                            <Link href={`/app/appointments/${id}`}>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                              >
                                View
                                <ArrowRight className="w-3.5 h-3.5 ml-1" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800 bg-neutral-900/80">
                <span className="text-xs text-neutral-400">
                  Page {page} of {totalPages} ({total} appointments)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1 text-xs rounded-lg bg-neutral-800 text-neutral-300 disabled:opacity-50 hover:bg-neutral-700"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1 text-xs rounded-lg bg-neutral-800 text-neutral-300 disabled:opacity-50 hover:bg-neutral-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Appointment Modal */}
        <AppointmentModal
          isOpen={modalOpen}
          appointment={editingAppointment}
          initialDate={selectedDate}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            fetchAppointments();
          }}
        />
      </div>
    </DashboardShell>
  );
}
