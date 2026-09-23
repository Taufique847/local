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
  Construction,
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

export default function AppointmentsPage() {
  // The toast hook was here only to fake a "route dispatched" confirmation for a
  // button that called no API. Removed with the rest of that panel.
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
                Route Map
                {/* Labelled so nobody expects working routing behind it. */}
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600">
                  Soon
                </span>
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
          /* ================= DISPATCH ROUTE MAP — NOT BUILT ================= */
          /*
           * This tab previously rendered a complete fabrication presented as live
           * data: a "32% Drive-Time Saved" badge, "38.4 Miles", "1 hr 14 mins",
           * "+$64 / Day Saved", invented per-leg drive times, three hardcoded
           * Dallas map pins with a literal coordinate readout, three invented
           * customers shown whenever there was no real data, and a "Dispatch Route
           * to Techs" button that fired a toast claiming a route had been sent
           * while calling no API at all.
           *
           * None of it was real. There is no geocoding in the backend, no
           * coordinates on a technician or a job, and no routing algorithm — the
           * only real dispatch output is an SMS containing a Google Maps link to
           * the job's text address.
           *
           * Showing invented operational numbers is worse than showing nothing: a
           * dispatcher plans a day around them.
           */
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs">
            <div className="mx-auto max-w-xl space-y-5 text-center">
              <div
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600"
                aria-hidden="true"
              >
                <Construction className="h-6 w-6" />
              </div>

              <div className="space-y-1.5">
                <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Not available yet
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  Route optimisation is not built
                </h2>
                <p className="mx-auto max-w-md text-sm text-slate-600 leading-relaxed">
                  Real routing needs job addresses converted to coordinates and a home
                  base for each technician. Neither exists yet, so any map, mileage or
                  time saving shown here would be invented.
                </p>
              </div>

              <ul className="mx-auto max-w-sm space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
                {[
                  'Geocoded job sites and technician home bases',
                  'Ordered stops per technician per day, with real distance and drive time',
                  'A live map with job pins, technician positions and zone overlays',
                  'Send the ordered route to each technician',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-slate-600">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {/* What genuinely works today, so the tab is not a dead end. */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-left">
                <p className="text-xs font-bold text-blue-900 mb-1.5">
                  What you can use today
                </p>
                <p className="text-xs text-blue-800/90 leading-relaxed">
                  Assign a technician when you book a job, and match callers to the
                  right technician by ZIP code using{' '}
                  <Link
                    href="/app/settings"
                    className="font-semibold text-blue-700 underline hover:text-blue-900"
                  >
                    service zones
                  </Link>
                  . Dispatching a job texts the technician the customer&apos;s address
                  with a Google Maps link.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <List className="h-4 w-4" aria-hidden="true" />
                Back to the job list
              </button>
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
