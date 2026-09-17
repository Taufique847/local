'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { LeadService } from '@/services/lead.service';
import { Lead, LeadStatus, LeadPriority } from '@/types/lead';
import { LeadModal } from '@/components/leads/lead-modal';
import { 
  ArrowLeft, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  Tag, 
  Clock, 
  Calendar, 
  DollarSign, 
  FileText, 
  Edit, 
  Archive, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Briefcase, 
  PhoneCall, 
  ExternalLink 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    async function loadLead() {
      if (!leadId) return;
      setLoading(true);
      try {
        const data = await LeadService.getLeadById(leadId);
        if (data) {
          setLead(data);
        } else {
          setError('Opportunity not found');
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to fetch opportunity');
        }
      } finally {
        setLoading(false);
      }
    }

    loadLead();
  }, [leadId]);

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!lead) return;
    const lId = lead._id || lead.id || leadId;
    try {
      const updated = await LeadService.updateLeadStatus(lId, newStatus);
      setLead(updated);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleArchive = async () => {
    if (!lead) return;
    const lId = lead._id || lead.id || leadId;
    if (window.confirm(`Are you sure you want to archive lead "${lead.title}"?`)) {
      try {
        await LeadService.archiveLead(lId);
        router.push('/app/leads');
      } catch (err) {
        console.error('Failed to archive lead:', err);
      }
    }
  };

  if (loading) {
    return (
      <DashboardShell title="Opportunity Details">
        <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
          <span className="text-sm">Loading lead details...</span>
        </div>
      </DashboardShell>
    );
  }

  if (error || !lead) {
    return (
      <DashboardShell title="Opportunity Not Found">
        <div className="py-16 text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {error || 'Unable to load opportunity'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            This lead record may have been archived or deleted.
          </p>
          <Link href="/app/leads">
            <Button size="sm" variant="outline" className="text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to Leads
            </Button>
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const customer = lead.customerId;
  const customerId = customer?._id || customer?.id || '';

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-sky-50 text-sky-700 border-sky-200 text-xs font-medium capitalize">New Inquiry</Badge>;
      case 'contacted':
        return <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs font-medium capitalize">Contacted</Badge>;
      case 'qualified':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium capitalize">Qualified</Badge>;
      case 'quoted':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-medium capitalize">Quoted</Badge>;
      case 'won':
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium capitalize">Won / Closed</Badge>;
      case 'lost':
        return <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs font-medium capitalize">Lost</Badge>;
      case 'archived':
        return <Badge variant="outline" className="text-slate-500 border-slate-200 bg-slate-50 text-xs font-medium capitalize">Archived</Badge>;
      default:
        return null;
    }
  };

  const getPriorityBadge = (priority: LeadPriority) => {
    switch (priority) {
      case 'urgent':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider">Urgent</span>;
      case 'high':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">High Priority</span>;
      case 'medium':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">Medium Priority</span>;
      case 'low':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">Low Priority</span>;
      default:
        return null;
    }
  };

  return (
    <DashboardShell
      title={lead.title}
      subtitle="HVAC Service Opportunity"
    >
      <div className="space-y-6">
        {/* Back Link & Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/app/leads"
            className="inline-flex items-center text-xs text-slate-500 hover:text-slate-900 font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to Leads Pipeline
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(true)}
              className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Edit className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
              Edit Lead
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchive}
              className="text-xs border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50"
            >
              <Archive className="w-3.5 h-3.5 mr-1.5" />
              Archive
            </Button>
          </div>
        </div>

        {/* Lead Hero Overview Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              {getStatusBadge(lead.status)}
              {getPriorityBadge(lead.priority)}
              <span className="text-xs text-slate-400">
                Source: <span className="capitalize font-medium text-slate-600">{lead.source}</span>
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {lead.title}
            </h2>
            <p className="text-xs text-slate-500">
              Created {new Date(lead.createdAt).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })} • Lead ID: <span className="font-mono text-slate-600">{lead._id || lead.id}</span>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
                Estimated Value
              </span>
              <span className="text-2xl font-bold text-slate-900">
                {lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : 'Unquoted'}
              </span>
            </div>

            {/* Quick Status Stage Transition Dropdown */}
            <div className="sm:pl-3">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1 tracking-wider">
                Change Stage
              </span>
              <select
                value={lead.status}
                onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:bg-white"
              >
                <option value="new">New Inquiry</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="quoted">Quoted</option>
                <option value="won">Won / Closed</option>
                <option value="lost">Lost</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* Two Column Grid: Customer Info & Opportunity Specs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Customer Profile Card */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-500" />
                Customer Contact Details
              </CardTitle>
              {customerId && (
                <Link
                  href={`/app/customers/${customerId}`}
                  className="text-xs text-sky-600 hover:text-sky-700 font-medium inline-flex items-center gap-1"
                >
                  View Profile
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </CardHeader>
            <CardContent className="pt-4 text-xs space-y-4">
              {customer ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm">
                      {customer.firstName?.[0]}{customer.lastName?.[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {customer.firstName} {customer.lastName}
                      </h4>
                      <span className="text-[11px] text-slate-400 capitalize">
                        {customer.propertyType || 'Residential'} Account
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    <a
                      href={`tel:${customer.phone}`}
                      className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold">{customer.phone}</span>
                    </a>

                    {customer.email ? (
                      <a
                        href={`mailto:${customer.email}`}
                        className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors truncate"
                      >
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-slate-300" />
                        <span>No email provided</span>
                      </div>
                    )}
                  </div>

                  {customer.address?.street && (
                    <div className="flex items-start gap-2 pt-2 text-slate-600 border-t border-slate-100">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span>
                        {customer.address.street}, {customer.address.city}, {customer.address.state} {customer.address.zip}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-slate-400 py-4 text-center">
                  Customer record not found.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Service Request & Specs */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-slate-500" />
                Service Request Specifications
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-xs space-y-3">
              <div>
                <span className="text-slate-400 font-medium">Service Requested</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">
                  {lead.service || 'General HVAC Service'}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 font-medium">Problem / Service Context</span>
                <p className="text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {lead.description || 'No specific issue details provided.'}
                </p>
              </div>

              {lead.notes && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Internal Notes & Technicians Reminders
                  </span>
                  <p className="text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap bg-amber-50/50 p-3 rounded-lg border border-amber-100/70">
                    {lead.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity & Conversion Roadmap Card */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              Opportunity Activity Timeline
            </CardTitle>
            <span className="text-xs text-slate-400 font-mono">0 events recorded</span>
          </CardHeader>
          <CardContent className="py-12 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Calendar className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-semibold text-slate-900">
              No scheduled visits or service dispatch events yet
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              When this opportunity converts to an appointment in M8 or receives an inbound AI follow-up call, the scheduled booking timeline will anchor here.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Edit Modal */}
      <LeadModal
        isOpen={isEditModalOpen}
        lead={lead}
        onClose={() => setIsEditModalOpen(false)}
        onSaved={(updated) => setLead(updated)}
      />
    </DashboardShell>
  );
}
