'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  DispatchService,
  type MapDataResponse,
  type DailyRouteResponse,
} from '@/services/operations.service';
import { AppointmentService } from '@/services/appointment.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Navigation,
  Send,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Car,
  Home,
  Phone,
  ExternalLink,
  Loader2,
  Calendar,
  Layers,
  Check,
} from 'lucide-react';

interface DispatchMapViewProps {
  selectedDate: string; // YYYY-MM-DD
  onRefreshNeeded?: () => void;
}

export function DispatchMapView({ selectedDate, onRefreshNeeded }: DispatchMapViewProps) {
  const [loading, setLoading] = useState(true);
  const [mapData, setMapData] = useState<MapDataResponse | null>(null);
  const [selectedTechId, setSelectedTechId] = useState<string>('all');
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [newTechId, setNewTechId] = useState<string>('');

  // Day 23: Route Inspector & Dispatch
  const [activeTab, setActiveTab] = useState<'map' | 'routes'>('map');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeData, setRouteData] = useState<DailyRouteResponse['route'] | null>(null);
  const [sendingRoute, setSendingRoute] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);

  const fetchMapData = async () => {
    setLoading(true);
    try {
      const data = await DispatchService.getMapData(selectedDate);
      setMapData(data);
      if (selectedAppt) {
        const refreshed = data.appointments.find((a) => a._id === selectedAppt._id);
        setSelectedAppt(refreshed || null);
      }
    } catch (err) {
      console.error('Failed to load dispatch map data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMapData();
  }, [selectedDate]);

  // Load technician route when technician is selected in routes tab
  const fetchRoute = async (techId: string) => {
    if (!techId || techId === 'all') {
      setRouteData(null);
      return;
    }
    setRouteLoading(true);
    setSendSuccessMsg(null);
    try {
      const res = await DispatchService.getDailyRoute(techId, selectedDate);
      setRouteData(res.route);
    } catch (err) {
      console.error('Failed to load technician route', err);
      setRouteData(null);
    } finally {
      setRouteLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'routes' && selectedTechId && selectedTechId !== 'all') {
      fetchRoute(selectedTechId);
    }
  }, [activeTab, selectedTechId, selectedDate]);

  const handleSendRoute = async () => {
    if (!selectedTechId || selectedTechId === 'all') return;
    setSendingRoute(true);
    setSendSuccessMsg(null);
    try {
      const res = await DispatchService.sendDailyRoute(selectedTechId, selectedDate);
      setSendSuccessMsg(`Route SMS successfully dispatched to ${res.technicianName} (${res.dispatchedToPhone})`);
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch route');
    } finally {
      setSendingRoute(false);
    }
  };

  const handleReassign = async () => {
    if (!selectedAppt) return;
    setReassigning(true);
    try {
      await AppointmentService.updateAppointment(selectedAppt._id, {
        technicianId: newTechId || null,
      });
      await fetchMapData();
      if (onRefreshNeeded) onRefreshNeeded();
    } catch (err: any) {
      alert(err.message || 'Failed to reassign technician');
    } finally {
      setReassigning(false);
    }
  };

  // Filter appointments for the map display
  const displayedAppointments = useMemo(() => {
    if (!mapData) return [];
    if (selectedTechId === 'all') return mapData.appointments;
    return mapData.appointments.filter(
      (a) => a.technicianId?._id === selectedTechId || (a.technicianId as any) === selectedTechId
    );
  }, [mapData, selectedTechId]);

  // Compute map bounds to fit all markers dynamically
  const mapBounds = useMemo(() => {
    const points: Array<{ lat: number; lng: number }> = [];
    displayedAppointments.forEach((a) => {
      if (a.coordinates?.lat && a.coordinates?.lng) {
        points.push(a.coordinates);
      }
    });

    if (mapData?.technicians) {
      mapData.technicians.forEach((t) => {
        if (t.homeBase?.coordinates?.lat && t.homeBase?.coordinates?.lng) {
          points.push(t.homeBase.coordinates);
        }
      });
    }

    if (points.length === 0) {
      return { minLat: 32.7, maxLat: 33.1, minLng: -97.0, maxLng: -96.6 };
    }

    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const padding = 0.05;
    return {
      minLat: Math.min(...lats) - padding,
      maxLat: Math.max(...lats) + padding,
      minLng: Math.min(...lngs) - padding,
      maxLng: Math.max(...lngs) + padding,
    };
  }, [displayedAppointments, mapData]);

  // Convert lat/lng to percentage coordinates on SVG map
  const projectPoint = (lat: number, lng: number) => {
    const { minLat, maxLat, minLng, maxLng } = mapBounds;
    const latSpan = maxLat - minLat || 0.1;
    const lngSpan = maxLng - minLng || 0.1;

    // Invert Y because SVG coordinates go top-down
    const yPercent = 100 - ((lat - minLat) / latSpan) * 100;
    const xPercent = ((lng - minLng) / lngSpan) * 100;

    return {
      x: Math.max(5, Math.min(95, xPercent)),
      y: Math.max(5, Math.min(95, yPercent)),
    };
  };

  const statusColors: Record<string, { bg: string; border: string; text: string }> = {
    scheduled: { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-blue-700' },
    in_progress: { bg: 'bg-amber-500', border: 'border-amber-600', text: 'text-amber-700' },
    completed: { bg: 'bg-emerald-500', border: 'border-emerald-600', text: 'text-emerald-700' },
    en_route: { bg: 'bg-indigo-500', border: 'border-indigo-600', text: 'text-indigo-700' },
    confirmed: { bg: 'bg-cyan-500', border: 'border-cyan-600', text: 'text-cyan-700' },
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'map'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              Live Fleet Map
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('routes');
                if (selectedTechId === 'all' && mapData?.technicians?.[0]) {
                  setSelectedTechId(mapData.technicians[0]._id);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'routes'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              Route Optimization &amp; Dispatch
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="tech-filter" className="text-xs font-semibold text-slate-600">
              Tech:
            </label>
            <select
              id="tech-filter"
              value={selectedTechId}
              onChange={(e) => setSelectedTechId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All Technicians ({mapData?.technicians?.length || 0})</option>
              {mapData?.technicians?.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} ({t.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mapData?.stats && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-100">
                {mapData.stats.geocodedAppointments}/{mapData.stats.totalAppointments} Geocoded
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold border border-slate-200">
                {mapData.stats.unassignedAppointments} Unassigned
              </span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={fetchMapData}
            disabled={loading}
            className="h-8 px-2.5 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
            title="Refresh map coordinates"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl py-24 flex flex-col items-center justify-center gap-3 text-slate-500 shadow-xs">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-xs font-semibold">Calculating coordinates and route positions...</p>
        </div>
      ) : activeTab === 'map' ? (
        /* ================= DAY 22: LIVE FLEET MAP VIEW ================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Map Canvas */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm relative min-h-[520px] overflow-hidden flex flex-col">
            {/* Map Header / Watermark */}
            <div className="absolute top-4 left-4 z-10 bg-slate-950/80 backdrop-blur-md border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Real Geocoded Dispatch Layer &bull; {selectedDate}</span>
            </div>

            {/* Map Grid Pattern */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 1px 1px, #94a3b8 1px, transparent 0)',
                backgroundSize: '28px 28px',
              }}
            />

            {/* SVG Visual Map Surface */}
            <div className="relative flex-1 w-full h-full min-h-[460px]">
              {/* Route Lines between stops if technician selected */}
              {selectedTechId !== 'all' && displayedAppointments.length > 1 && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                  <polyline
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                    strokeDasharray="6 4"
                    opacity="0.8"
                    points={displayedAppointments
                      .filter((a) => a.coordinates?.lat && a.coordinates?.lng)
                      .map((a) => {
                        const pt = projectPoint(a.coordinates!.lat, a.coordinates!.lng);
                        return `${pt.x}%,${pt.y}%`;
                      })
                      .join(' ')}
                  />
                </svg>
              )}

              {/* Technician Home Base Depot Pins */}
              {mapData?.technicians.map((tech) => {
                if (!tech.homeBase?.coordinates?.lat) return null;
                const pt = projectPoint(tech.homeBase.coordinates.lat, tech.homeBase.coordinates.lng);
                return (
                  <div
                    key={`tech-base-${tech._id}`}
                    style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 group"
                  >
                    <div className="w-7 h-7 rounded-full bg-indigo-600 border-2 border-white shadow-md flex items-center justify-center text-white cursor-pointer hover:scale-110 transition-transform">
                      <Home className="w-3.5 h-3.5" />
                    </div>
                    <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 bottom-8 bg-slate-950 text-white text-[11px] font-semibold px-2 py-1 rounded-md shadow-lg whitespace-nowrap z-30">
                      Depot: {tech.name} ({tech.homeBase.address})
                    </div>
                  </div>
                );
              })}

              {/* Appointment Job Pins */}
              {displayedAppointments.map((appt, idx) => {
                if (!appt.coordinates?.lat || !appt.coordinates?.lng) return null;
                const pt = projectPoint(appt.coordinates.lat, appt.coordinates.lng);
                const conf = statusColors[appt.status] || statusColors.scheduled;
                const isSelected = selectedAppt?._id === appt._id;

                return (
                  <div
                    key={appt._id}
                    style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 group cursor-pointer"
                    onClick={() => {
                      setSelectedAppt(appt);
                      setNewTechId(appt.technicianId?._id || '');
                    }}
                  >
                    <div
                      className={`relative flex items-center justify-center rounded-full text-white font-black text-[11px] shadow-lg transition-transform ${
                        isSelected
                          ? 'w-8 h-8 ring-4 ring-white bg-blue-600 scale-125'
                          : `w-6 h-6 border-2 border-white ${conf.bg} hover:scale-110`
                      }`}
                    >
                      {idx + 1}
                    </div>

                    <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 bottom-8 bg-slate-950/95 text-white text-[11px] p-2 rounded-lg shadow-xl whitespace-nowrap z-30 space-y-0.5 border border-slate-700">
                      <p className="font-bold">{appt.customerId ? `${appt.customerId.firstName} ${appt.customerId.lastName}` : 'Job'}</p>
                      <p className="text-[10px] text-slate-300">{appt.address}</p>
                      <p className="text-[10px] text-blue-400">
                        Tech: {appt.technicianId?.name || appt.technicianName || 'Unassigned'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Map Legend */}
            <div className="mt-auto pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Scheduled
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> In Progress
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Completed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Technician Depot
                </span>
              </div>
              <span>Click any marker to inspect or assign technician</span>
            </div>
          </div>

          {/* Job Inspector / Assignment Drawer */}
          <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
            {selectedAppt ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {selectedAppt.priority} priority
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 mt-1">
                      {selectedAppt.title}
                    </h3>
                  </div>
                  <Badge variant="outline" className="text-xs font-semibold capitalize">
                    {selectedAppt.status.replace('_', ' ')}
                  </Badge>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-slate-700">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">
                        {selectedAppt.customerId
                          ? `${selectedAppt.customerId.firstName} ${selectedAppt.customerId.lastName}`
                          : 'Customer'}
                      </p>
                      {selectedAppt.customerId?.phone && (
                        <p className="text-slate-500">{selectedAppt.customerId.phone}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2 text-slate-700">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-800">{selectedAppt.address}</p>
                      {selectedAppt.coordinates ? (
                        <p className="text-[10px] text-emerald-600 font-bold">
                          &bull; Lat {selectedAppt.coordinates.lat.toFixed(4)}, Lng{' '}
                          {selectedAppt.coordinates.lng.toFixed(4)}
                        </p>
                      ) : (
                        <p className="text-[10px] text-amber-600">Coordinates pending geocode</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-700">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {new Date(selectedAppt.startAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      &bull; {selectedDate}
                    </span>
                  </div>
                </div>

                {/* Assignment Controls */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Assigned Technician
                  </label>
                  <select
                    value={newTechId}
                    onChange={(e) => setNewTechId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Unassigned</option>
                    {mapData?.technicians.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name} ({t.status})
                      </option>
                    ))}
                  </select>

                  <Button
                    size="sm"
                    onClick={handleReassign}
                    disabled={reassigning || newTechId === (selectedAppt.technicianId?._id || '')}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold h-9"
                  >
                    {reassigning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Update Assignment
                  </Button>
                </div>

                {/* External Maps Turn-by-Turn */}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    selectedAppt.address
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl py-2 w-full text-center hover:bg-slate-50 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  Open in Google Maps
                </a>
              </div>
            ) : (
              <div className="py-20 text-center space-y-2 text-slate-400 my-auto">
                <MapPin className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">No appointment selected</p>
                <p className="text-[11px] text-slate-400 max-w-[200px] mx-auto">
                  Click any pin on the dispatch map to view full address details and reassign.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================= DAY 23: ROUTE OPTIMIZATION & DISPATCH ================= */
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Car className="w-4 h-4 text-blue-600" />
                Daily Route Itinerary &amp; Mileage Calculator &bull; {selectedDate}
              </h3>
              <p className="text-xs text-slate-500">
                Calculates honest driving distances and drive times from technician home base across consecutive stops.
              </p>
            </div>

            {selectedTechId && selectedTechId !== 'all' && (
              <Button
                onClick={handleSendRoute}
                disabled={sendingRoute || !routeData || routeData.orderedStops.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold h-9 shadow-xs px-4"
              >
                {sendingRoute ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                )}
                Send Route to Tech (SMS)
              </Button>
            )}
          </div>

          {sendSuccessMsg && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              {sendSuccessMsg}
            </div>
          )}

          {routeLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
              <p className="text-xs font-semibold">Computing road distances and drive times...</p>
            </div>
          ) : !routeData || routeData.orderedStops.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-slate-400">
              <Car className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-700">No scheduled appointments for this technician</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Select a technician with scheduled appointments for {selectedDate} to generate their daily route.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Route Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Total Stops</span>
                  <p className="text-lg font-black text-slate-900 mt-0.5">
                    {routeData.orderedStops.length}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Total Mileage</span>
                  <p className="text-lg font-black text-slate-900 mt-0.5">
                    {routeData.totalDistanceMiles} mi
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Drive Time</span>
                  <p className="text-lg font-black text-slate-900 mt-0.5">
                    ~{Math.round((routeData.totalDriveTimeMinutes / 60) * 10) / 10} hrs
                  </p>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase">
                    Chained Efficiency
                  </span>
                  <p className="text-lg font-black text-emerald-900 mt-0.5">
                    {routeData.efficiencyPercent}% Saved
                  </p>
                  <p className="text-[10px] text-emerald-700 mt-0.5">
                    {routeData.savedMiles} mi saved vs naive
                  </p>
                </div>
              </div>

              {/* Stops Itinerary Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Ordered Itinerary Stops
                </h4>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {/* Starting Depot */}
                  <div className="p-3 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center text-[10px]">
                        0
                      </span>
                      <span>Departure: {routeData.homeBase.address}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">Route Start</span>
                  </div>

                  {/* Stops */}
                  {routeData.orderedStops.map((stop) => (
                    <div
                      key={stop.id}
                      className="p-3.5 bg-white hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-xs shrink-0 mt-0.5">
                          {stop.stopNumber}
                        </span>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900">{stop.customerName}</span>
                            <span className="text-slate-400">&bull;</span>
                            <span className="text-slate-600">{stop.title}</span>
                          </div>
                          <p className="text-slate-500 mt-0.5">{stop.address}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 sm:shrink-0 text-slate-600">
                        <span className="font-semibold">
                          {new Date(stop.startAt).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        <div className="bg-slate-100 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-700">
                          {stop.legFromPrevious.distanceMiles} mi &bull; ~
                          {stop.legFromPrevious.durationMinutes} min
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Return Leg */}
                  <div className="p-3 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center text-[10px]">
                        {routeData.orderedStops.length + 1}
                      </span>
                      <span>Return: {routeData.homeBase.address}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">End of Day</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
