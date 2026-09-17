'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { LeadService } from '@/services/lead.service';
import { Lead, LeadQuery, LeadStatus, LeadPriority } from '@/types/lead';
import { LeadModal } from '@/components/leads/lead-modal';
import { 
  UserPlus, 
  Search, 
  Plus, 
  Phone, 
  Calendar, 
  DollarSign, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Edit, 
  Archive, 
  Loader2, 
  Tag, 
  Filter, 
  Columns3, 
  List, 
  ArrowRight,
  Sparkles,
  Building,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(15);
  const [loading, setLoading] = useState(true);

  // View switch: 'list' | 'pipeline'
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Auto-open modal if ?action=new is present
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setSelectedLead(null);
      setIsModalOpen(true);
    }
  }, [searchParams]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const query: LeadQuery = {
        page: currentPage,
        limit: viewMode === 'pipeline' ? 100 : limit, // Fetch more in pipeline view to populate columns
      };

      if (searchTerm.trim()) query.search = searchTerm.trim();
      if (statusFilter !== 'all') query.status = statusFilter;
      if (priorityFilter !== 'all') query.priority = priorityFilter;

      const res = await LeadService.getLeads(query);
      if (res && res.leads) {
        setLeads(res.leads);
        setTotalCount(res.total);
        setTotalPages(res.totalPages);
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, limit, searchTerm, statusFilter, priorityFilter, viewMode]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleCreateLead = () => {
    setSelectedLead(null);
    setIsModalOpen(true);
  };

  const handleEditLead = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLead(lead);
    setIsModalOpen(true);
  };

  const handleLeadSaved = () => {
    fetchLeads();
  };

  const handleStatusChange = async (lead: Lead, newStatus: LeadStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    const leadId = lead._id || lead.id || '';
    try {
      await LeadService.updateLeadStatus(leadId, newStatus);
      fetchLeads();
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  const handleArchiveLead = async (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    const leadId = lead._id || lead.id || '';
    if (window.confirm(`Archive lead "${lead.title}"?`)) {
      try {
        await LeadService.archiveLead(leadId);
        fetchLeads();
      } catch (err) {
        console.error('Failed to archive lead:', err);
      }
    }
  };

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-[11px] font-medium capitalize">New</Badge>;
      case 'contacted':
        return <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[11px] font-medium capitalize">Contacted</Badge>;
      case 'qualified':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[11px] font-medium capitalize">Qualified</Badge>;
      case 'quoted':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[11px] font-medium capitalize">Quoted</Badge>;
      case 'won':
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-medium capitalize">Won</Badge>;
      case 'lost':
        return <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[11px] font-medium capitalize">Lost</Badge>;
      case 'archived':
        return <Badge variant="outline" className="text-slate-500 border-slate-200 bg-slate-50 text-[11px] font-medium capitalize">Archived</Badge>;
      default:
        return null;
    }
  };

  const getPriorityBadge = (priority: LeadPriority) => {
    switch (priority) {
      case 'urgent':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider">Urgent</span>;
      case 'high':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">High</span>;
      case 'medium':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">Medium</span>;
      case 'low':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">Low</span>;
      default:
        return null;
    }
  };

  // Pipeline stages
  const pipelineStages: { status: LeadStatus; label: string; color: string }[] = [
    { status: 'new', label: 'New Inquiry', color: 'border-t-sky-500' },
    { status: 'contacted', label: 'Contacted', color: 'border-t-indigo-500' },
    { status: 'qualified', label: 'Qualified', color: 'border-t-blue-500' },
    { status: 'quoted', label: 'Quote Sent', color: 'border-t-amber-500' },
    { status: 'won', label: 'Won / Booked', color: 'border-t-emerald-500' },
    { status: 'lost', label: 'Lost', color: 'border-t-slate-400' },
  ];

  return (
    <DashboardShell
      title="Leads & Opportunities"
      subtitle="HVAC Service Inquiries & Sales Pipeline"
    >
      <div className="space-y-6">
        {/* Top Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Lead Management
            </h2>
            <p className="text-xs text-slate-500">
              Track customer service requests, qualify jobs, and monitor pipeline conversion.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            {/* View Switch */}
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('pipeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'pipeline'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Columns3 className="w-3.5 h-3.5" />
                <span>Pipeline</span>
              </button>
            </div>

            <Button
              onClick={handleCreateLead}
              size="sm"
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Opportunity
            </Button>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <Input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search leads by title, service, customer name, phone, or notes..."
                className="pl-9 text-xs h-9 bg-slate-50/50 border-slate-200 focus:bg-white"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {viewMode === 'list' && (
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="quoted">Quoted</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                  <option value="archived">Archived</option>
                </select>
              )}

              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dynamic View Container */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-2 bg-white rounded-xl border border-slate-200">
            <Loader2 className="w-7 h-7 animate-spin text-slate-600" />
            <span className="text-xs">Loading opportunities...</span>
          </div>
        ) : leads.length === 0 ? (
          /* Empty State */
          <div className="bg-white border border-slate-200 rounded-xl py-16 text-center px-4 shadow-sm">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
              <UserPlus className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              No leads found
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchTerm || statusFilter !== 'all' || priorityFilter !== 'all'
                ? 'No opportunities match your search filters. Try clearing your search.'
                : 'New service opportunities will appear here as your HVAC business receives requests.'}
            </p>
            <div className="mt-4">
              <Button
                onClick={handleCreateLead}
                size="sm"
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Opportunity
              </Button>
            </div>
          </div>
        ) : viewMode === 'list' ? (
          /* TABLE VIEW */
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Opportunity</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Est. Value</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {leads.map((lead) => {
                    const leadId = lead._id || lead.id || '';
                    const customerName = lead.customerId
                      ? `${lead.customerId.firstName} ${lead.customerId.lastName}`
                      : 'Unknown Customer';

                    return (
                      <tr
                        key={leadId}
                        onClick={() => router.push(`/app/leads/${leadId}`)}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                      >
                        {/* Title & Issue */}
                        <td className="py-3.5 px-4 font-medium text-slate-900">
                          <div>
                            <p className="font-semibold text-slate-900 group-hover:text-sky-600 transition-colors">
                              {lead.title}
                            </p>
                            {lead.description && (
                              <p className="text-[11px] text-slate-400 font-normal line-clamp-1 max-w-xs">
                                {lead.description}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="py-3.5 px-4">
                          {lead.customerId ? (
                            <div className="space-y-0.5">
                              <Link
                                href={`/app/customers/${lead.customerId._id || lead.customerId.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-medium text-slate-800 hover:text-sky-600 hover:underline"
                              >
                                {customerName}
                              </Link>
                              <div className="text-[11px] text-slate-400">
                                {lead.customerId.phone}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No customer</span>
                          )}
                        </td>

                        {/* Service */}
                        <td className="py-3.5 px-4 text-slate-700">
                          {lead.service ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                              {lead.service}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {getStatusBadge(lead.status)}
                        </td>

                        {/* Priority */}
                        <td className="py-3.5 px-4">
                          {getPriorityBadge(lead.priority)}
                        </td>

                        {/* Estimated Value */}
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          {lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : '—'}
                        </td>

                        {/* Date */}
                        <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                          {new Date(lead.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/app/leads/${leadId}`)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleEditLead(lead, e)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              title="Edit Opportunity"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleArchiveLead(lead, e)}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              title="Archive Opportunity"
                            >
                              <Archive className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Pagination */}
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
              <div>
                Showing <span className="font-semibold text-slate-800">{(currentPage - 1) * limit + 1}</span> to{' '}
                <span className="font-semibold text-slate-800">
                  {Math.min(currentPage * limit, totalCount)}
                </span>{' '}
                of <span className="font-semibold text-slate-800">{totalCount}</span> opportunities
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="h-8 px-2.5 text-xs border-slate-200 text-slate-600 hover:bg-white"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  Previous
                </Button>
                <div className="px-2 font-medium text-slate-700">
                  Page {currentPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="h-8 px-2.5 text-xs border-slate-200 text-slate-600 hover:bg-white"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* PIPELINE KANBAN VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start overflow-x-auto pb-4">
            {pipelineStages.map((stage) => {
              const stageLeads = leads.filter((l) => l.status === stage.status);
              const stageTotalValue = stageLeads.reduce((acc, l) => acc + (l.estimatedValue || 0), 0);

              return (
                <div 
                  key={stage.status}
                  className="bg-slate-100/70 border border-slate-200 rounded-xl p-3 flex flex-col min-w-[240px] max-h-[75vh]"
                >
                  {/* Column Header */}
                  <div className={`border-t-3 ${stage.color} pt-2 mb-3 flex items-center justify-between`}>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs tracking-tight">
                        {stage.label}
                      </h4>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {stageLeads.length} leads {stageTotalValue > 0 && `• $${stageTotalValue.toLocaleString()}`}
                      </span>
                    </div>
                    <span className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[11px] font-bold text-slate-700 shadow-2xs">
                      {stageLeads.length}
                    </span>
                  </div>

                  {/* Cards container */}
                  <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
                    {stageLeads.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-[11px] border border-dashed border-slate-200 rounded-lg bg-white/50">
                        No leads in this stage
                      </div>
                    ) : (
                      stageLeads.map((lead) => {
                        const leadId = lead._id || lead.id || '';
                        const customerName = lead.customerId
                          ? `${lead.customerId.firstName} ${lead.customerId.lastName}`
                          : 'Unknown Customer';

                        return (
                          <div
                            key={leadId}
                            onClick={() => router.push(`/app/leads/${leadId}`)}
                            className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs hover:shadow-sm hover:border-slate-300 transition-all cursor-pointer space-y-2 group"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <h5 className="font-semibold text-slate-900 text-xs leading-snug group-hover:text-sky-600 transition-colors">
                                {lead.title}
                              </h5>
                              {getPriorityBadge(lead.priority)}
                            </div>

                            <div className="text-[11px] text-slate-500">
                              <span className="font-medium text-slate-700">{customerName}</span>
                              {lead.service && (
                                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                  {lead.service}
                                </p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-900">
                                {lead.estimatedValue ? `$${lead.estimatedValue}` : '—'}
                              </span>

                              {/* Quick Move Status Selector */}
                              <select
                                value={lead.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => handleStatusChange(lead, e.target.value as LeadStatus, e as any)}
                                className="text-[10px] h-6 px-1.5 rounded border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:bg-white"
                              >
                                <option value="new">New</option>
                                <option value="contacted">Contacted</option>
                                <option value="qualified">Qualified</option>
                                <option value="quoted">Quoted</option>
                                <option value="won">Won</option>
                                <option value="lost">Lost</option>
                                <option value="archived">Archived</option>
                              </select>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <LeadModal
        isOpen={isModalOpen}
        lead={selectedLead}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleLeadSaved}
      />
    </DashboardShell>
  );
}
