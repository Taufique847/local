'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ServiceService } from '@/services/service.service';
import { ServiceModal } from '@/components/services/service-modal';
import { Service, ServiceStats, ServiceCategory, ServiceStatus } from '@/types/service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Wrench,
  Plus,
  Search,
  Loader2,
  Clock,
  DollarSign,
  Zap,
  Tag,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Archive,
  ChevronLeft,
  ChevronRight,
  Filter,
  BarChart3,
  AlertCircle,
} from 'lucide-react';

const CATEGORIES: ServiceCategory[] = [
  'Cooling', 'Heating', 'Maintenance', 'Installation',
  'Indoor Air Quality', 'Ductwork', 'Emergency', 'Other',
];

const CATEGORY_COLORS: Record<string, string> = {
  Cooling: 'bg-blue-50 text-blue-700 border-blue-200',
  Heating: 'bg-orange-50 text-orange-700 border-orange-200',
  Maintenance: 'bg-teal-50 text-teal-700 border-teal-200',
  Installation: 'bg-purple-50 text-purple-700 border-purple-200',
  'Indoor Air Quality': 'bg-green-50 text-green-700 border-green-200',
  Ductwork: 'bg-slate-100 text-slate-700 border-slate-300',
  Emergency: 'bg-red-50 text-red-700 border-red-200',
  Other: 'bg-gray-50 text-gray-700 border-gray-200',
};

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [stats, setStats] = useState<ServiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ServiceCategory | 'all'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  // Status toggle loading state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ServiceService.getServices({
        page,
        limit: 15,
        search: search || undefined,
        status: statusFilter,
        category: categoryFilter,
      });
      setServices(res.services || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Failed to load services:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, categoryFilter]);

  const loadStats = useCallback(async () => {
    try {
      const s = await ServiceService.getServiceStats();
      setStats(s);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadServices();
    loadStats();
  }, [loadServices, loadStats]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleStatusToggle = async (svc: Service) => {
    const id = svc._id || svc.id;
    if (!id) return;
    setTogglingId(id);
    try {
      const newStatus: ServiceStatus = svc.status === 'active' ? 'inactive' : 'active';
      await ServiceService.updateServiceStatus(id, newStatus);
      await loadServices();
      await loadStats();
    } catch (err) {
      console.error('Failed to toggle status:', err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleArchive = async (svc: Service) => {
    const id = svc._id || svc.id;
    if (!id) return;
    if (!confirm(`Archive "${svc.name}"? This will deactivate the service.`)) return;
    try {
      await ServiceService.archiveService(id);
      await loadServices();
      await loadStats();
    } catch (err) {
      console.error('Failed to archive service:', err);
    }
  };

  const handleEdit = (svc: Service) => {
    setEditingService(svc);
    setModalOpen(true);
  };

  const handleSaved = () => {
    loadServices();
    loadStats();
    setEditingService(null);
  };

  const openAddModal = () => {
    setEditingService(null);
    setModalOpen(true);
  };

  return (
    <DashboardShell title="Services Management" subtitle="HVAC Service Catalog & Pricing">
      <div className="space-y-6">
        {/* Stats KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total</span>
                <div className="w-7 h-7 rounded-md bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Wrench className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1.5">
                {stats?.total ?? '...'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">services configured</p>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Active</span>
                <div className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ToggleRight className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-700 mt-1.5">
                {stats?.active ?? '...'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">currently offered</p>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Inactive</span>
                <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center">
                  <ToggleLeft className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-500 mt-1.5">
                {stats?.inactive ?? '...'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">paused services</p>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Emergency</span>
                <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-2xl font-bold text-amber-600 mt-1.5">
                {stats?.emergencyServices ?? '...'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">24/7 priority</p>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar: Search + Filters + Add Button */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search services by name or description..."
                className="pl-9 text-sm h-9"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as ServiceStatus | 'all'); setPage(1); }}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value as ServiceCategory | 'all'); setPage(1); }}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Add Service Button */}
            <Button
              onClick={openAddModal}
              size="sm"
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-sm whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Service
            </Button>
          </div>
        </div>

        {/* Services Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-500">Loading services...</span>
            </div>
          ) : services.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
                <Wrench className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-semibold text-slate-900">
                {search || statusFilter !== 'all' || categoryFilter !== 'all'
                  ? 'No services match your filters'
                  : 'No services configured yet'
                }
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                {search || statusFilter !== 'all' || categoryFilter !== 'all'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Add your first HVAC service offering to get started.'
                }
              </p>
              {!search && statusFilter === 'all' && categoryFilter === 'all' && (
                <Button
                  onClick={openAddModal}
                  size="sm"
                  className="mt-4 bg-slate-900 hover:bg-slate-800 text-white text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add First Service
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Service</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Category</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Duration</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Price</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</span>
              </div>

              {/* Table Rows */}
              {services.map((svc) => {
                const svcId = svc._id || svc.id || '';
                const catColors = CATEGORY_COLORS[svc.category] || CATEGORY_COLORS.Other;
                const isToggling = togglingId === svcId;

                return (
                  <div
                    key={svcId}
                    className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] gap-2 md:gap-3 px-5 py-4 border-b border-slate-100 hover:bg-slate-50/50 transition-colors items-center"
                  >
                    {/* Service Name + Description */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900 truncate">{svc.name}</p>
                          {svc.isEmergencyService && (
                            <span title="Emergency Service"><Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" /></span>
                          )}
                        </div>
                        {svc.description && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[280px] mt-0.5">{svc.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Category Badge */}
                    <div className="flex items-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${catColors}`}>
                        {svc.category}
                      </span>
                    </div>

                    {/* Duration */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {svc.durationMinutes} min
                    </div>

                    {/* Price */}
                    <div className="flex items-center text-xs">
                      {svc.startingPrice !== undefined && svc.startingPrice !== null ? (
                        <span className="font-semibold text-slate-900">
                          ${svc.startingPrice.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>

                    {/* Status Toggle */}
                    <div className="flex items-center">
                      <button
                        onClick={() => handleStatusToggle(svc)}
                        disabled={isToggling}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all cursor-pointer ${
                          svc.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {isToggling ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : svc.status === 'active' ? (
                          <ToggleRight className="w-3.5 h-3.5" />
                        ) : (
                          <ToggleLeft className="w-3.5 h-3.5" />
                        )}
                        {svc.status === 'active' ? 'Active' : 'Inactive'}
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleEdit(svc)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                        title="Edit Service"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleArchive(svc)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Archive Service"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Pagination Footer */}
              <div className="px-5 py-3 flex items-center justify-between border-t border-slate-100 bg-slate-50/30">
                <span className="text-xs text-slate-500">
                  Showing {services.length} of {total} service{total !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-600 font-medium min-w-[80px] text-center">
                    Page {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Service Modal */}
      <ServiceModal
        isOpen={modalOpen}
        service={editingService}
        onClose={() => { setModalOpen(false); setEditingService(null); }}
        onSaved={handleSaved}
      />
    </DashboardShell>
  );
}
