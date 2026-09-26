'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AppointmentService } from '@/services/appointment.service';
import { AppointmentModal } from '@/components/appointments/appointment-modal';
import { DispatchMapView } from '@/components/appointments/dispatch-map-view';
import { BusinessService } from '@/services/business.service';
import { Appointment, AppointmentStatus } from '@/types/appointment';
import { Business } from '@/types/business';
import {
  DEFAULT_TIMEZONE,
  formatTimeInZone,
  hourLabel,
  instantForCell,
  monthGridOf,
  monthLabel,
  monthOf,
  parseTimeOfDay,
  shiftDateKey,
  shiftMonthKey,
  shortDayLabel,
  weekOf,
  weekdayForDateKey,
  zonedDateKey,
  zonedParts,
  zoneAbbreviation,
} from '@/lib/zoned-time';
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
  CalendarRange,
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
  /**
   * `week` and `month` are new. `calendar` stays the day timeline so nothing that links
   * here changes meaning.
   */
  const [viewMode, setViewMode] = useState<'calendar' | 'week' | 'month' | 'list' | 'map'>(
    'calendar'
  );
  const isRangeView = viewMode === 'week' || viewMode === 'month';
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  /**
   * The business's own hours and timezone.
   *
   * Loaded once. Without it this page had no way to know what "08:00" meant, so it
   * rendered a hardcoded 8–18 grid bucketed in UTC.
   */
  const [business, setBusiness] = useState<Business | null>(null);
  const timezone = business?.timezone || DEFAULT_TIMEZONE;

  // Today where the business is. `toISOString()` gave today in UTC, which for a US
  // dispatcher is tomorrow for the last few hours of every evening.
  const [selectedDate, setSelectedDate] = useState<string>(() => zonedDateKey(new Date()));

  useEffect(() => {
    let cancelled = false;
    BusinessService.getMyBusiness().then((b) => {
      if (!cancelled) setBusiness(b);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-anchored once the real timezone arrives, so the board opens on the right day.
  useEffect(() => {
    if (business?.timezone) setSelectedDate(zonedDateKey(new Date(), business.timezone));
  }, [business?.timezone]);

  // Pagination for list view
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  /**
   * Real overlaps per technician.
   *
   * This used to group by `${techName}_${getUTCHours(startAt)}` and flag any bucket
   * with more than one entry, which is neither necessary nor sufficient for a clash:
   * two jobs starting in the same hour but an hour apart were flagged, while a
   * 10:30–12:00 and an 11:00–12:00 were not. It also read `appt.technician`, a field
   * the API does not return — the real ones are `technicianId` / `technicianName` —
   * so in practice everything fell through to 'Unassigned' and nothing was ever
   * flagged at all.
   */
  const conflicts = useMemo(() => {
    const byTech = new Map<string, Appointment[]>();

    appointments.forEach((appt) => {
      if (appt.status === 'cancelled' || appt.status === 'no_show') return;
      const techId = (appt as any).technicianId;
      if (!techId) return; // Nobody is double-booked until somebody is assigned.
      const key = typeof techId === 'string' ? techId : techId?._id || String(techId);
      byTech.set(key, [...(byTech.get(key) ?? []), appt]);
    });

    const list: { tech: string; from: string; count: number; appts: Appointment[] }[] = [];

    byTech.forEach((jobs) => {
      const sorted = [...jobs].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      );

      for (let i = 0; i < sorted.length - 1; i += 1) {
        const current = sorted[i];
        const next = sorted[i + 1];
        // Half-open, matching the backend: touching at a boundary is not a clash.
        if (new Date(next.startAt) < new Date(current.endAt)) {
          list.push({
            tech: (current as any).technicianName || 'Assigned technician',
            from: formatTimeInZone(next.startAt, timezone),
            count: 2,
            appts: [current, next],
          });
        }
      }
    });

    return list;
  }, [appointments, timezone]);

  /**
   * The days a range view is showing. Empty for the day, list and map views.
   *
   * A month grid is padded to whole weeks, so it asks for up to 42 days — which is why
   * the server's range cap is 62 and not 31.
   */
  const rangeDays = useMemo(() => {
    if (viewMode === 'week') return weekOf(selectedDate);
    if (viewMode === 'month') return monthGridOf(selectedDate);
    return [];
  }, [viewMode, selectedDate]);

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      /**
       * Range views use the calendar endpoint, which had existed since the beginning
       * and never had a caller. It is unpaginated on purpose: a grid cannot place a
       * job it was not sent, and "page 2 of Tuesday" is not a thing.
       */
      if (isRangeView) {
        if (rangeDays.length === 0) return;
        const found = await AppointmentService.getCalendar(
          rangeDays[0],
          rangeDays[rangeDays.length - 1]
        );

        /**
         * Search and status are filtered client-side here.
         *
         * The calendar endpoint takes neither, and a grid holding at most a month of
         * one contractor's jobs is small enough that adding two query parameters to a
         * shared endpoint is the more expensive change. The day and list views still
         * filter server-side, where paging makes it necessary.
         */
        const needle = search.trim().toLowerCase();
        setAppointments(
          found.filter((appt) => {
            if (statusFilter !== 'all' && appt.status !== statusFilter) return false;
            if (!needle) return true;
            const cust = appt.customerId as any;
            const haystack = [
              appt.title,
              typeof appt.address === 'string' ? appt.address : '',
              cust?.firstName,
              cust?.lastName,
              cust?.phone,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(needle);
          })
        );
        setTotal(found.length);
        setTotalPages(1);
        return;
      }

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
  }, [viewMode, isRangeView, rangeDays, selectedDate, search, statusFilter, page]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  /**
   * Jobs grouped by the local date they start on, for the week and month grids.
   *
   * Keyed with `zonedDateKey` in the business's timezone, so a 23:00 job lands in the
   * cell a dispatcher would look for it in rather than on the following day.
   */
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach((appt) => {
      const key = zonedDateKey(appt.startAt, timezone);
      map.set(key, [...(map.get(key) ?? []), appt]);
    });
    map.forEach((list) =>
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    );
    return map;
  }, [appointments, timezone]);

  /**
   * Date navigation on the key itself.
   *
   * `new Date('2026-09-21')` parses as UTC midnight; `setDate` then shifts it and
   * `toISOString()` re-reads it in UTC. For a viewer behind Greenwich the round trip
   * lost a day, so the arrows could stick or skip.
   *
   * The step follows the view: a week view pages by weeks and a month view by months,
   * because an arrow that moves one day in a month grid moves nothing visible.
   */
  const changeDateByDays = (days: number) => {
    setSelectedDate((current) => {
      if (viewMode === 'week') return shiftDateKey(current, days * 7);
      if (viewMode === 'month') return shiftMonthKey(current, days);
      return shiftDateKey(current, days);
    });
  };

  const setToday = () => {
    setSelectedDate(zonedDateKey(new Date(), timezone));
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

  /**
   * Times in the business's timezone, not the viewer's.
   *
   * This was `toLocaleTimeString()` with no `timeZone`, so an owner checking the board
   * from another state saw every job shifted by the difference — while the grid rows
   * beside them were labelled in UTC. Two wrong answers on one screen.
   */
  const formatTime = (isoString: string) => formatTimeInZone(isoString, timezone);

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
    // The day and range views hold everything they were sent, so their own length is
    // the count. The list view is paged, so its total comes from the server.
    const totalCount = viewMode === 'list' ? total : appointments.length;
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

  /**
   * Grid rows from the business's published hours for the day being viewed.
   *
   * Was `Array.from({ length: 11 }, (_, i) => i + 8)` — a fixed 8–18 in UTC. A shop
   * open until 21:00 had three hours of its own schedule with nowhere to render, and a
   * shop that opens at 07:00 had no row to click.
   *
   * Widened to cover any job already on the board that falls outside those hours, so an
   * out-of-hours emergency callout is visible rather than silently dropped — which is
   * what the fixed range did to anything before 08:00 or after 18:00 UTC.
   */
  const calendarHours = useMemo(() => {
    const weekday = weekdayForDateKey(selectedDate);
    const dayHours = business?.businessHours?.find(
      (h) => h.day.toLowerCase() === weekday.toLowerCase()
    );

    let first = 8;
    let last = 18;

    if (dayHours?.isOpen) {
      first = Math.floor(parseTimeOfDay(dayHours.openTime, 8 * 60) / 60);
      // The row containing closing time, so a 17:30 close still shows a 17:00 row.
      last = Math.ceil(parseTimeOfDay(dayHours.closeTime, 18 * 60) / 60);
    }

    for (const appt of appointments) {
      const start = zonedParts(appt.startAt, timezone);
      const end = zonedParts(appt.endAt, timezone);
      if (start) first = Math.min(first, start.hour);
      // A job ending exactly on the hour does not need that hour's row.
      if (end) last = Math.max(last, end.minute > 0 ? end.hour + 1 : end.hour);
    }

    first = Math.max(0, Math.min(first, 23));
    last = Math.max(first + 1, Math.min(last, 24));

    return Array.from({ length: last - first }, (_, i) => i + first);
  }, [business?.businessHours, selectedDate, appointments, timezone]);

  const zoneLabel = zoneAbbreviation(timezone);

  /**
   * Drag-and-drop reschedule.
   *
   * Routed through `rescheduleAppointment`, never `updateAppointment`. That matters:
   * the reschedule path is the one that holds the per-business booking lock and runs the
   * opening-hours check, the booking horizon and the per-technician conflict check, and
   * writes a `rescheduleHistory` entry. Writing `startAt` directly would move the job and
   * skip all of it — including the double-booking guard.
   *
   * Optimistic, with rollback. A 409 is the *expected* outcome here, not an edge case: a
   * drop onto a closed Sunday or onto the assigned technician's own job is refused, and
   * the message says which. So the card moves immediately, and on failure it moves back
   * and the server's own reason is shown rather than a generic error.
   */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const idOf = (appt: Appointment): string => appt._id || (appt as any).id;

  const moveAppointment = useCallback(
    async (apptId: string, target: Date) => {
      const previous = appointments;
      const current = appointments.find((a) => idOf(a) === apptId);
      if (!current) return;

      // Nothing to do, and a no-op reschedule would still write a history entry.
      if (new Date(current.startAt).getTime() === target.getTime()) return;

      const durationMs = new Date(current.endAt).getTime() - new Date(current.startAt).getTime();

      setMoveError(null);
      setMovingId(apptId);
      setAppointments((list) =>
        list.map((a) =>
          idOf(a) === apptId
            ? {
                ...a,
                startAt: target.toISOString(),
                endAt: new Date(target.getTime() + durationMs).toISOString(),
              }
            : a
        )
      );

      try {
        const saved = await AppointmentService.rescheduleAppointment(
          apptId,
          target.toISOString(),
          'Moved on the dispatch calendar'
        );
        // The server owns the result — it may have adjusted status to 'rescheduled'.
        setAppointments((list) => list.map((a) => (idOf(a) === apptId ? saved : a)));
      } catch (err: any) {
        setAppointments(previous);
        setMoveError(err?.message || 'That move was refused. The appointment has not been changed.');
      } finally {
        setMovingId(null);
      }
    },
    [appointments]
  );

  /** A drop onto an hour row in the day view: same date, new hour, minutes zeroed. */
  const dropOnHour = (hour: number) => {
    if (!dragId) return;
    const target = instantForCell(selectedDate, hour * 60, timezone);
    if (target) void moveAppointment(dragId, target);
    setDragId(null);
    setDropTarget(null);
  };

  /**
   * A drop onto a day cell in the week or month view: new date, **same time of day**.
   *
   * Preserving the time is the useful behaviour — moving Tuesday's 9am job to Thursday
   * means Thursday at 9am, not Thursday at midnight. Read in the business timezone, so
   * the time the dispatcher sees on the card is the time it keeps.
   */
  const dropOnDay = (dayKey: string) => {
    if (!dragId) return;
    const current = appointments.find((a) => idOf(a) === dragId);
    const minutes = current ? (zonedParts(current.startAt, timezone)?.minutesOfDay ?? 0) : 0;
    const target = instantForCell(dayKey, minutes, timezone);
    if (target) void moveAppointment(dragId, target);
    setDragId(null);
    setDropTarget(null);
  };

  /** Shared props for anything draggable. */
  const dragProps = (appt: Appointment) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragId(idOf(appt));
      // Required for Firefox to start a drag at all.
      e.dataTransfer.setData('text/plain', idOf(appt));
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnd: () => {
      setDragId(null);
      setDropTarget(null);
    },
  });

  /** Shared props for a drop zone. `preventDefault` on dragOver is what permits a drop. */
  const dropProps = (key: string, onDrop: () => void) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropTarget !== key) setDropTarget(key);
    },
    onDragLeave: () => {
      if (dropTarget === key) setDropTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onDrop();
    },
  });

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
                Day
              </button>
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'week'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5 text-blue-600" />
                Week
              </button>
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'month'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
                Month
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
                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                  Live
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
                    {viewMode === 'calendar'
                      ? 'Bookings Today'
                      : viewMode === 'week'
                        ? 'Bookings This Week'
                        : viewMode === 'month'
                          ? 'Bookings This Month'
                          : 'Total Bookings'}
                  </span>
                </div>
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[9px] font-bold px-1.5 py-0">
                  {viewMode === 'calendar'
                    ? 'Selected Date'
                    : isRangeView
                      ? 'Selected Range'
                      : 'All-time'}
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

        {/*
          A refused move.

          The server's own reason, verbatim — "Dana Reyes is already booked for that
          time", "That start time is before you open on Sunday". A generic "failed to
          update" would leave the dispatcher with no idea what to try instead, and these
          refusals are the normal case rather than an error condition.
        */}
        {moveError && (
          <div
            role="status"
            className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-3 text-amber-900 shadow-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1 text-xs font-medium leading-relaxed">
              <span className="font-bold">Move refused. </span>
              {moveError}
            </div>
            <button
              type="button"
              onClick={() => setMoveError(null)}
              className="text-[11px] font-bold text-amber-700 hover:text-amber-900 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

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
                  {conflicts.length} {conflicts.length === 1 ? 'Overlap' : 'Overlaps'}
                </Badge>
              </div>
              <p className="text-xs text-rose-700 leading-relaxed">
                {/* The overlapping job's own start time, in the business's timezone. */}
                {conflicts
                  .map((c) => `${c.tech} has a job starting at ${c.from} before the previous one ends`)
                  .join(' • ')}
                . Adjust arrival windows or reassign a technician to prevent contractor scheduling delays.
              </p>
            </div>
          </div>
        )}

        {/* Filters & Date Control Bar */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Calendar Date Navigator */}
          {viewMode === 'calendar' || isRangeView ? (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => changeDateByDays(-1)}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
                title={`Previous ${viewMode === 'month' ? 'month' : viewMode === 'week' ? 'week' : 'day'}`}
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
                title={`Next ${viewMode === 'month' ? 'month' : viewMode === 'week' ? 'week' : 'day'}`}
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
                  {/* The range being shown, not just the date that anchors it. */}
                  {viewMode === 'month'
                    ? monthLabel(selectedDate)
                    : viewMode === 'week' && rangeDays.length === 7
                      ? `${formatDateDisplay(rangeDays[0])} — ${formatDateDisplay(rangeDays[6])}`
                      : formatDateDisplay(selectedDate)}
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
                  {/*
                    The zone, stated once. Every time on this board is now in the
                    business's timezone, and a board full of unlabelled times is how a
                    dispatcher and a technician end up an hour apart.
                  */}
                  {zoneLabel ? (
                    <span className="text-[11px] font-semibold text-slate-500">
                      all times {zoneLabel}
                    </span>
                  ) : null}
                </h2>
                <p className="text-xs text-slate-500">
                  Drag a booking onto another hour to reschedule it. Opening hours, the
                  booking horizon and the assigned technician&apos;s own diary are all
                  re-checked, so a refused move tells you why.
                </p>
              </div>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-bold px-2.5 py-0.5">
                {appointments.length} Booking{appointments.length === 1 ? '' : 's'}
              </Badge>
            </div>

            <div className="space-y-2.5">
              {calendarHours.map((hour) => {
                const hourFormatted = `${String(hour).padStart(2, '0')}:00`;
                const displayHour = hourLabel(hour);

                /**
                 * Jobs that start in this hour, read in the business's timezone.
                 *
                 * `getUTCHours()` put a 10:00 Chicago job in the 15:00 row while the
                 * card inside it said 10:00. Start-hour matching is kept deliberately:
                 * a job appears once, in the row it begins, rather than being repeated
                 * down every hour it spans.
                 */
                const matchingApts = appointments.filter(
                  (apt) => zonedParts(apt.startAt, timezone)?.hour === hour
                );

                const dropKey = `hour-${hour}`;

                return (
                  <div
                    key={hour}
                    {...dropProps(dropKey, () => dropOnHour(hour))}
                    className={`grid grid-cols-12 gap-3 py-1.5 border-b items-start min-h-[58px] rounded-lg transition-colors ${
                      dropTarget === dropKey
                        ? 'border-blue-300 bg-blue-50/60'
                        : 'border-slate-100'
                    }`}
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
                              {...dragProps(apt)}
                              className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs cursor-grab active:cursor-grabbing ${
                                movingId === id
                                  ? 'bg-blue-50/70 border-blue-200 opacity-70'
                                  : dragId === id
                                    ? 'bg-slate-50 border-blue-300 opacity-50'
                                    : 'bg-slate-50/70 hover:bg-slate-50 border-slate-200/90 hover:border-slate-300'
                              }`}
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
        ) : viewMode === 'week' ? (
          /* ================= WEEK VIEW ================= */
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CalendarRange className="w-4 h-4 text-blue-600" />
                  Week of {formatDateDisplay(rangeDays[0] ?? selectedDate)}
                  {zoneLabel ? (
                    <span className="text-[11px] font-semibold text-slate-500">
                      all times {zoneLabel}
                    </span>
                  ) : null}
                </h2>
                <p className="text-xs text-slate-500">
                  Seven days at a glance. Click a day for its hourly timeline, or drag a
                  booking onto another day &mdash; it keeps its time.
                </p>
              </div>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-bold px-2.5 py-0.5">
                {appointments.length} Booking{appointments.length === 1 ? '' : 's'}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-7 gap-2.5">
              {rangeDays.map((dayKey) => {
                const jobs = byDay.get(dayKey) ?? [];
                const isToday = dayKey === zonedDateKey(new Date(), timezone);

                /**
                 * Closed days are shown greyed rather than hidden. A dispatcher looking
                 * for Sunday needs to see that Sunday exists and the business is shut,
                 * not find a six-column week.
                 */
                const dayHours = business?.businessHours?.find(
                  (h) => h.day.toLowerCase() === weekdayForDateKey(dayKey).toLowerCase()
                );
                const closed = dayHours ? !dayHours.isOpen : false;

                const dropKey = `week-${dayKey}`;

                return (
                  <div
                    key={dayKey}
                    {...dropProps(dropKey, () => dropOnDay(dayKey))}
                    className={`rounded-xl border p-2.5 space-y-2 min-h-[140px] transition-colors ${
                      dropTarget === dropKey
                        ? 'border-blue-400 bg-blue-50/70'
                        : isToday
                          ? 'border-blue-300 bg-blue-50/40'
                          : closed
                            ? 'border-slate-200 bg-slate-50/80'
                            : 'border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(dayKey);
                        setViewMode('calendar');
                      }}
                      className="w-full text-left group"
                    >
                      <span
                        className={`text-xs font-black tracking-tight ${
                          isToday ? 'text-blue-700' : 'text-slate-800'
                        } group-hover:text-blue-600`}
                      >
                        {shortDayLabel(dayKey)}
                      </span>
                      {closed ? (
                        <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Closed
                        </span>
                      ) : (
                        <span className="block text-[10px] text-slate-500 font-medium">
                          {jobs.length} job{jobs.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </button>

                    <div className="space-y-1.5">
                      {jobs.map((apt) => {
                        const cust = apt.customerId as any;
                        const id = apt._id || (apt as any).id;
                        const statusConf = STATUS_CONFIG[apt.status] || STATUS_CONFIG.scheduled;

                        return (
                          <Link
                            key={id}
                            href={`/app/appointments/${id}`}
                            {...dragProps(apt)}
                            className={`block rounded-lg border px-2 py-1.5 transition-colors cursor-grab active:cursor-grabbing ${
                              movingId === id
                                ? 'border-blue-200 bg-blue-50/70 opacity-70'
                                : dragId === id
                                  ? 'border-blue-300 bg-white opacity-50'
                                  : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusConf.dot}`} />
                              <span className="text-[11px] font-bold text-slate-900 tabular-nums">
                                {formatTime(apt.startAt)}
                              </span>
                            </div>
                            <span className="block text-[11px] text-slate-600 font-medium truncate">
                              {cust?.firstName} {cust?.lastName}
                            </span>
                            {(apt as any).technicianName ? (
                              <span className="block text-[10px] text-slate-400 truncate">
                                {(apt as any).technicianName}
                              </span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'month' ? (
          /* ================= MONTH VIEW ================= */
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-blue-600" />
                  {monthLabel(selectedDate)}
                  {zoneLabel ? (
                    <span className="text-[11px] font-semibold text-slate-500">
                      all times {zoneLabel}
                    </span>
                  ) : null}
                </h2>
                <p className="text-xs text-slate-500">
                  Workload by day. Click a day for its hourly timeline, or drag a booking
                  onto another day &mdash; it keeps its time.
                </p>
              </div>
              <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-bold px-2.5 py-0.5">
                {appointments.length} Booking{appointments.length === 1 ? '' : 's'}
              </Badge>
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                <div
                  key={label}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center pb-1"
                >
                  {label}
                </div>
              ))}

              {rangeDays.map((dayKey) => {
                const jobs = byDay.get(dayKey) ?? [];
                const isToday = dayKey === zonedDateKey(new Date(), timezone);
                // Padding days from the neighbouring months are dimmed, not blank: the
                // grid stays rectangular and a job on the 1st is still reachable.
                const inMonth = monthOf(dayKey) === monthOf(selectedDate);

                const dropKey = `month-${dayKey}`;

                return (
                  <button
                    key={dayKey}
                    type="button"
                    {...dropProps(dropKey, () => dropOnDay(dayKey))}
                    onClick={() => {
                      setSelectedDate(dayKey);
                      setViewMode('calendar');
                    }}
                    className={`text-left rounded-lg border p-1.5 min-h-[78px] transition-colors ${
                      dropTarget === dropKey
                        ? 'border-blue-400 bg-blue-50/70'
                        : isToday
                          ? 'border-blue-300 bg-blue-50/50'
                          : inMonth
                            ? 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                            : 'border-slate-100 bg-slate-50/60 hover:border-slate-200'
                    }`}
                  >
                    <span
                      className={`text-[11px] font-black tabular-nums ${
                        isToday
                          ? 'text-blue-700'
                          : inMonth
                            ? 'text-slate-800'
                            : 'text-slate-400'
                      }`}
                    >
                      {Number(dayKey.slice(8))}
                    </span>

                    <div className="mt-1 space-y-0.5">
                      {/*
                        Two jobs plus a count, rather than an unbounded stack that makes
                        one busy day taller than the rest of the grid.
                      */}
                      {jobs.slice(0, 2).map((apt) => {
                        const statusConf = STATUS_CONFIG[apt.status] || STATUS_CONFIG.scheduled;
                        const cust = apt.customerId as any;
                        return (
                          <span
                            key={apt._id || (apt as any).id}
                            {...dragProps(apt)}
                            className={`flex items-center gap-1 text-[10px] font-medium truncate cursor-grab active:cursor-grabbing ${
                              dragId === idOf(apt) ? 'text-slate-400' : 'text-slate-600'
                            }`}
                          >
                            <span className={`w-1 h-1 rounded-full shrink-0 ${statusConf.dot}`} />
                            <span className="tabular-nums shrink-0">{formatTime(apt.startAt)}</span>
                            <span className="truncate">{cust?.lastName || cust?.firstName || ''}</span>
                          </span>
                        );
                      })}
                      {jobs.length > 2 ? (
                        <span className="block text-[10px] font-bold text-blue-600">
                          +{jobs.length - 2} more
                        </span>
                      ) : null}
                    </div>
                  </button>
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
          /* ================= DAY 21-23: REAL DISPATCH FLEET MAP & ROUTES ================= */
          <DispatchMapView
            selectedDate={selectedDate}
            onRefreshNeeded={fetchAppointments}
          />
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
