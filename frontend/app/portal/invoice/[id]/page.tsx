'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { InvoiceService } from '@/services/invoice.service';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Printer,
  Download,
  Building2,
  ShieldCheck,
  Calendar,
  DollarSign,
  Loader2,
  XCircle,
  Lock,
  ArrowRight,
  Receipt,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

export default function PublicInvoicePortalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  // The URL segment is the invoice's secret share token, not its database id.
  const shareToken = params.id as string;
  const toast = useToast();

  const [invoice, setInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [paying, setPaying] = useState<'card' | 'offline' | null>(null);
  const [offlineMethod, setOfflineMethod] = useState<'check' | 'cash' | 'bank_transfer'>('check');
  const [offlineDeclared, setOfflineDeclared] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);

  // Stripe redirects back here with ?payment=success|canceled.
  const paymentParam = searchParams.get('payment');

  useEffect(() => {
    async function loadInvoice() {
      if (!shareToken) return;
      try {
        const inv = await InvoiceService.getPublicInvoice(shareToken);
        setInvoice(inv);
        if (inv.status === 'paid') {
          setPaySuccess(true);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    }
    loadInvoice();
  }, [shareToken]);

  /**
   * Redirects to Stripe Checkout.
   *
   * Card details are never entered on this page. The previous version collected
   * a card number, expiry and CVC into React state and POSTed to an endpoint that
   * simply flipped the invoice to "paid" — no money moved, and handling raw card
   * data in our own DOM is a PCI problem we should not have.
   */
  const handleCardPayment = async () => {
    setPaying('card');
    try {
      const { checkoutUrl } = await InvoiceService.createPortalCheckout(shareToken);
      window.location.href = checkoutUrl;
    } catch (err: any) {
      toast.error(
        'Card payment unavailable',
        err.message || 'Please try the check or bank transfer option, or contact your contractor.'
      );
      setPaying(null);
    }
  };

  /** Flags an intent to pay offline. Does not settle the balance. */
  const handleOfflinePayment = async () => {
    setPaying('offline');
    try {
      await InvoiceService.declareOfflinePayment(shareToken, offlineMethod);
      setOfflineDeclared(true);
      setPayModalOpen(false);
      toast.success(
        'Thanks — your contractor has been notified',
        'They will confirm the payment once it arrives.'
      );
    } catch (err: any) {
      toast.error('Could not save that', err.message || 'Please try again.');
    } finally {
      setPaying(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
        <p className="text-xs font-semibold text-slate-600">Loading invoice &amp; payment gateway...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <XCircle className="w-12 h-12 text-rose-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Invoice Not Found</h2>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          This payment link may be invalid or has been archived. Please contact customer support.
        </p>
      </div>
    );
  }

  const isPaid = paySuccess || invoice.status === 'paid';

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 py-8 px-3 sm:px-6 font-sans antialiased">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Returned from Stripe. The invoice is only marked paid once Stripe
            confirms the charge through the webhook, which can lag the redirect by
            a second or two — so this is worded as "processing", not "paid". */}
        {paymentParam === 'success' && !isPaid && (
          <div
            role="status"
            className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 flex items-start gap-3"
          >
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold">Payment received, confirming now</p>
              <p className="text-xs">
                This page will show as paid within a few seconds. You can safely close it — a receipt
                is on its way.
              </p>
            </div>
          </div>
        )}

        {paymentParam === 'canceled' && !isPaid && (
          <div className="p-4 rounded-2xl border border-slate-200 bg-white text-xs text-slate-600">
            Payment was cancelled. Nothing has been charged.
          </div>
        )}

        {offlineDeclared && !isPaid && (
          <div
            role="status"
            className="p-4 rounded-2xl border border-blue-200 bg-blue-50 text-blue-900 flex items-start gap-3"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold">Your contractor has been notified</p>
              <p className="text-xs">
                They will mark this invoice paid once your payment arrives.
              </p>
            </div>
          </div>
        )}

        {/* Paid Confirmation Banner */}
        {isPaid && (
          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-600 text-white shadow-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base">Invoice Paid in Full!</h3>
                <p className="text-xs text-emerald-100">
                  Payment processed successfully. A confirmation receipt has been issued.
                </p>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors shrink-0"
              title="Print Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Document Paper */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                  BC
                </div>
                {/*
                  Placeholder company details are never shown on a bill. This
                  previously fell back to "Apex Heating & Air", a claim of
                  "Austin / Dallas Dispatch", and a 555 phone number, so a
                  homeowner could be asked to pay a company that is not theirs.
                */}
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  {invoice.businessId?.name || 'Your contractor'}
                </h1>
              </div>
              {invoice.businessId?.phone && (
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {invoice.businessId.phone}
                </p>
              )}
            </div>

            <div className="sm:text-right space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                {invoice.invoiceNumber}
              </span>
              <p className="text-xs text-slate-500">
                Issued: {new Date(invoice.createdAt).toLocaleDateString()}
              </p>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isPaid
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}
              >
                {isPaid ? 'PAID IN FULL' : 'PAYMENT DUE'}
              </span>
            </div>
          </div>

          {/* Customer & Work Order Summary */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Billed To Homeowner
              </span>
              <span className="font-bold text-slate-900 text-sm block mt-0.5">
                {invoice.customerId?.name || invoice.customerId?.fullName || `${invoice.customerId?.firstName || ''} ${invoice.customerId?.lastName || ''}`.trim() || 'Homeowner'}
              </span>
              {(() => {
                const addr = invoice.customerId?.address;
                const text =
                  typeof addr === 'object' && addr
                    ? [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ')
                    : typeof addr === 'string'
                      ? addr
                      : '';
                return text ? (
                  <span className="text-slate-500 block mt-0.5">{text}</span>
                ) : null;
              })()}
              {invoice.customerId?.phone && (
                <span className="text-slate-400 font-mono text-[11px] block mt-0.5">
                  {invoice.customerId.phone}
                </span>
              )}
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Project / Service Description
              </span>
              <span className="font-bold text-slate-900 block mt-0.5">
                {invoice.title}
              </span>
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px] mt-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Due Date: {new Date(invoice.dueDate).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Itemized Service &amp; Materials Charges
            </h3>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="py-3 px-3 font-medium text-slate-900">{item.description}</td>
                      <td className="py-3 px-3 text-center text-slate-600">{item.quantity}</td>
                      <td className="py-3 px-3 text-right text-slate-600 font-mono">${item.unitPrice.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">
                        ${item.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals & Balance Due */}
          <div className="flex justify-end pt-2">
            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">${invoice.subtotal.toFixed(2)}</span>
              </div>

              {invoice.diagnosticFeeCredit > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                  <span>Diagnostic Fee Credit:</span>
                  <span className="font-mono">-${invoice.diagnosticFeeCredit.toFixed(2)}</span>
                </div>
              )}

              {/*
                The discount, with the reason it was given.

                The emergency callout and travel charges are not repeated here — they
                already appear as their own rows in the line-item table above, which is
                where a customer looks for what they are being charged for. The discount
                is the one figure that moves the total and has no line of its own, so
                without this row the bill simply came to less than its items and said
                nothing about why.
              */}
              {invoice.discountAmount > 0 && (
                <div className="flex justify-between gap-3 text-emerald-700 font-bold bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                  <span>
                    Discount
                    {invoice.discountType === 'percentage' && invoice.discountValue
                      ? ` (${invoice.discountValue}%)`
                      : ''}
                    :
                    {invoice.discountReason ? (
                      <span className="block font-medium text-[11px] text-emerald-800/80">
                        {invoice.discountReason}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono shrink-0">-${invoice.discountAmount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-600">
                <span>Sales Tax ({((invoice.taxRate || 0.0825) * 100).toFixed(2)}%):</span>
                <span className="font-mono">${invoice.taxAmount.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-sm font-bold text-slate-800 border-t border-slate-200 pt-2">
                <span>Invoice Total:</span>
                <span className="font-mono">${invoice.totalAmount.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-2">
                <span>Balance Due:</span>
                <span className={`font-mono ${isPaid ? 'text-emerald-600 font-bold' : 'text-blue-600'}`}>
                  ${isPaid ? '0.00' : invoice.balanceDue.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Official Paid Stamp for Print and Screen */}
          {isPaid && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-emerald-800">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold text-xs uppercase tracking-wider block">Official Payment Receipt</span>
                  <span className="text-[11px] text-emerald-700">Reference: {invoice.paymentReference || 'Online Card Checkout'} &bull; Balance Settled in Full</span>
                </div>
              </div>
              <div className="px-3 py-1 bg-emerald-600 text-white font-black text-[11px] uppercase tracking-wider rounded-lg shrink-0">
                Paid in Full
              </div>
            </div>
          )}

          {/* Action Bar / Pay Now */}
          <div className="border-t border-slate-200 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <Lock className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              <span>Card payments are processed by Stripe</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / Save PDF
              </button>

              {!isPaid && (
                <Button
                  onClick={() => setPayModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-11 px-6 rounded-xl shadow-md gap-2"
                >
                  <CreditCard className="w-4 h-4" aria-hidden="true" />
                  Pay ${invoice.balanceDue.toFixed(2)}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment options. Card details are collected by Stripe on Stripe's own
          hosted page, never here. */}
      {payModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto no-print">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-modal-title"
            className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <CreditCard className="w-5 h-5 text-blue-600" aria-hidden="true" />
                <h3 id="pay-modal-title">Pay this invoice</h3>
              </div>
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                aria-label="Close payment options"
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
              <p className="text-[11px] font-medium text-slate-500">Amount due</p>
              <p className="text-2xl font-black text-slate-900 font-mono">
                ${invoice.balanceDue.toFixed(2)}
              </p>
            </div>

            {/* Option 1: card via Stripe */}
            <div className="space-y-2">
              <Button
                type="button"
                onClick={handleCardPayment}
                disabled={paying !== null}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-11 rounded-xl shadow-md gap-2"
              >
                {paying === 'card' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Opening secure checkout…
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    Pay by card
                  </>
                )}
              </Button>
              <p className="text-center text-[11px] text-slate-500">
                You will be taken to Stripe to enter your card. We never see or store your card
                details.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">or</span>
              <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
            </div>

            {/* Option 2: declare an offline payment */}
            <div className="space-y-2.5 rounded-2xl border border-slate-200 p-3.5">
              <label
                htmlFor="offline-method"
                className="block text-xs font-semibold text-slate-700"
              >
                Paying another way?
              </label>
              <select
                id="offline-method"
                value={offlineMethod}
                onChange={(e) => setOfflineMethod(e.target.value as typeof offlineMethod)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
              >
                <option value="check">Check</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer / Zelle</option>
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={handleOfflinePayment}
                disabled={paying !== null}
                className="w-full border-slate-300 bg-white text-xs font-bold text-slate-700 h-10 rounded-xl gap-2"
              >
                {paying === 'offline' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Let my contractor know
              </Button>
              <p className="text-[11px] text-slate-500">
                This tells your contractor to expect payment. The balance stays open until they
                confirm it has arrived.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
