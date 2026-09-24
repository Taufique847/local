'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { EstimateService } from '@/services/estimate.service';
import { CustomerService } from '@/services/customer.service';
import { Estimate, EstimateStatus } from '@/types/estimate';
import { Customer } from '@/types/customer';
import {
  FileCheck2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Plus,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
  Trash2,
  Search,
  Filter,
  Loader2,
  X,
  Clock,
  Sparkles,
  PenTool,
  Send,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Pagination } from '@/components/ui/pagination';
import { toErrorMessage } from '@/lib/api-client';

export default function EstimatesPage() {
  const router = useRouter();
  const toast = useToast();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');

  // Pagination. The list used to load every estimate the business had ever raised.
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Customer List for creation
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [estimateTitle, setEstimateTitle] = useState('HVAC System Replacement & Line Set Repair');
  const [diagCredit, setDiagCredit] = useState(89);
  const [isTiered, setIsTiered] = useState(true);
  const [items, setItems] = useState<{ description: string; quantity: number; unitPrice: number }[]>([
    { description: 'Carrier 3-Ton 16 SEER Condenser & Air Handler Unit', quantity: 1, unitPrice: 2850 },
    { description: 'Professional Installation, Refrigerant Line Flush & Setup', quantity: 1, unitPrice: 650 },
  ]);
  const [creating, setCreating] = useState(false);

  // Conversion state
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // Signature viewer modal
  const [signatureModalEstimate, setSignatureModalEstimate] = useState<Estimate | null>(null);

  // Copy Feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadEstimates = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      setLoadError(null);
      const data = await EstimateService.getEstimates({ status: filterStatus, page, limit: 20 });
      setEstimates(data.estimates);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      // Previously console.error only, so an outage looked like "no estimates".
      setLoadError(toErrorMessage(err, 'Could not load your estimates.'));
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    loadEstimates();

    // Auto-sync when user returns to tab or every 15s
    const handleFocus = () => loadEstimates(true);
    window.addEventListener('focus', handleFocus);
    const interval = setInterval(() => loadEstimates(true), 15000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [filterStatus, page]);

  // Changing the filter must not leave the view on a page that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [filterStatus]);

  useEffect(() => {
    CustomerService.getCustomers({ limit: 50 })
      .then((res) => {
        const list = res.customers || [];
        setCustomers(list);
        if (list.length > 0) {
          setSelectedCustomerId(list[0]._id || list[0].id || '');
        }
      })
      .catch((err) => console.error('Failed to load customers:', err));
  }, []);

  const handleCopyLink = (token: string, id: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/portal/quote/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('E-Sign Link Copied!', 'Customer quote portal URL is ready to share.');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleConvertToInvoice = async (estimateId: string) => {
    try {
      setConvertingId(estimateId);
      const res = await EstimateService.convertToInvoice(estimateId);
      toast.success('Invoice Generated Successfully!', 'Approved estimate has been converted to an active invoice.');
      await loadEstimates();
      router.push('/app/invoices');
    } catch (err: any) {
      toast.error('Conversion Failed', err.message || 'Could not convert estimate to invoice.');
    } finally {
      setConvertingId(null);
    }
  };

  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  // Calculations
  const calcSubtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const calcTax = (calcSubtotal - diagCredit) > 0 ? (calcSubtotal - diagCredit) * 0.0825 : 0;
  const calcTotal = Math.max(0, calcSubtotal - diagCredit + calcTax);

  const handleCreateEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      toast.error('Customer Required', 'Please select a customer for this proposal.');
      return;
    }
    if (items.some((it) => !it.description.trim())) {
      toast.error('Missing Details', 'Please provide a description for all line items.');
      return;
    }

    try {
      setCreating(true);

      const tiersPayload = isTiered
        ? [
            {
              tierId: 'good' as const,
              name: 'Good: Essential Repair',
              badge: 'Economical',
              description: 'Fixes immediate breakdown with standard OEM components and 30-day labor warranty.',
              items,
            },
            {
              tierId: 'better' as const,
              name: 'Better: Repair + 1-Yr Shield',
              badge: 'Most Popular',
              description: 'Full OEM repair plus 1-year annual tune-up protection and priority dispatch.',
              items: [
                ...items,
                { description: 'Annual HVAC Maintenance Protection Plan & Tune-Up', quantity: 1, unitPrice: 189 },
              ],
              isRecommended: true,
            },
            {
              tierId: 'best' as const,
              name: 'Best: High-Efficiency Upgrade',
              badge: 'Max Efficiency',
              description: 'Carrier 16 SEER high-efficiency replacement with 10-year parts and labor warranty.',
              items: [
                { description: 'Carrier 3-Ton 16 SEER Complete System Upgrade', quantity: 1, unitPrice: 3850 },
                { description: 'Complete Installation, Refrigerant Line Flush & Setup', quantity: 1, unitPrice: 750 },
              ],
            },
          ]
        : undefined;

      await EstimateService.createEstimate({
        customerId: selectedCustomerId,
        title: estimateTitle,
        items,
        tiers: tiersPayload,
        diagnosticFeeCredit: diagCredit,
        /**
         * No `taxRate` is sent, so the business's own configured rate applies.
         *
         * This used to post `taxRate: 8.25`, meaning 8.25%, into a field that is a
         * fraction — `0.0825`. The request schema bounds it at 1, so every estimate
         * created from this page was rejected with a validation error. Had it got
         * through, it would have billed 825% tax.
         */
      });
      toast.success('Estimate Created!', isTiered ? '3-Option proposal (Good/Better/Best) generated.' : 'Digital proposal created.');
      setCreateModalOpen(false);
      loadEstimates();
    } catch (err: any) {
      toast.error('Creation Failed', err.message || 'Failed to create estimate.');
    } finally {
      setCreating(false);
    }
  };

  // KPI Calculations
  const totalEstimates = estimates.length;
  const approvedEstimates = estimates.filter((e) => e.status === 'approved' || e.status === 'converted');
  const pendingEstimates = estimates.filter((e) => e.status === 'sent' || e.status === 'viewed');
  const convertedEstimates = estimates.filter((e) => e.status === 'converted');
  const pipelineValue = estimates.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  return (
    <DashboardShell>
      <div className="space-y-8 pb-16">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                Back-Office Sales
              </span>
              <span className="text-xs text-muted-foreground">E-Sign & Quotes</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground mt-1">
              Digital Estimates & Proposals
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create professional trade quotes with $89 diagnostic fee credit deduction and mobile touch E-Signature.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setCreateModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-all"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Estimate
            </Button>
          </div>
        </div>

        {/* 4 Financial / Proposal KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Pipeline
              </span>
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
                <FileText className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black tracking-tight text-foreground">
                ${pipelineValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <p className="text-xs text-muted-foreground mt-1">Across {totalEstimates} active estimates</p>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Awaiting Signature
              </span>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black tracking-tight text-foreground">
                {pendingEstimates.length}
              </span>
              <p className="text-xs text-muted-foreground mt-1">Customers reviewing in portal</p>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                E-Signed & Approved
              </span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                <FileCheck2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black tracking-tight text-emerald-600">
                {approvedEstimates.length}
              </span>
              <p className="text-xs text-muted-foreground mt-1">Ready for work & invoicing</p>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Converted to Invoices
              </span>
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-black tracking-tight text-purple-600">
                {convertedEstimates.length}
              </span>
              <p className="text-xs text-muted-foreground mt-1">Seamless 1-click billing</p>
            </div>
          </div>
        </div>

        {/* Estimates Table Section */}
        <div className="bg-card border border-border/80 rounded-xl shadow-xs overflow-hidden">
          {/* Filters Bar */}
          <div className="p-4 border-b border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-1.5">
                {['all', 'draft', 'sent', 'approved', 'converted'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                      filterStatus === status
                        ? 'bg-foreground text-background shadow-xs font-semibold'
                        : 'bg-background hover:bg-muted text-muted-foreground border border-border/60'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>
                {total > 0 ? `${total} proposal${total === 1 ? '' : 's'}` : 'No proposals yet'}
              </span>
            </div>
          </div>

          {loadError && (
            <div
              role="alert"
              className="mx-4 mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{loadError}</span>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-sm">Loading estimates and proposals...</p>
            </div>
          ) : estimates.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-semibold text-foreground">No estimates found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first estimate to send a touch e-signature quote to your customer.
              </p>
              <Button
                onClick={() => setCreateModalOpen(true)}
                size="sm"
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Create Estimate
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <caption className="sr-only">Estimates and proposals</caption>
                <thead>
                  <tr className="border-b border-border/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/10">
                    <th scope="col" className="py-3 px-4">Estimate #</th>
                    <th scope="col" className="py-3 px-4">Customer</th>
                    <th scope="col" className="py-3 px-4">Title / Scope</th>
                    <th scope="col" className="py-3 px-4">Diag. Credit</th>
                    <th scope="col" className="py-3 px-4">Total</th>
                    <th scope="col" className="py-3 px-4">Status</th>
                    <th scope="col" className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-sm">
                  {estimates.map((est) => {
                    const custName = est.customerId?.name || 'Customer';
                    const custPhone = est.customerId?.phone || '';
                    const hasDiagCredit = (est.diagnosticFeeCredit || 0) > 0;

                    return (
                      <tr key={est._id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-foreground">
                          {est.estimateNumber}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-foreground">{custName}</div>
                          <div className="text-xs text-muted-foreground">{custPhone}</div>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs truncate">
                          <span className="text-foreground font-medium">{est.title}</span>
                          <div className="text-xs text-muted-foreground">
                            {est.items?.length || 0} line item{est.items?.length !== 1 ? 's' : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {hasDiagCredit ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <Sparkles className="w-3 h-3" />
                              -${est.diagnosticFeeCredit}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-foreground">
                          ${(est.totalAmount || 0).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                              est.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : est.status === 'converted'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : est.status === 'viewed'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : est.status === 'sent'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}
                          >
                            {est.status === 'approved' && <FileCheck2 className="w-3 h-3" />}
                            {est.status === 'converted' && <CheckCircle2 className="w-3 h-3" />}
                            {est.status === 'viewed' && <Eye className="w-3 h-3" />}
                            {est.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Copy Public E-Sign Link */}
                            <button
                              onClick={() => handleCopyLink(est.shareToken, est._id)}
                              title="Copy Customer E-Sign Portal Link"
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/40"
                            >
                              {copiedId === est._id ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>

                            {/* View E-Sign Portal */}
                            <Link
                              href={`/portal/quote/${est.shareToken}`}
                              target="_blank"
                              title="Open Customer Portal"
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/40"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Link>

                            {/* View Signature if approved */}
                            {est.signature?.signatureDataUrl && (
                              <button
                                onClick={() => setSignatureModalEstimate(est)}
                                title="View Customer E-Signature"
                                className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 transition-colors border border-emerald-200"
                              >
                                <PenTool className="w-4 h-4" />
                              </button>
                            )}

                            {/* 1-Click Convert to Invoice if Approved & not yet converted */}
                            {est.status === 'approved' && (
                              <Button
                                size="sm"
                                onClick={() => handleConvertToInvoice(est._id)}
                                disabled={convertingId === est._id}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-2.5"
                              >
                                {convertingId === est._id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>
                                    Convert to Invoice
                                    <ArrowRight className="w-3 h-3 ml-1" />
                                  </>
                                )}
                              </Button>
                            )}

                            {est.status === 'converted' && (
                              <Link href="/app/invoices">
                                <span className="text-xs font-semibold text-purple-600 hover:underline inline-flex items-center">
                                  View Invoice &rarr;
                                </span>
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && estimates.length > 0 && (
            <div className="px-4 pb-4">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={20}
                itemLabel="estimates"
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Signature Preview Modal */}
      {signatureModalEstimate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PenTool className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-foreground">Customer E-Signature</h3>
              </div>
              <button
                onClick={() => setSignatureModalEstimate(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-2">Digital Signature Capture</p>
              <img
                src={signatureModalEstimate.signature?.signatureDataUrl}
                alt="Signature"
                className="max-h-32 mx-auto object-contain bg-white rounded border border-slate-200"
              />
            </div>

            <div className="text-xs space-y-1.5 text-muted-foreground">
              <div className="flex justify-between">
                <span>Signed By:</span>
                <strong className="text-foreground">{signatureModalEstimate.signature?.signedByName}</strong>
              </div>
              <div className="flex justify-between">
                <span>Date & Time:</span>
                <span className="text-foreground">
                  {signatureModalEstimate.signature?.signedAt
                    ? new Date(signatureModalEstimate.signature.signedAt).toLocaleString()
                    : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>IP Address:</span>
                <span className="text-foreground">{signatureModalEstimate.signature?.ipAddress || '127.0.0.1'}</span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSignatureModalEstimate(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Estimate Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-border/60">
              <div>
                <h2 className="text-xl font-bold text-foreground">Create New Estimate</h2>
                <p className="text-xs text-muted-foreground">
                  Propose scope of work with instant E-Sign and diagnostic fee credit deduction.
                </p>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEstimate} className="mt-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider block mb-1.5">
                    Customer
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background text-foreground"
                    required
                  >
                    <option value="">Select a customer...</option>
                    {customers.map((c) => {
                      const cid = c._id || c.id;
                      const cname = c.fullName || `${c.firstName} ${c.lastName}`.trim() || 'Customer';
                      return (
                        <option key={cid} value={cid}>
                          {cname} ({c.phone})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider block mb-1.5">
                    Proposal Title
                  </label>
                  <Input
                    value={estimateTitle}
                    onChange={(e) => setEstimateTitle(e.target.value)}
                    placeholder="e.g. 3-Ton AC Replacement"
                    required
                  />
                </div>
              </div>

              {/* Good / Better / Best Multi-Option Toggle */}
              <div className="p-3.5 bg-blue-50/80 border border-blue-200/90 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Good / Better / Best Multi-Option Proposal
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Packages Basic Repair, 1-Year Shield Plan, and Full Replacement options together to maximize customer close rates.
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isTiered}
                    onChange={(e) => setIsTiered(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Line Items Builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {isTiered ? 'Base Service Scope (Used for Tier 1: Good)' : 'Line Items'}
                  </label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Line Item
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        className="flex-1 text-sm"
                        placeholder="Item description / parts / labor"
                        value={item.description}
                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                        required
                      />
                      <Input
                        type="number"
                        min="1"
                        className="w-16 text-sm"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                        required
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2.5 top-2 text-xs text-muted-foreground">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="pl-6 text-sm"
                          placeholder="Rate"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))}
                          required
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        disabled={items.length <= 1}
                        className="text-muted-foreground hover:text-rose-600 p-1.5 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Diagnostic Credit & Summary */}
              <div className="bg-muted/30 border border-border/60 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="text-xs font-semibold text-foreground">Diagnostic Fee Credit</span>
                      <p className="text-[11px] text-muted-foreground">
                        Waive standard $89 evaluation fee if customer accepts repair
                      </p>
                    </div>
                  </div>
                  <div className="relative w-24">
                    <span className="absolute left-2.5 top-2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0"
                      className="pl-6 text-sm"
                      value={diagCredit}
                      onChange={(e) => setDiagCredit(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-border/40 space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal:</span>
                    <span>${calcSubtotal.toFixed(2)}</span>
                  </div>
                  {diagCredit > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>Diagnostic Fee Credit Applied:</span>
                      <span>-${diagCredit.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Est. Tax (8.25%):</span>
                    <span>${calcTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-foreground pt-1 border-t border-border/40">
                    <span>Total Estimate:</span>
                    <span>${calcTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Create & Generate E-Sign Link
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
