'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { EstimateService } from '@/services/estimate.service';
import {
  FileCheck,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  PenTool,
  RotateCcw,
  Calendar,
  Building2,
  Printer,
  Download,
  Phone,
  Mail,
  Loader2,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

export default function PublicQuotePortalPage() {
  const params = useParams();
  const tokenOrId = params.id as string;
  const toast = useToast();

  const [estimate, setEstimate] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // E-Signature State
  const [signerName, setSignerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvedSuccess, setApprovedSuccess] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string>('better');

  // Canvas drawing refs & high-DPI smoothing
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    async function loadQuote() {
      try {
        setLoading(true);
        const est = await EstimateService.getPublicEstimate(tokenOrId);
        setEstimate(est);
        setSignerName(est.customerId?.name || est.customerId?.fullName || '');
        if (est.selectedTierId) {
          setSelectedTierId(est.selectedTierId);
        } else if (est.tiers && est.tiers.length > 0) {
          const rec = est.tiers.find((t: any) => t.isRecommended) || est.tiers[0];
          setSelectedTierId(rec.tierId);
        }
        if (est.status === 'approved' || est.status === 'converted') {
          setApprovedSuccess(true);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load quote');
      } finally {
        setLoading(false);
      }
    }
    loadQuote();
  }, [tokenOrId]);

  // Setup High-DPI Canvas
  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = rect.width * dpr;
    canvas.height = 130 * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    return () => window.removeEventListener('resize', setupCanvas);
  }, [estimate, approvedSuccess]);

  const getPointerPos = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  // Smooth Bezier Drawing Handlers (Touch & Mouse)
  const startDrawing = (e: any) => {
    if (e.cancelable && e.touches) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPointerPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPoint.current = pos;
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    if (e.cancelable && e.touches) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPoint.current) return;

    const pos = getPointerPos(e);
    const midX = (lastPoint.current.x + pos.x) / 2;
    const midY = (lastPoint.current.y + pos.y) / 2;

    ctx.quadraticCurveTo(lastPoint.current.x, lastPoint.current.y, midX, midY);
    ctx.stroke();
    lastPoint.current = pos;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPoint.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    toast.info('Signature Cleared', 'You can sign again on the pad.');
  };

  // Submit Approval
  const handleApproveQuote = async () => {
    if (!signerName.trim()) {
      toast.error('Name Required', 'Please provide your full legal name before signing.');
      return;
    }
    if (!hasSignature) {
      toast.error('Signature Required', 'Please draw your electronic signature on the canvas pad.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureDataUrl = canvas.toDataURL('image/png');

    setIsSubmitting(true);
    try {
      const updated = await EstimateService.approvePublicEstimate(tokenOrId, {
        signedByName: signerName,
        signatureDataUrl,
      });
      setEstimate(updated);
      setApprovedSuccess(true);
      toast.success('Proposal E-Signed & Approved!', 'Your work authorization has been registered.');
    } catch (err: any) {
      toast.error('Approval Error', err.message || 'Failed to submit quote approval.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
        <p className="text-xs font-semibold text-slate-600">Loading digital estimate...</p>
      </div>
    );
  }

  if (error || !estimate) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <XCircle className="w-12 h-12 text-rose-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Estimate Not Found</h2>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          This estimate link may have expired or is invalid. Please contact the contractor for an updated quote.
        </p>
      </div>
    );
  }

  const isApproved = approvedSuccess || estimate.status === 'approved' || estimate.status === 'converted';

  const hasTiers = estimate.tiers && estimate.tiers.length > 0;
  const activeTier = hasTiers
    ? estimate.tiers.find((t: any) => t.tierId === selectedTierId) || estimate.tiers[0]
    : null;
  const displayItems = activeTier ? activeTier.items : estimate.items;
  const displaySubtotal = activeTier ? activeTier.subtotal : estimate.subtotal;
  const displayTax = activeTier
    ? parseFloat((Math.max(0, activeTier.subtotal - (estimate.diagnosticFeeCredit || 0)) * (estimate.taxRate || 0.0825)).toFixed(2))
    : estimate.taxAmount;
  const displayTotal = activeTier ? activeTier.totalAmount : estimate.totalAmount;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 py-8 px-3 sm:px-6 font-sans antialiased">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Approved Success Banner */}
        {isApproved && (
          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-600 text-white shadow-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base">Quote Approved &amp; Scheduled!</h3>
                <p className="text-xs text-emerald-100">
                  Thank you! Your work authorization has been registered with our dispatch desk.
                </p>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors shrink-0"
              title="Print Quote"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 7-Day Price Guarantee Countdown Banner */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs no-print">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>7-Day Price Guarantee:</strong> Authorized trade rates locked through{' '}
              {new Date(estimate.expiresAt || Date.now() + 7 * 86400000).toLocaleDateString()}.
            </span>
          </div>
          <span className="font-mono font-bold text-amber-700 text-[10px] uppercase bg-amber-100 px-2 py-0.5 rounded-md shrink-0">
            Active Quote
          </span>
        </div>

        {/* Main Document Paper */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-600" />
                {/*
                  Never substitute a placeholder company here. A homeowner
                  reading their own quote used to see "Apex Heating & Air" and a
                  555 phone number whenever the contractor record was missing —
                  the wrong company's name on a document they are asked to sign.
                */}
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  {estimate.businessId?.name || 'Your contractor'}
                </h1>
              </div>
              {estimate.businessId?.phone && (
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {estimate.businessId.phone}
                </p>
              )}
            </div>

            <div className="sm:text-right space-y-1.5">
              <div className="flex items-center sm:justify-end gap-2">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {estimate.estimateNumber}
                </span>
                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-50 flex items-center gap-1 shrink-0 no-print"
                  title="Print / Save PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print PDF
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Date: {new Date(estimate.createdAt).toLocaleDateString()}
              </p>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isApproved
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isApproved ? 'Approved & Signed' : 'Pending Homeowner Approval'}
              </span>
            </div>
          </div>

          {/* Homeowner Info */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Prepared For
              </span>
              <span className="font-bold text-slate-900 text-sm block mt-0.5">
                {estimate.customerId?.name || estimate.customerId?.fullName || `${estimate.customerId?.firstName || ''} ${estimate.customerId?.lastName || ''}`.trim() || 'Homeowner'}
              </span>
              {/* Blank beats a stranger's address on a quote. */}
              {(() => {
                const addr = estimate.customerId?.address;
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
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Work Order / Project Title
              </span>
              <span className="font-bold text-slate-900 block mt-0.5">
                {estimate.title}
              </span>
            </div>
          </div>

          {/* Good / Better / Best Multi-Option Selection */}
          {hasTiers && !isApproved && (
            <div className="space-y-3 no-print">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Select Your Recommended Proposal Option
                </h3>
                <span className="text-[11px] text-blue-600 font-semibold">
                  Choose 1 of {estimate.tiers.length} Options
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {estimate.tiers.map((tier: any) => {
                  const isSelected = selectedTierId === tier.tierId;
                  return (
                    <div
                      key={tier.tierId}
                      onClick={() => setSelectedTierId(tier.tierId)}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/60 shadow-md ring-2 ring-blue-500/20'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {tier.badge && (
                        <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-xs">
                          {tier.badge}
                        </span>
                      )}
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-900 capitalize">{tier.name}</span>
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">{tier.description}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                        <span className="text-xs text-slate-500">Tier Total:</span>
                        <span className="text-base font-black text-slate-900 font-mono">
                          ${tier.totalAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Proposed Scope of Work &amp; Components {activeTier ? `(${activeTier.name})` : ''}
              </h3>
            </div>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Service / Component</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayItems.map((item: any, i: number) => (
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

          {/* Financial Totals Calculation */}
          <div className="flex justify-end pt-2">
            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">${displaySubtotal.toFixed(2)}</span>
              </div>

              {estimate.diagnosticFeeCredit > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                  <span>Diagnostic Fee Credit:</span>
                  <span className="font-mono">-${estimate.diagnosticFeeCredit.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-600">
                <span>Sales Tax ({((estimate.taxRate || 0.0825) * 100).toFixed(2)}%):</span>
                <span className="font-mono">${displayTax.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-2">
                <span>Total Authorized:</span>
                <span className="font-mono text-blue-600">${displayTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Terms & Warranty Notice */}
          <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-2.5 text-xs text-blue-900">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Guaranteed Workmanship &amp; Warranty:</span>
              <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                {estimate.terms}
              </p>
            </div>
          </div>

          {/* E-Signature Section */}
          <div className="border-t border-slate-200 pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <PenTool className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                {isApproved ? 'Verified Electronic Signature' : 'Homeowner Electronic Approval'}
              </h3>
            </div>

            {isApproved ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Signed by Homeowner
                  </span>
                  <p className="text-sm font-bold text-slate-900">
                    {estimate.signature?.signedByName || signerName}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Signed on {new Date(estimate.approvedAt || estimate.updatedAt).toLocaleString()}
                  </p>
                </div>

                {estimate.signature?.signatureDataUrl && (
                  <div className="p-2 bg-white rounded-xl border border-slate-200 shrink-0">
                    <img
                      src={estimate.signature.signatureDataUrl}
                      alt="Customer Signature"
                      className="h-12 max-w-[180px] object-contain"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Your Full Legal Name
                  </label>
                  <Input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="bg-white border-slate-200 text-xs rounded-xl h-10"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Sign Here (Use Touch or Mouse)
                    </label>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Clear
                    </button>
                  </div>

                  <div className="border border-slate-300 rounded-2xl overflow-hidden bg-white shadow-2xs touch-none">
                    <canvas
                      ref={canvasRef}
                      width={500}
                      height={130}
                      className="w-full h-32 cursor-crosshair"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    By signing above, you authorize{' '}
                    {estimate.businessId?.name || 'this contractor'} to proceed with the specified
                    repair work.
                  </p>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleApproveQuote}
                    disabled={isSubmitting || !hasSignature || !signerName.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-11 rounded-xl shadow-md gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting Approval...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Approve &amp; E-Sign {activeTier ? `${activeTier.name} Option` : 'Quote'} (${displayTotal.toFixed(2)})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
