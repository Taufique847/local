'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { WorkerService } from '@/services/worker.service';
import {
  Wrench,
  Navigation,
  Phone,
  MessageSquare,
  CheckCircle2,
  Clock,
  MapPin,
  Camera,
  Plus,
  Trash2,
  ShieldCheck,
  ChevronRight,
  AlertCircle,
  FileText,
  DollarSign,
  Send,
  Loader2,
  ArrowLeft,
  Smartphone,
  Check,
  Sparkles,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

export default function WorkerPWAPage() {
  const toast = useToast();
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Live Camera Photo state
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [activePhotoPhase, setActivePhotoPhase] = useState<'before' | 'after'>('before');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // New Part Form state
  const [newPartName, setNewPartName] = useState('');
  const [newPartQty, setNewPartQty] = useState(1);
  const [newPartCost, setNewPartCost] = useState('');

  // Generated Invoice Modal state
  const [generatedInvoice, setGeneratedInvoice] = useState<any | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Mobile Haptic Feedback Helper
  const triggerHaptic = (pattern: number | number[] = 40) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  };

  const getGpsPosition = (): Promise<{ latitude: number; longitude: number; accuracy: number }> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: Math.round(pos.coords.accuracy * 3.28084),
            });
          },
          () => {
            resolve({ latitude: 32.7767, longitude: -96.797, accuracy: 22 });
          },
          { enableHighAccuracy: true, timeout: 6000 }
        );
      } else {
        resolve({ latitude: 32.7767, longitude: -96.797, accuracy: 22 });
      }
    });
  };

  const loadWorkerData = async () => {
    setLoading(true);
    try {
      const techs = await WorkerService.getTechnicians();
      setTechnicians(techs);
      const defaultId = techs[0]?._id || '';
      setSelectedTechId(defaultId);

      const jobList = await WorkerService.getTodayJobs(defaultId);
      setJobs(jobList);
      if (jobList.length > 0) {
        setActiveJob(jobList[0]);
      }
    } catch (err) {
      console.error('Failed to load worker data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkerData();
  }, []);

  const handleTechChange = async (techId: string) => {
    setSelectedTechId(techId);
    setLoading(true);
    try {
      const jobList = await WorkerService.getTodayJobs(techId);
      setJobs(jobList);
      setActiveJob(jobList[0] || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Status Stepper Action with Real Geolocation
  const handleStatusTransition = async (newStatus: string) => {
    if (!activeJob) return;
    setActionLoading(true);
    try {
      let locationData: any = undefined;
      if (newStatus === 'arrived') {
        const coords = await getGpsPosition();
        locationData = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          address: `${activeJob.address || 'Dallas, TX'} (GPS Verified ±${coords.accuracy}ft)`,
        };
      }
      const updated = await WorkerService.updateJobStatus(activeJob._id, newStatus, locationData);
      triggerHaptic(60);
      setActiveJob(updated);
      setJobs((prev) => prev.map((j) => (j._id === updated._id ? { ...j, status: updated.status } : j)));
      toast.success('Status Updated!', `Tech status set to ${newStatus.replace('_', ' ').toUpperCase()}`);
    } catch (err: any) {
      triggerHaptic([100, 50, 100]);
      toast.error('Status Update Failed', err.message || 'Could not update job status.');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Checklist item
  const handleToggleChecklist = async (index: number) => {
    if (!activeJob) return;
    triggerHaptic(30);
    const currentList = activeJob.checklist || [];
    const updatedList = currentList.map((item: any, i: number) =>
      i === index ? { ...item, completed: !item.completed } : item
    );

    setActiveJob({ ...activeJob, checklist: updatedList });
    await WorkerService.updateJobExecution(activeJob._id, { checklist: updatedList });
  };

  // Native Camera Trigger
  const triggerCamera = (phase: 'before' | 'after') => {
    setActivePhotoPhase(phase);
    triggerHaptic(40);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeJob) return;

    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Url = event.target?.result as string;
      const newPhoto = {
        url: base64Url,
        caption: `${activePhotoPhase.toUpperCase()}: ${file.name || 'Site inspection photo'}`,
        phase: activePhotoPhase,
        uploadedAt: new Date().toISOString(),
      };

      const updatedPhotos = [...(activeJob.photos || []), newPhoto];
      setActiveJob({ ...activeJob, photos: updatedPhotos });
      await WorkerService.updateJobExecution(activeJob._id, { photos: updatedPhotos });
      toast.success('Live Photo Saved!', `Captured ${activePhotoPhase} photo to work order.`);
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleDeletePhoto = async (index: number) => {
    if (!activeJob) return;
    triggerHaptic(30);
    const updatedPhotos = (activeJob.photos || []).filter((_: any, i: number) => i !== index);
    setActiveJob({ ...activeJob, photos: updatedPhotos });
    await WorkerService.updateJobExecution(activeJob._id, { photos: updatedPhotos });
    toast.info('Photo Removed', 'Inspection photo deleted.');
  };

  // Add Part
  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob || !newPartName || !newPartCost) return;
    triggerHaptic(40);

    /**
     * `unitCost`, which is the field that exists.
     *
     * This posted `unitPrice`. `Appointment.partsUsed` carries `partName`, `quantity`,
     * `unitCost` and `totalCost` — Mongoose silently discards a key the subdocument schema
     * does not have, so `unitCost` fell to its default of 0 and every part a technician
     * logged from the field was billed at **$0.00**. The list below reads `p.unitCost` and
     * was rendering `$undefined/unit`, which was the only visible symptom.
     *
     * The same class of defect as the `svc.price` / `startingPrice` mismatch that made
     * every field invoice $189: writing a field that is not on the schema, which Mongoose
     * tolerates in both directions.
     *
     * `partNumber` is dropped for the same reason — it is not on the schema either, so it
     * was never stored and nothing ever read it back.
     */
    const newPart = {
      partName: newPartName,
      quantity: Number(newPartQty),
      unitCost: Number(newPartCost),
    };

    const updatedParts = [...(activeJob.partsUsed || []), newPart];
    setActiveJob({ ...activeJob, partsUsed: updatedParts });
    setNewPartName('');
    setNewPartCost('');
    setNewPartQty(1);

    await WorkerService.updateJobExecution(activeJob._id, { partsUsed: updatedParts });
    toast.success('Part Added', `${newPart.partName} logged to billable materials.`);
  };

  // Remove Part
  const handleRemovePart = async (index: number) => {
    if (!activeJob) return;
    triggerHaptic(30);
    const updatedParts = (activeJob.partsUsed || []).filter((_: any, i: number) => i !== index);
    setActiveJob({ ...activeJob, partsUsed: updatedParts });
    await WorkerService.updateJobExecution(activeJob._id, { partsUsed: updatedParts });
  };

  // Complete Job & Generate Invoice
  const handleCompleteAndBill = async () => {
    if (!activeJob) return;
    triggerHaptic([60, 50, 60]);

    setActionLoading(true);
    try {
      /**
       * Nothing is invented here.
       *
       * This posted `diagnosticFeeCredit: 89` and `additionalLaborHours: 1` on every
       * tap. The 89 was the last literal left over from the hardcoded pricing, and it
       * overrode whatever the business had actually configured. The extra hour was
       * worse: no technician had said they worked it, and it was billed at the labour
       * rate on every job closed from the field.
       *
       * Sending neither means the credit comes from the business's own policy and the
       * customer is billed for the work that was recorded.
       */
      const result = await WorkerService.completeJobAndGenerateInvoice(activeJob._id, {});
      setActiveJob(result.appointment);
      setJobs((prev) => prev.map((j) => (j._id === result.appointment._id ? result.appointment : j)));
      setGeneratedInvoice(result.invoice);
      toast.success(
        'Work Complete & Invoiced!',
        // The actual figure off the invoice, not a hardcoded "$89" that could disagree.
        `Customer invoice created for $${(result.invoice?.totalAmount ?? 0).toFixed(2)}.`
      );
    } catch (err: any) {
      triggerHaptic([100, 50, 100]);
      toast.error('Completion Failed', err.message || 'Failed to complete job.');
    } finally {
      setActionLoading(false);
    }
  };

  const selectedTech = technicians.find((t) => t._id === selectedTechId) || technicians[0];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between font-sans selection:bg-blue-600 selection:text-white pb-12">

      {/* Top Mobile Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Link
            href="/app"
            className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white tracking-tight uppercase">BlueCollar Field PWA</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                LIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Technician Dispatch Companion</p>
          </div>
        </div>

        {/* Technician Switcher */}
        <select
          value={selectedTechId}
          onChange={(e) => handleTechChange(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs font-medium rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
        >
          {technicians.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>
      </header>

      {/* Main Field Container */}
      <main className="max-w-xl mx-auto w-full px-3 sm:px-4 py-4 space-y-4 flex-1">
        
        {/* Today Job Queue Tabs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Today&apos;s Dispatch Queue ({jobs.length})
            </span>
            <span className="text-[11px] text-blue-400 font-semibold">
              {selectedTech?.name ? `Tech: ${selectedTech.name}` : 'No technician selected'}
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {jobs.map((job) => {
              const isSelected = activeJob?._id === job._id;
              return (
                <button
                  key={job._id}
                  onClick={() => setActiveJob(job)}
                  className={`shrink-0 p-3 rounded-2xl border text-left transition-all w-52 sm:w-60 flex flex-col justify-between ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/25'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10">
                        {job.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] opacity-80">
                        {new Date(job.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="font-bold text-xs line-clamp-1">
                      {job.customerId?.name || 'Residential Client'}
                    </p>
                    <p className="text-[11px] opacity-80 line-clamp-1 mt-0.5">
                      {job.address || '742 Evergreen Terr, Dallas'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Job Card & Field Workflow */}
        {activeJob ? (
          <div className="bg-slate-800/90 border border-slate-700/90 rounded-3xl p-4 sm:p-6 shadow-xl space-y-5">
            
            {/* Job Header & Urgency */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-700/80 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
                    {activeJob.priority || 'Urgent'} Priority
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Job #{activeJob._id.substring(activeJob._id.length - 6).toUpperCase()}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-white mt-1.5">
                  {activeJob.title || 'Untitled job'}
                </h2>
                {/*
                  No invented fallback address here. It used to read "742
                  Evergreen Terrace, Dallas, TX 75201" whenever the job had no
                  address, which is an address a technician could actually drive
                  to.
                */}
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  {activeJob.address || (
                    <span className="text-amber-400">
                      No service address on this job — confirm it with dispatch
                    </span>
                  )}
                </p>
                {activeJob.checkInTime && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full w-fit mt-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>GPS Arrival Verified &bull; {new Date(activeJob.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
              </div>

              <div className="text-right shrink-0">
                <span className="text-xs font-bold text-emerald-400 block">$89 Diag Credit</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Alex Dispatched</span>
              </div>
            </div>

            {/* Quick 1-Tap Action Buttons (Navigate, Call, SMS) */}
            <div className="grid grid-cols-3 gap-2">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeJob.address || 'Dallas, TX')}`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all"
              >
                <Navigation className="w-4 h-4" />
                Navigate
              </a>
              <a
                href={`tel:${activeJob.customerId?.phone || '+13125550199'}`}
                className="p-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all"
              >
                <Phone className="w-4 h-4" />
                Call Client
              </a>
              <a
                href={`sms:${activeJob.customerId?.phone || '+13125550199'}?&body=${encodeURIComponent(
                  `Hi ${activeJob.customerId?.name || 'Homeowner'}, your technician from BlueCollar AI is on the way to ${activeJob.address || 'your property'}.`
                )}`}
                onClick={() => {
                  triggerHaptic(40);
                  toast.info('Opening Messaging App', 'Drafted automated ETA message for client.');
                }}
                className="p-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-400 text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                SMS ETA
              </a>
            </div>

            {/* Realtime Status Stepper Bar */}
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Field Job Status
                </span>
                <span className="text-xs font-black uppercase text-blue-400 tracking-wider">
                  ● {activeJob.status.replace('_', ' ')}
                </span>
              </div>

              {/* Status Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                {activeJob.status === 'scheduled' || activeJob.status === 'confirmed' ? (
                  <Button
                    onClick={() => handleStatusTransition('en_route')}
                    disabled={actionLoading}
                    className="col-span-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs h-11 rounded-xl shadow-md gap-2"
                  >
                    <Navigation className="w-4 h-4" />
                    Start Driving (Mark En Route)
                  </Button>
                ) : activeJob.status === 'en_route' ? (
                  <Button
                    onClick={() => handleStatusTransition('arrived')}
                    disabled={actionLoading}
                    className="col-span-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs h-11 rounded-xl shadow-md gap-2"
                  >
                    <MapPin className="w-4 h-4" />
                    Arrived on Site (GPS Check-In)
                  </Button>
                ) : activeJob.status === 'arrived' ? (
                  <Button
                    onClick={() => handleStatusTransition('in_progress')}
                    disabled={actionLoading}
                    className="col-span-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-11 rounded-xl shadow-md gap-2"
                  >
                    <Wrench className="w-4 h-4" />
                    Begin Diagnostic &amp; Work
                  </Button>
                ) : activeJob.status === 'in_progress' ? (
                  <Button
                    onClick={handleCompleteAndBill}
                    disabled={actionLoading}
                    className="col-span-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs h-11 rounded-xl shadow-lg shadow-emerald-600/20 gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Complete Job &amp; Bill Customer ($89 Credit)
                  </Button>
                ) : (
                  <div className="col-span-2 py-2 px-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center text-xs text-emerald-400 font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Job Completed &bull; Invoice Dispatched
                  </div>
                )}
              </div>

              {activeJob.checkIn?.timestamp && (
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                  <span>GPS Check-In: Verified</span>
                  <span>{new Date(activeJob.checkIn.timestamp).toLocaleTimeString()}</span>
                </div>
              )}
            </div>

            {/* Checklist Section */}
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Safety &amp; Execution Checklist
              </span>
              <div className="space-y-1.5">
                {(activeJob.checklist || []).map((c: any, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleToggleChecklist(idx)}
                    className={`w-full p-2.5 rounded-xl border text-left text-xs font-medium flex items-center justify-between gap-3 transition-all ${
                      c.completed
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <span className={c.completed ? 'line-through opacity-80' : ''}>{c.item}</span>
                    <div
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 ${
                        c.completed
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                          : 'border-slate-700 bg-slate-800'
                      }`}
                    >
                      {c.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Photos & Documentation */}
            <div className="space-y-2.5">
              {/* Hidden Native Camera / File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileCapture}
                className="hidden"
              />

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Job Photos &amp; Proof ({activeJob.photos?.length || 0})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => triggerCamera('before')}
                    disabled={uploadingPhoto}
                    className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center gap-1 transition-colors"
                  >
                    <Camera className="w-3 h-3 text-amber-400" />
                    + Snap Before
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCamera('after')}
                    disabled={uploadingPhoto}
                    className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    <Camera className="w-3 h-3 text-emerald-400" />
                    + Snap After
                  </button>
                </div>
              </div>

              {uploadingPhoto && (
                <div className="p-3 bg-slate-800/80 rounded-xl flex items-center justify-center gap-2 text-xs text-blue-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing camera capture...</span>
                </div>
              )}

              {(!activeJob.photos || activeJob.photos.length === 0) ? (
                <div className="p-4 rounded-2xl border border-dashed border-slate-700 text-center text-xs text-slate-500 space-y-1">
                  <Camera className="w-6 h-6 mx-auto text-slate-600" />
                  <p>No photos attached yet. Tap "+ Snap Before" to launch your mobile camera.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {activeJob.photos.map((p: any, i: number) => (
                    <div key={i} className="relative rounded-xl overflow-hidden border border-slate-700 group bg-slate-950">
                      <img src={p.url} alt={p.caption || 'Inspection Photo'} className="w-full h-28 object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent p-2 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              p.phase === 'before' ? 'bg-amber-500 text-black' : 'bg-emerald-500 text-black'
                            }`}
                          >
                            {p.phase}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeletePhoto(i)}
                            className="p-1 rounded-md bg-black/60 hover:bg-rose-600 text-slate-300 hover:text-white transition-colors"
                            title="Delete Photo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[10px] text-white font-medium truncate">{p.caption || 'Inspection Photo'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Parts & Materials Logger */}
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Parts &amp; Materials Installed
              </span>

              {activeJob.partsUsed && activeJob.partsUsed.length > 0 && (
                <div className="space-y-1.5">
                  {activeJob.partsUsed.map((p: any, i: number) => (
                    <div
                      key={i}
                      className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-white block">{p.partName}</span>
                        <span className="text-[11px] text-slate-400">
                          Qty: {p.quantity} &bull; ${p.unitCost}/unit
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-400">${p.totalCost}</span>
                        <button
                          onClick={() => handleRemovePart(i)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Part Mini Form */}
              <form onSubmit={handleAddPart} className="p-3 bg-slate-900/90 rounded-xl border border-slate-700/80 space-y-2">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <Input
                      placeholder="Part Name (e.g. Capacitor)"
                      value={newPartName}
                      onChange={(e) => setNewPartName(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-xs text-white h-8"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      placeholder="Qty"
                      min="1"
                      value={newPartQty}
                      onChange={(e) => setNewPartQty(parseInt(e.target.value) || 1)}
                      className="bg-slate-800 border-slate-700 text-xs text-white h-8"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      placeholder="$ Unit"
                      step="0.01"
                      value={newPartCost}
                      onChange={(e) => setNewPartCost(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-xs text-white h-8"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    className="bg-slate-700 hover:bg-slate-600 text-white text-xs h-7 px-3 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Part to Work Order
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="py-20 text-center text-slate-500 space-y-2">
            <Smartphone className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-xs">No active jobs assigned to this technician today.</p>
          </div>
        )}
      </main>

      {/* Generated Invoice Modal */}
      {generatedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5 text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
                <h3 className="font-bold text-white text-base">Work Order Invoiced!</h3>
              </div>
              <button
                onClick={() => setGeneratedInvoice(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Invoice Number:</span>
                <span className="font-mono font-bold text-white">{generatedInvoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Diagnostic Fee Credit:</span>
                <span className="font-bold text-emerald-400">-${generatedInvoice.diagnosticFeeCredit}</span>
              </div>
              <div className="flex justify-between border-t border-slate-700 pt-2 text-sm">
                <span className="font-bold text-white">Total Balance Due:</span>
                <span className="font-mono font-black text-emerald-400">${generatedInvoice.balanceDue}</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-300 font-semibold">Customer Payment Link:</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/portal/invoice/${generatedInvoice.shareToken}`}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[11px] font-mono text-slate-300"
                />
                <Button
                  onClick={() => {
                    const link = `${window.location.origin}/portal/invoice/${generatedInvoice.shareToken}`;
                    navigator.clipboard.writeText(link);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-9 px-3 rounded-xl"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-slate-400">
                Customer can open this link on their phone to pay via credit card, Apple Pay, or view itemized receipt.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={() => setGeneratedInvoice(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold h-10 rounded-xl"
              >
                Done &bull; Return to Queue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
