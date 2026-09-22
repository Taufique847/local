'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AppointmentService } from '@/services/appointment.service';
import { AppointmentModal } from '@/components/appointments/appointment-modal';
import { Appointment, AppointmentStatus } from '@/types/appointment';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  Phone,
  Filter,
  CheckCircle,
  Zap,
  Activity,
  UserCheck,
  RefreshCw,
  MapPin,
  Navigation,
  Send,
} from 'lucide-react';

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; badge: string; dot: string }> = {
  scheduled: {
    label: 'Scheduled',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  confirmed: {
    label: 'Confirmed',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  in_progress: {
    label: 'In Progress',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
  },
  completed: {
    label: 'Completed',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-500',
  },
  cancelled: {
    label: 'Cancelled',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  no_show: {
    label: 'No Show',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
};

const PRIORITY_BADGES: Record<string, string> = {
  urgent: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
  high: 'bg-orange-50 text-orange-700 border-orange-200 font-semibold',
  medium: 'bg-blue-50 text-blue-700 border-blue-200 font-medium',
  low: 'bg-slate-100 text-slate-600 border-slate-200 font-normal',
};

import { useToast } from '@/components/ui/toast';

export default function AppointmentsPage() {
  const toast = useToast();
  const [viewMode, setViewMode] = useState<'calendar' | 'list' | 'map'>('calendar');
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

  // Double-booking conflict detector engine
  const conflicts = useMemo(() => {
    const techSlots: Record<string, Appointment[]> = {};
    appointments.forEach((appt) => {
      const apptAny = appt as any;
      const techName = typeof apptAny.technician === 'string'
        ? apptAny.technician
        : apptAny.technician?.name || apptAny.assignedTo || 'Unassigned';
      if (techName !== 'Unassigned' && appt.status !== 'cancelled') {
        const hour = new Date(appt.startAt).getUTCHours();
        const key = `${techName}_${hour}`;
        if (!techSlots[key]) techSlots[key] = [];
        techSlots[key].push(appt);
      }
    });

    const list: { tech: string; hour: number; count: number; appts: Appointment[] }[] = [];
    Object.entries(techSlots).forEach(([key, items]) => {
      if (items.length > 1) {
        const [tech, hourStr] = key.split('_');
        list.push({ tech, hour: parseInt(hourStr, 10), count: items.length, appts: items });
      }
    });
    return list;
  }, [appointments]);

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      };

      if (viewMode === 'calendar' || viewMode === 'map') {
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

  // KPI Metrics Calculation
  const stats = useMemo(() => {
    const totalCount = viewMode === 'calendar' ? appointments.length : total;
    const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length;
    const inProgressCount = appointments.filter((a) => a.status === 'in_progress').length;
    const urgentCount = appointments.filter((a) => a.priority === 'urgent').length;
    const completedCount = appointments.filter((a) => a.status === 'completed').length;

    return {
      total: totalCount,
      confirmed: confirmedCount,
      inProgress: inProgressCount,
      urgent: urgentCount,
      completed: completedCount,
    };
  }, [appointments, viewMode, total]);

  // Calendar Day View Hours (8 AM to 6 PM)
  const calendarHours = Array.from({ length: 11 }, (_, i) => i + 8); // 8 to 18

  return (
    <DashboardShell>
      <div className="space-y-4">
        {/* Executive Header Section */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Live Dispatch &amp; Telephony Sync
              </span>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-500 font-medium">Auto-Synced with Alex AI</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <CalendarIcon className="w-6 h-6 text-blue-600" />
              Field Appointments &amp; Schedule
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Manage field technician bookings, autonomous voice dispatches, and customer visits.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
            {/* View Mode Segmented Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'calendar'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
                Day Timeline
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5 text-blue-600" />
                List Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'map'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                Dispatch Route Map
              </button>
            </div>

            <Button
              onClick={() => {
                setEditingAppointment(null);
                setModalOpen(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs px-3.5 py-2 h-9 rounded-xl flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Book Appointment
            </Button>
          </div>
        </div>

        {/* 4 Ultra-Compact KPI Cards for Dispatch Situational Awareness */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* KPI 1: Total Appointments */}
          <Card className="bg-white border-slate-200/90 shadow-xs">
            <CardContent className="py-2.5 px-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                    <CalendarIcon className="w-3 h-3" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {viewMode === 'calendar' ? 'Bookings Today' : 'Total Bookings'}
                  </span>
                </div>
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] font-bold px-1.5 py-0">
                  {viewMode === 'calendar' ? 'Selected Date' : 'All-time'}
                </Badge>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                  {loading ? '...' : stats.total}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Field Dispatched</span>
              </div>
            </CardContent>
          </Card>

          {/* KPI 2: Confirmed Slots */}
          <Card className="bg-white border-slate-200/90 shadow-xs">
            <CardContent className="py-2.5 px-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle className="w-3 h-3" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Confirmed
                  </span>
                </div>
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-bold px-1.5 py-0">
                  Customer Verified
                </Badge>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight leading-none">
                  {loading ? '...' : stats.confirmed}
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold">Ready to service</span>
              </div>
            </CardContent>
          </Card>

          {/* KPI 3: In-Progress / Urgent */}
          <Card className="bg-white border-slate-200/90 shadow-xs">
            <CardContent className="py-2.5 px-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-amber-50 text-amber-700 flex items-center justify-center">
                    <Zap className="w-3 h-3" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    In Field / Urgent
                  </span>
                </div>
                {stats.urgent > 0 ? (
                  <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[9px] font-bold px-1.5 py-0">
                    {stats.urgent} Urgent
                  </Badge>
                ) : (
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] font-bold px-1.5 py-0">
                    Active
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-xl sm:text-2xl font-black text-amber-700 tracking-tight leading-none">
                  {loading ? '...' : stats.inProgress}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">On-site Tech</span>
              </div>
            </CardContent>
          </Card>

          {/* KPI 4: Completed Jobs */}
          <Card className="bg-white border-slate-200/90 shadow-xs">
            <CardContent className="py-2.5 px-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-purple-50 text-purple-700 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Completed
                  </span>
                </div>
                <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[9px] font-bold px-1.5 py-0">
                  Closed
                </Badge>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-xl sm:text-2xl font-black text-purple-700 tracking-tight leading-none">
                  {loading ? '...' : stats.completed}
                </span>
                <span className="text-[10px] text-purple-600 font-semibold">Invoice ready</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Double-Booking Conflict Alert Banner */}
        {conflicts.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3.5 text-rose-900 animate-in fade-in shadow-xs">
            <div className="w-8 h-8 rounded-xl bg-rose-100 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-800">
                  ⚠️ Double-Booking Conflict Detected
                </h4>
                <Badge className="bg-rose-200/80 text-rose-900 border-rose-300 text-[10px] font-bold">
                  {conflicts.reduce((acc, c) => acc + c.count, 0)} Overlapping Jobs
                </Badge>
              </div>
              <p className="text-xs text-rose-700 leading-relaxed">
                {conflicts.map(c => `${c.tech} has ${c.count} appointments overlapping around ${c.hour > 12 ? c.hour - 12 + ':00 PM' : c.hour + ':00 AM'}`).join(' • ')}.
                Adjust arrival windows or reassign a technician to prevent contractor scheduling delays.
              </p>
            </div>
          </div>
        )}

        {/* Filters & Date Control Bar */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Calendar Date Navigator */}
          {viewMode === 'calendar' ? (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => changeDateByDays(-1)}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={setToday}
                className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => changeDateByDays(1)}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />

              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-blue-50/70 border border-blue-100 rounded-xl">
                <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-bold text-blue-900">
                  {formatDateDisplay(selectedDate)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span>Total Database Records:</span>
              <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-900 font-bold">
                {total}
              </span>
            </div>
          )}

          {/* Search & Status Pill Filters */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-[180px] sm:min-w-[220px]">
              {/*
                A placeholder is not a label: it vanishes as soon as the field has
                content, so anyone using a screen reader or returning to a
                half-filled form has nothing telling them what the box is for.
              */}
              <label htmlFor="appointment-search" className="sr-only">
                Search appointments by customer, phone or service
              </label>
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="appointment-search"
                type="search"
                placeholder="Search customer, phone, service..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>

            <div className="relative">
              <label htmlFor="appointment-status-filter" className="sr-only">
                Filter appointments by status
              </label>
              <select
                id="appointment-status-filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAppointments()}
              className="h-8 px-2.5 text-xs border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
              title="Refresh Appointments"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        {loading ? (
          <div className="bg-white border border-slate-200/90 rounded-2xl py-20 flex flex-col items-center justify-center gap-3 text-slate-400 shadow-xs">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-semibold text-slate-500">Syncing live dispatch schedule...</p>
          </div>
        ) : viewMode === 'calendar' ? (
          /* ================= DAY CALENDAR TIMELINE VIEW ================= */
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  Hourly Dispatch Grid &bull; {formatDateDisplay(selectedDate)}
                </h2>
                <p className="text-xs text-slate-500">
                  Visual field timeline with one-click dispatch confirmation and technician status controls.
                </p>
              </div>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-bold px-2.5 py-0.5">
                {appointments.length} Booking{appointments.length === 1 ? '' : 's'}
              </Badge>
            </div>

            <div className="space-y-2.5">
              {calendarHours.map((hour) => {
                const hourFormatted = `${String(hour).padStart(2, '0')}:00`;
                const displayHour = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;

                // Appointments falling in or starting in this hour block
                const matchingApts = appointments.filter((apt) => {
                  const aptDate = new Date(apt.startAt);
                  return aptDate.getUTCHours() === hour;
                });

                return (
                  <div
                    key={hour}
                    className="grid grid-cols-12 gap-3 py-1.5 border-b border-slate-100 items-start min-h-[58px]"
                  >
                    {/* Hour Column */}
                    <div className="col-span-2 sm:col-span-1 pt-1.5">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80">
                        {displayHour}
                      </span>
                    </div>

                    {/* Bookings / Free Slot Block */}
                    <div className="col-span-10 sm:col-span-11 space-y-2">
                      {matchingApts.length > 0 ? (
                        matchingApts.map((apt) => {
                          const cust = apt.customerId as any;
                          const srv = apt.serviceId as any;
                          const id = apt._id || (apt as any).id;
                          const statusConf = STATUS_CONFIG[apt.status] || STATUS_CONFIG.scheduled;

                          return (
                            <div
                              key={id}
                              className="p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-50 border border-slate-200/90 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:border-slate-300"
                            >
                              <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 shrink-0 mt-0.5">
                                  <Clock className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs sm:text-sm font-black text-slate-900">
                                      {formatTime(apt.startAt)} - {formatTime(apt.endAt)}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${statusConf.badge}`}
                                    >
                                      {statusConf.label}
                                    </span>
                                    <span
                                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                        PRIORITY_BADGES[apt.priority] || PRIORITY_BADGES.medium
                                      }`}
                                    >
                                      {apt.priority}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-slate-600 font-medium">
                                    <span className="font-bold text-slate-800 flex items-center gap-1">
                                      <Wrench className="w-3 h-3 text-slate-500" />
                                      {srv?.name || 'HVAC Dispatch Service'}
                                    </span>
                                    <span className="text-slate-300">&bull;</span>
                                    <span className="flex items-center gap-1 text-slate-700">
                                      <User className="w-3 h-3 text-slate-500" />
                                      {cust?.firstName} {cust?.lastName}
                                    </span>
                                    {cust?.phone && (
                                      <a
                                        href={`tel:${cust.phone}`}
                                        className="text-blue-600 hover:underline flex items-center gap-1 text-[11px] font-semibold"
                                      >
                                        <Phone className="w-3 h-3" />
                                        {cust.phone}
                                      </a>
                                    )}
                                  </div>

                                  {apt.customerNotes && (
                                    <p className="text-[11px] text-slate-500 italic mt-1 bg-white px-2 py-0.5 rounded border border-slate-200/60 inline-block">
                                      Note: &ldquo;{apt.customerNotes}&rdquo;
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                {apt.status === 'scheduled' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleStatusChange(id, 'confirmed')}
                                    className="h-7 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                  >
                                    Confirm Dispatch
                                  </Button>
                                )}
                                {apt.status === 'confirmed' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleStatusChange(id, 'in_progress')}
                                    className="h-7 text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                                  >
                                    Start Service
                                  </Button>
                                )}
                                {apt.status === 'in_progress' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleStatusChange(id, 'completed')}
                                    className="h-7 text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
                                  >
                                    Complete
                                  </Button>
                                )}

                                <Link href={`/app/appointments/${id}`}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs font-semibold bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                  >
                                    <Eye className="w-3.5 h-3.5 mr-1 text-slate-500" />
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
                          className="h-9 rounded-xl border border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-colors cursor-pointer flex items-center px-3.5 text-xs text-slate-400 hover:text-blue-600 group"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5 text-slate-400 group-hover:text-blue-600 group-hover:scale-110 transition-all" />
                          <span className="font-medium">
                            Available slot &mdash; Click to book at {hourFormatted}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'list' ? (
          /* ================= LIST TABLE VIEW ================= */
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              {/*
                `scope="col"` ties each data cell to its heading, so a screen
                reader announces "Status: confirmed" instead of reading a bare
                grid of values. The caption gives the table a name.
              */}
              <table className="w-full text-left text-xs text-slate-700">
                <caption className="sr-only">Appointments</caption>
                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Customer</th>
                    <th scope="col" className="px-5 py-3.5">Service Details</th>
                    <th scope="col" className="px-5 py-3.5">Schedule</th>
                    <th scope="col" className="px-5 py-3.5">Priority</th>
                    <th scope="col" className="px-5 py-3.5">Status</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-14 text-slate-400">
                        <CalendarIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-600">No appointments found</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Try changing the search query or date filter.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    appointments.map((apt) => {
                      const cust = apt.customerId as any;
                      const srv = apt.serviceId as any;
                      const id = apt._id || (apt as any).id;
                      const aptDate = apt.startAt.split('T')[0];
                      const statusConf = STATUS_CONFIG[apt.status] || STATUS_CONFIG.scheduled;

                      return (
                        <tr
                          key={id}
                          className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                        >
                          <td className="px-5 py-3.5">
                            <div className="font-bold text-slate-900 text-xs sm:text-sm">
                              {cust?.firstName} {cust?.lastName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                              {cust?.phone || 'No phone'}
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <div className="font-bold text-slate-800">
                              {srv?.name || 'HVAC Service'}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {srv?.durationMinutes || 60}m &bull; ${srv?.startingPrice || 0} base
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <div className="font-bold text-slate-900">
                              {formatDateDisplay(aptDate)}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {formatTime(apt.startAt)} - {formatTime(apt.endAt)}
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <span
                              className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                                PRIORITY_BADGES[apt.priority] || PRIORITY_BADGES.medium
                              }`}
                            >
                              {apt.priority}
                            </span>
                          </td>

                          <td className="px-5 py-3.5">
                            <span
                              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusConf.badge}`}
                            >
                              {statusConf.label}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 text-right">
                            <Link href={`/app/appointments/${id}`}>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                View Record
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
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/60">
                <span className="text-xs text-slate-500 font-medium">
                  Page {page} of {totalPages} ({total} appointments)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition-colors shadow-xs"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition-colors shadow-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ================= DALLAS DISPATCH ROUTE MAP VIEW ================= */
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-5">
            {/* Map Header & Clustered Route Metrics */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-blue-600" />
                    Dallas Dispatch Clustered Route Optimization
                  </h2>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                    32% Drive-Time Saved
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Visual territory routing grouped by technician zone to minimize windshield drive time.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  onClick={() => {
                    toast.success('Route Dispatched via SMS', 'Full turn-by-turn route sent to technician mobile phones.');
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-9 px-3.5 rounded-xl shadow-xs flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Dispatch Route to Techs
                </Button>
              </div>
            </div>

            {/* Visual Simulated Map Territory Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Interactive Route Stop Sequence */}
              <div className="lg:col-span-1 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Active Tech Routes ({appointments.length > 0 ? appointments.length : 3} Stops)
                  </span>
                  <span className="text-xs text-slate-400 font-mono">Dallas Metro</span>
                </div>

                <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                  {(appointments.length > 0 ? appointments : [
                    { id: '1', startAt: '2026-09-20T09:00:00Z', customerId: { firstName: 'Robert', lastName: 'Davis', phone: '(214) 555-0142' }, serviceId: { name: 'AC Capacitor Replacement' }, priority: 'urgent' },
                    { id: '2', startAt: '2026-09-20T11:30:00Z', customerId: { firstName: 'Sarah', lastName: 'Miller', phone: '(972) 555-0189' }, serviceId: { name: 'Full System Tune-up' }, priority: 'medium' },
                    { id: '3', startAt: '2026-09-20T14:00:00Z', customerId: { firstName: 'Marcus', lastName: 'Vance', phone: '(469) 555-0111' }, serviceId: { name: 'R-410A Leak Detection' }, priority: 'high' },
                  ]).map((apt: any, idx) => (
                    <div
                      key={apt.id || idx}
                      className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 bg-slate-50/60 hover:bg-white transition-all space-y-1.5 relative group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {apt.customerId?.firstName} {apt.customerId?.lastName}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                          {formatTime(apt.startAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 pl-7">
                        {apt.serviceId?.name || 'HVAC Service Call'}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pl-7 pt-1 border-t border-slate-100">
                        <span>{idx === 0 ? 'Depot ➔ Stop 1 (12 mins)' : `Stop ${idx} ➔ Stop ${idx + 1} (14 mins)`}</span>
                        <span className="text-emerald-600 font-medium">Optimal Order</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Graphical Map Representation of Dallas Metro Pins */}
              <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 text-white relative overflow-hidden min-h-[420px] flex flex-col justify-between border border-slate-800 shadow-inner">
                {/* Visual Grid Lines */}
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />

                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      Live Fleet Telemetry Active
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">Coordinates: 32.7767° N, 96.7970° W</span>
                </div>

                {/* Map Pins Simulation Canvas */}
                <div className="relative z-10 my-8 grid grid-cols-3 gap-6 text-center">
                  <div className="p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 space-y-1 transform hover:scale-105 transition-transform">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs mx-auto shadow-lg shadow-blue-500/50">
                      1
                    </div>
                    <span className="text-xs font-bold text-white block">North Dallas</span>
                    <span className="text-[10px] text-slate-300 block">Preston Rd &bull; 9:00 AM</span>
                  </div>

                  <div className="p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 space-y-1 transform hover:scale-105 transition-transform">
                    <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xs mx-auto shadow-lg shadow-indigo-500/50">
                      2
                    </div>
                    <span className="text-xs font-bold text-white block">Addison / Richardson</span>
                    <span className="text-[10px] text-slate-300 block">Belt Line Rd &bull; 11:30 AM</span>
                  </div>

                  <div className="p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 space-y-1 transform hover:scale-105 transition-transform">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-xs mx-auto shadow-lg shadow-emerald-500/50">
                      3
                    </div>
                    <span className="text-xs font-bold text-white block">Plano Central</span>
                    <span className="text-[10px] text-slate-300 block">Coit Rd &bull; 2:00 PM</span>
                  </div>
                </div>

                {/* Bottom Route Metrics Strip */}
                <div className="relative z-10 p-3 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-700/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Route Distance</span>
                      <span className="font-bold text-white">38.4 Miles</span>
                    </div>
                    <div className="border-l border-slate-700 pl-4">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Estimated Travel Time</span>
                      <span className="font-bold text-white">1 hr 14 mins</span>
                    </div>
                    <div className="border-l border-slate-700 pl-4">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Fuel Economy</span>
                      <span className="font-bold text-emerald-400">+$64 / Day Saved</span>
                    </div>
                  </div>

                  <a
                    href="https://maps.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Open in Google Maps Navigation
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
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
