'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { CustomerService } from '@/services/customer.service';
import { LeadService } from '@/services/lead.service';
import { Customer } from '@/types/customer';
import { Lead } from '@/types/lead';
import { CustomerModal } from '@/components/customers/customer-modal';
import { LeadModal } from '@/components/leads/lead-modal';
import { 
  ArrowLeft, 
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  Clock, 
  Calendar, 
  FileText, 
  Edit, 
  Trash2, 
  Loader2, 
  PhoneCall, 
  CalendarCheck, 
  AlertCircle, 
  Wrench, 
  CheckCircle2,
  UserPlus,
  Plus,
  ArrowRight,
  DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);

  const loadData = async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const [cust, leadsRes] = await Promise.all([
        CustomerService.getCustomerById(customerId).catch(() => null),
        LeadService.getLeads({ customerId, limit: 20 }).catch(() => null),
      ]);

      if (cust) {
        setCustomer(cust);
      } else {
        setError('Customer not found');
      }

      if (leadsRes && leadsRes.leads) {
        setLeads(leadsRes.leads);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch customer details');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [customerId]);

  const handleDelete = async () => {
    if (!customer) return;
    const custId = customer.id || customer._id || customerId;
    if (window.confirm(`Are you sure you want to deactivate customer "${customer.firstName} ${customer.lastName}"?`)) {
      try {
        await CustomerService.deleteCustomer(custId);
        router.push('/app/customers');
      } catch (err) {
        console.error('Failed to delete customer:', err);
      }
    }
  };

  if (loading) {
    return (
      <DashboardShell title="Customer Profile">
        <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
          <span className="text-sm">Loading customer profile...</span>
        </div>
      </DashboardShell>
    );
  }

  if (error || !customer) {
    return (
      <DashboardShell title="Customer Not Found">
        <div className="py-16 text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {error || 'Unable to load customer'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            This customer record may have been deleted or you do not have permission to view it.
          </p>
          <Link href="/app/customers">
            <Button size="sm" variant="outline" className="text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to Directory
            </Button>
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const initials = `${customer.firstName?.[0] || ''}${customer.lastName?.[0] || ''}`.toUpperCase() || 'CU';

  return (
    <DashboardShell 
      title={`${customer.firstName} ${customer.lastName}`}
      subtitle="HVAC Client Account"
    >
      <div className="space-y-6">
        {/* Back Link & Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link 
            href="/app/customers" 
            className="inline-flex items-center text-xs text-slate-500 hover:text-slate-900 font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to Customers
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditModalOpen(true)}
              className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Edit className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
              Edit Customer
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="text-xs border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Deactivate
            </Button>
          </div>
        </div>

        {/* Customer Header Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center text-lg font-bold tracking-wider shrink-0 shadow-sm">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {customer.firstName} {customer.lastName}
                </h2>
                <Badge className={`capitalize text-xs font-medium ${
                  customer.status === 'active' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {customer.status}
                </Badge>
                <Badge variant="outline" className="capitalize text-xs font-medium text-slate-600 border-slate-200 bg-slate-50">
                  <Building className="w-3 h-3 mr-1 text-slate-400" />
                  {customer.propertyType || 'residential'}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Client ID: <span className="font-mono text-slate-600">{customer.id || customer._id || customerId}</span> • Member since {new Date(customer.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 text-xs">
            <a
              href={`tel:${customer.phone}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-semibold">{customer.phone}</span>
            </a>
            {customer.email && (
              <a
                href={`mailto:${customer.email}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>{customer.email}</span>
              </a>
            )}
          </div>
        </div>

        {/* Info Grid: Address & Equipment Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Service Location Card */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-500" />
                Service Location
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-xs space-y-3">
              <div>
                <p className="text-slate-500 font-medium">Street Address</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">
                  {customer.address?.street || 'No street specified'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                <div>
                  <p className="text-slate-500">City</p>
                  <p className="font-medium text-slate-900 mt-0.5">{customer.address?.city || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500">State</p>
                  <p className="font-medium text-slate-900 mt-0.5">{customer.address?.state || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Zip Code</p>
                  <p className="font-medium text-slate-900 mt-0.5">{customer.address?.zip || '—'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Equipment & Service Notes */}
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                HVAC System Notes & Specifications
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-xs">
              {customer.notes ? (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {customer.notes}
                </div>
              ) : (
                <div className="py-6 text-center text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-1 text-slate-300" />
                  <p>No equipment notes or service details recorded yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Service Opportunities (Leads) for this Customer */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-slate-500" />
              Service Opportunities & Leads ({leads.length})
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setIsLeadModalOpen(true)}
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Opportunity
            </Button>
          </CardHeader>
          <CardContent className="pt-4 text-xs">
            {leads.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <p>No active service leads recorded for this customer yet.</p>
                <button
                  type="button"
                  onClick={() => setIsLeadModalOpen(true)}
                  className="mt-2 text-sky-600 hover:underline font-medium inline-block"
                >
                  + Create first opportunity
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {leads.map((l) => {
                  const lId = l._id || l.id || '';
                  return (
                    <div
                      key={lId}
                      onClick={() => router.push(`/app/leads/${lId}`)}
                      className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg cursor-pointer transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{l.title}</p>
                          <span className="capitalize text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                            {l.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {l.service || 'HVAC Service'} • Priority: <span className="capitalize">{l.priority}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-900">
                          {l.estimatedValue ? `$${l.estimatedValue}` : '—'}
                        </span>
                        <ArrowRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Future Connected Systems Timeline (Calls, Appointments) */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              Service & Interaction History
            </CardTitle>
            <span className="text-xs text-slate-400 font-mono">0 interactions logged</span>
          </CardHeader>
          <CardContent className="py-12 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <PhoneCall className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-semibold text-slate-900">
              No service visits or calls logged yet
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              When this customer calls your AI phone number (M9) or books an HVAC repair appointment (M8), all call transcripts and work orders will attach here automatically.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Edit Customer Modal */}
      <CustomerModal
        isOpen={isEditModalOpen}
        customer={customer}
        onClose={() => setIsEditModalOpen(false)}
        onSaved={(updated) => setCustomer(updated)}
      />

      {/* Create Lead Modal */}
      <LeadModal
        isOpen={isLeadModalOpen}
        initialCustomerId={customerId}
        onClose={() => setIsLeadModalOpen(false)}
        onSaved={loadData}
      />
    </DashboardShell>
  );
}
