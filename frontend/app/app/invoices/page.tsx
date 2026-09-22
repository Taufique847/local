'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { InvoiceService } from '@/services/invoice.service';
import { CustomerService } from '@/services/customer.service';
import { Invoice, InvoiceStats } from '@/types/invoice';
import { Customer } from '@/types/customer';
import {
  DollarSign,
  FileText,
  CheckCircle2,
  AlertCircle,
  Plus,
  ExternalLink,
  Copy,
  Check,
  CreditCard,
  Printer,
  Trash2,
  Search,
  Filter,
  Loader2,
  X,
  Clock,
  Sparkles,
  ArrowUpRight,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Pagination } from '@/components/ui/pagination';
import { toErrorMessage } from '@/lib/api-client';

export default function InvoicesPage() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');

  // Pagination. The list previously loaded every invoice ever raised.
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Customer List for creation
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Create Invoice Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [invoiceTitle, setInvoiceTitle] = useState('HVAC Service & Diagnostic Work Order');
  const [diagCredit, setDiagCredit] = useState(89);
  const [items, setItems] = useState<{ description: string; quantity: number; unitPrice: number }[]>([
    { description: 'Standard Diagnostic Trip & System Evaluation', quantity: 1, unitPrice: 89 },
    { description: 'Refrigerant Leak Repair & R-410A Recharge', quantity: 1, unitPrice: 220 },
  ]);
  const [creating, setCreating] = useState(false);

  // Manual Payment Modal
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'check' | 'card'>('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [recordingPay, setRecordingPay] = useState(false);

  // Copy Feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setLoadError(null);
    try {
      const [invResult, statData, custList] = await Promise.all([
        InvoiceService.getInvoices({ status: filterStatus, page, limit: 20 }),
        InvoiceService.getInvoiceStats(),
        CustomerService.getCustomers({ limit: 50 }).catch(() => ({ customers: [] })),
      ]);
      setInvoices(invResult.invoices);
      setTotalPages(invResult.totalPages);
      setTotal(invResult.total);
      setStats(statData);
      setCustomers(custList.customers || []);
      if (custList.customers?.[0]) {
        setSelectedCustomerId(custList.customers[0]._id || custList.customers[0].id || '');
      }
    } catch (err) {
      // Previously console.error only, so a failed load was indistinguishable
      // from having no invoices.
      setLoadError(toErrorMessage(err, 'Could not load your invoices.'));
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Auto-sync when tab gains focus or every 15s
    const handleFocus = () => loadData(true);
    window.addEventListener('focus', handleFocus);
    const interval = setInterval(() => loadData(true), 15000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [filterStatus, page]);

  // A filter change must not leave the view on a page that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [filterStatus]);

  const handleCopyLink = (token: string, id: string) => {
    const link = `${window.location.origin}/portal/invoice/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    toast.success('Payment Link Copied!', 'Customer checkout URL is ready to share via SMS or email.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddItem = () => {
    setItems([...items, { description: '', quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, val: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = val;
    setItems(updated);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || items.length === 0) {
      toast.error('Customer Required', 'Please select a customer for this invoice.');
      return;
    }

    setCreating(true);
    try {
      await InvoiceService.createInvoice({
        customerId: selectedCustomerId,
        title: invoiceTitle,
        items,
        diagnosticFeeCredit: diagCredit,
      });
      toast.success('Invoice Created!', 'Payment portal link generated successfully.');
      setCreateModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error('Creation Failed', err.message || 'Failed to create invoice.');
    } finally {
      setCreating(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInvoice) return;

    setRecordingPay(true);
    try {
      await InvoiceService.recordManualPayment(paymentModalInvoice._id, {
        paymentMethod,
        paymentReference: paymentRef || `MANUAL_${paymentMethod.toUpperCase()}_${Date.now()}`,
        amount: paymentModalInvoice.balanceDue,
      });
      toast.success('Payment Recorded!', `Recorded ${paymentMethod.toUpperCase()} payment of $${paymentModalInvoice.balanceDue.toFixed(2)}.`);
      setPaymentModalInvoice(null);
      loadData();
    } catch (err: any) {
      toast.error('Payment Error', err.message || 'Failed to record payment.');
    } finally {
      setRecordingPay(false);
    }
  };

  return (
    <DashboardShell
      title="Invoices & Customer Payments"
      subtitle="Digital billing, diagnostic fee deductions, and real-time online collections"
    >
      <div className="space-y-6">
        
        {/* Top Action & KPI Cards */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Customer Billing &amp; Invoices
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Track collected revenue, outstanding balances, and customer online payments
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/worker"
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs h-10 px-4 rounded-xl transition-colors"
            >
              Field Worker PWA &rarr;
            </Link>
            <Button
              onClick={() => setCreateModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 px-4 rounded-xl shadow-xs gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Invoice
            </Button>
          </div>
        </div>

        {/* 4 Financial KPI Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Revenue Billed
              </span>
              <p className="text-xl font-black text-slate-900 font-mono">
                ${stats.totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-500 font-medium">All completed work orders</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">
                Total Collected
              </span>
              <p className="text-xl font-black text-emerald-600 font-mono">
                ${stats.totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-emerald-700 font-medium">{stats.paidCount} Paid Invoices</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">
                Outstanding Balance
              </span>
              <p className="text-xl font-black text-rose-600 font-mono">
                ${stats.outstandingDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-rose-700 font-medium">{stats.unpaidCount} Awaiting Payment</span>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">
                Collection Ratio
              </span>
              <p className="text-xl font-black text-blue-600 font-mono">
                {stats.totalBilled > 0
                  ? `${((stats.totalCollected / stats.totalBilled) * 100).toFixed(0)}%`
                  : '100%'}
              </p>
              <span className="text-[10px] text-blue-700 font-medium">Online card / cash sync</span>
            </div>
          </div>
        )}

        {/* Filters and Invoices Table */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
              {['all', 'unpaid', 'paid', 'draft'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 rounded-lg capitalize transition-all ${
                    filterStatus === status
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <span className="text-xs text-slate-400 font-mono">
              {total > 0 ? `${total} invoice${total === 1 ? '' : 's'}` : 'No invoices yet'}
            </span>
          </div>

          {loadError && (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{loadError}</span>
            </div>
          )}

          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-xs">Loading customer invoices...</p>
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <FileText className="w-10 h-10 mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-700">No invoices match this filter</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Generate an invoice from a completed field job or click &ldquo;New Invoice&rdquo; above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Customer invoices</caption>
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th scope="col" className="py-3 px-4">Invoice #</th>
                    <th scope="col" className="py-3 px-4">Customer</th>
                    <th scope="col" className="py-3 px-4">Service Description</th>
                    <th scope="col" className="py-3 px-4 text-center">Status</th>
                    <th scope="col" className="py-3 px-4 text-right">Total</th>
                    <th scope="col" className="py-3 px-4 text-right">Balance Due</th>
                    <th scope="col" className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => {
                    const isCopied = copiedId === inv._id;
                    return (
                      <tr key={inv._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-900 block">
                            {inv.customerId?.name || 'Residential Client'}
                          </span>
                          <span className="text-[11px] text-slate-400 block font-mono">
                            {inv.customerId?.phone || '+1 (312) 555-0199'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs truncate text-slate-600">
                          {inv.title}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {(() => {
                            const daysAgo = Math.floor((Date.now() - new Date(inv.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                            const isOverdue = inv.status !== 'paid' && daysAgo > 0;
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    inv.status === 'paid'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : inv.status === 'unpaid'
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {inv.status}
                                </span>
                                {inv.status !== 'paid' && (
                                  <span
                                    className={`text-[9px] font-semibold ${
                                      isOverdue ? 'text-rose-600 font-bold' : 'text-amber-600'
                                    }`}
                                  >
                                    {isOverdue ? `Overdue (${daysAgo}d)` : 'Due Today'}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                          ${inv.totalAmount.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-black">
                          <span className={inv.balanceDue === 0 ? 'text-slate-400 line-through' : 'text-blue-600'}>
                            ${inv.balanceDue.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Copy Customer Payment Link */}
                            <button
                              onClick={() => handleCopyLink(inv.shareToken, inv._id)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Copy Customer Payment Link"
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>

                            {/*
                              1-Click SMS payment reminder. The draft no longer
                              signs off as "Apex Heating & Air", which put a
                              different company's name in every contractor's
                              outgoing reminder.
                            */}
                            {inv.status !== 'paid' && (
                              <a
                                href={`sms:${inv.customerId?.phone || ''}?&body=${encodeURIComponent(
                                  `Hi ${inv.customerId?.name || 'there'}, a friendly payment reminder: Invoice #${inv.invoiceNumber} for $${inv.balanceDue.toFixed(2)} is ready for online payment at ${typeof window !== 'undefined' ? window.location.origin : ''}/portal/invoice/${inv.shareToken}`
                                )}`}
                                onClick={() => toast.info('Opening Messaging App', 'Drafted automated SMS payment reminder.')}
                                className="p-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors"
                                title="Send SMS Payment Reminder"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </a>
                            )}

                            {/* View Customer Link */}
                            <Link
                              href={`/portal/invoice/${inv.shareToken}`}
                              target="_blank"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Open Customer Portal"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>

                            {/* Record Manual Payment */}
                            {inv.status !== 'paid' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPaymentModalInvoice(inv)}
                                className="text-[11px] h-7 px-2.5 rounded-lg border-slate-200 text-emerald-700 hover:bg-emerald-50"
                              >
                                Record Pay
                              </Button>
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

          {!loading && invoices.length > 0 && (
            <div className="mt-3">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={20}
                itemLabel="invoices"
                onPageChange={setPage}
              />
            </div>
          )}
        </div>

        {/* Create Invoice Modal */}
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="w-full max-w-xl bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-5 my-8">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3>Create Digital Invoice</h3>
                </div>
                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateInvoice} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Select Customer <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:bg-white"
                    required
                  >
                    {customers.map((c) => {
                      const cid = c._id || c.id;
                      const cname = c.fullName || `${c.firstName} ${c.lastName}`.trim() || 'Customer';
                      const city = c.address?.city || 'Dallas, TX';
                      return (
                        <option key={cid} value={cid}>
                          {cname} — {c.phone} ({city})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Work Order / Project Title
                  </label>
                  <Input
                    value={invoiceTitle}
                    onChange={(e) => setInvoiceTitle(e.target.value)}
                    className="bg-slate-50 border-slate-200 text-xs rounded-xl h-9"
                    required
                  />
                </div>

                {/* Line items builder */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Line Items</span>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Item
                    </button>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <Input
                          placeholder="Description (Service or Part)"
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          className="flex-1 bg-slate-50 border-slate-200 text-xs rounded-xl h-8"
                          required
                        />
                        <Input
                          type="number"
                          placeholder="Qty"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-16 bg-slate-50 border-slate-200 text-xs rounded-xl h-8"
                          required
                        />
                        <Input
                          type="number"
                          placeholder="$ Unit"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="w-24 bg-slate-50 border-slate-200 text-xs rounded-xl h-8"
                          required
                        />
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-slate-400 hover:text-rose-500 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Diagnostic credit */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Diagnostic Fee Credit ($ Amount deducted from bill)
                  </label>
                  <Input
                    type="number"
                    value={diagCredit}
                    onChange={(e) => setDiagCredit(parseFloat(e.target.value) || 0)}
                    className="bg-slate-50 border-slate-200 text-xs rounded-xl h-9"
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Standard Alex AI policy credits $89 diagnostic fee toward repair.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateModalOpen(false)}
                    className="text-xs rounded-xl h-10 px-4 border-slate-200 text-slate-600"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl h-10 px-5 shadow-xs"
                  >
                    {creating ? 'Generating Invoice...' : 'Generate & Issue Invoice'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Record Manual Payment Modal */}
        {paymentModalInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm">Record Offline Payment</h3>
                <button onClick={() => setPaymentModalInvoice(null)} className="text-slate-400 hover:text-slate-700">
                  ✕
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-slate-500 font-medium">Invoice: {paymentModalInvoice.invoiceNumber}</span>
                <p className="text-base font-black text-slate-900 font-mono">
                  Balance Due: ${paymentModalInvoice.balanceDue.toFixed(2)}
                </p>
              </div>

              <form onSubmit={handleRecordPayment} className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
                  >
                    <option value="cash">Cash (Collected in person by tech)</option>
                    <option value="check">Paper Check</option>
                    <option value="card">Manual Credit Card Swipe / Terminal</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Check # or Receipt Ref</label>
                  <Input
                    placeholder="e.g. Check #4401 or Tech Receipt #12"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    className="bg-slate-50 border-slate-200 text-xs rounded-xl h-9"
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={recordingPay}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 rounded-xl"
                  >
                    {recordingPay ? 'Recording...' : 'Mark as Paid in Full'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </DashboardShell>
  );
}
