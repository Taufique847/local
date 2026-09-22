'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CheckCircle2,
  Sparkles,
  Loader2,
  Phone,
  Building,
  User,
  Mail,
  Wrench,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MarketingService } from '@/services/marketing.service';
import { ApiError, toErrorMessage } from '@/lib/api-client';
import { useDialog } from '@/lib/use-dialog';

const bookingSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  businessName: z.string().min(2, 'Company name is required'),
  trade: z.enum(['hvac', 'plumbing', 'electrical', 'roofing', 'multi_trade'], {
    errorMap: () => ({ message: 'Please select your primary trade' }),
  }),
  phone: z
    .string()
    .min(10, 'Please enter a valid 10-digit US phone number')
    .regex(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/, 'Invalid US phone number format'),
  email: z.string().email('Please enter a valid business email address'),
  monthlyCalls: z.string().min(1, 'Please select your estimated monthly call volume'),
  // Honeypot. Hidden from users; bots that fill every field are rejected.
  companyWebsite: z.string().max(0).optional(),
});

type BookingFormData = z.infer<typeof bookingSchema>;

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BookingModal({ isOpen, onClose }: BookingModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      trade: 'hvac',
      monthlyCalls: '50-150',
      companyWebsite: '',
    },
  });

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setSubmitted(false);
      setSubmitError(null);
      reset();
    }, 300);
  };

  const dialogRef = useDialog<HTMLDivElement>({ isOpen, onClose: handleClose });

  /**
   * Persists the lead to the backend. The previous implementation awaited a
   * fake 800ms timeout and console.logged the payload, so no demo request was
   * ever recorded.
   */
  const onSubmit = async (data: BookingFormData) => {
    setLoading(true);
    setSubmitError(null);

    try {
      await MarketingService.submitDemoRequest(data);
      setSubmitted(true);
    } catch (err) {
      // Map backend field errors onto the matching inputs where possible.
      if (err instanceof ApiError && err.fields) {
        let mapped = false;
        for (const [field, message] of Object.entries(err.fields)) {
          if (field in data) {
            setError(field as keyof BookingFormData, { type: 'server', message });
            mapped = true;
          }
        }
        if (mapped) {
          setLoading(false);
          return;
        }
      }
      setSubmitError(toErrorMessage(err, 'We could not submit your request. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Dialog Body */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-modal-title"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl z-10 overflow-hidden text-left max-h-[90vh] overflow-y-auto"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close demo request form"
              className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>

            {submitted ? (
              <div className="py-8 text-center space-y-4 animate-in fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <h3 id="booking-modal-title" className="text-xl font-bold text-slate-900">
                    Request received
                  </h3>
                  {/* Honest copy: nothing is auto-dialled or auto-invited. The
                      previous version claimed a calendar invite and test call
                      link had already been sent, which was not true. */}
                  <p className="text-sm text-slate-600 max-w-xs mx-auto">
                    Your details are with our team. We usually reply within one business day to set
                    up your walkthrough.
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 max-w-sm mx-auto space-y-1 text-left">
                  <div className="flex items-center gap-1.5 font-semibold text-blue-700">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> What happens next
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    We will call the number you provided to confirm a time, then walk you through a
                    live AI receptionist call using your own business details.
                  </p>
                </div>
                <Button
                  onClick={handleClose}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-xl mt-4"
                >
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> 1-on-1 Personalized
                    Walkthrough
                  </div>
                  <h2
                    id="booking-modal-title"
                    className="text-2xl font-bold tracking-tight text-slate-900"
                  >
                    See BlueCollar AI on your own calls
                  </h2>
                  <p className="text-xs text-slate-500">
                    A 15-minute walkthrough of how missed-call recovery and AI booking work for your
                    trade.
                  </p>
                </div>

                {submitError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{submitError}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5 text-left" noValidate>
                  {/* Honeypot: visually and semantically hidden from real users. */}
                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="companyWebsite">Company website</label>
                    <input
                      id="companyWebsite"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      {...register('companyWebsite')}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="booking-fullName"
                        className="text-xs font-medium text-slate-700 block mb-1"
                      >
                        Full Name
                      </label>
                      <div className="relative">
                        <User
                          className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                          aria-hidden="true"
                        />
                        <Input
                          id="booking-fullName"
                          autoComplete="name"
                          error={errors.fullName?.message}
                          describedBy={errors.fullName ? 'booking-fullName-error' : undefined}
                          {...register('fullName')}
                          placeholder="Dave Miller"
                          className="pl-9 bg-white border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 rounded-xl"
                        />
                      </div>
                      {errors.fullName && (
                        <p id="booking-fullName-error" className="text-[11px] text-rose-600 mt-1">
                          {errors.fullName.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="booking-businessName"
                        className="text-xs font-medium text-slate-700 block mb-1"
                      >
                        Company Name
                      </label>
                      <div className="relative">
                        <Building
                          className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                          aria-hidden="true"
                        />
                        <Input
                          id="booking-businessName"
                          autoComplete="organization"
                          error={errors.businessName?.message}
                          describedBy={errors.businessName ? 'booking-businessName-error' : undefined}
                          {...register('businessName')}
                          placeholder="Apex Heating & Air"
                          className="pl-9 bg-white border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 rounded-xl"
                        />
                      </div>
                      {errors.businessName && (
                        <p
                          id="booking-businessName-error"
                          className="text-[11px] text-rose-600 mt-1"
                        >
                          {errors.businessName.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="booking-trade"
                        className="text-xs font-medium text-slate-700 block mb-1"
                      >
                        Contractor Trade
                      </label>
                      <div className="relative">
                        <Wrench
                          className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                          aria-hidden="true"
                        />
                        <select
                          id="booking-trade"
                          {...register('trade')}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 text-xs text-slate-900 rounded-xl outline-none focus:border-blue-600"
                        >
                          <option value="hvac">HVAC &amp; Heating</option>
                          <option value="plumbing">Plumbing</option>
                          <option value="electrical">Electrical</option>
                          <option value="roofing">Roofing</option>
                          <option value="multi_trade">Multi-Trade Service</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="booking-phone"
                        className="text-xs font-medium text-slate-700 block mb-1"
                      >
                        Direct Phone
                      </label>
                      <div className="relative">
                        <Phone
                          className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                          aria-hidden="true"
                        />
                        <Input
                          id="booking-phone"
                          type="tel"
                          autoComplete="tel"
                          error={errors.phone?.message}
                          describedBy={errors.phone ? 'booking-phone-error' : undefined}
                          {...register('phone')}
                          placeholder="(312) 555-0199"
                          className="pl-9 bg-white border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 rounded-xl"
                        />
                      </div>
                      {errors.phone && (
                        <p id="booking-phone-error" className="text-[11px] text-rose-600 mt-1">
                          {errors.phone.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="booking-email"
                        className="text-xs font-medium text-slate-700 block mb-1"
                      >
                        Business Email
                      </label>
                      <div className="relative">
                        <Mail
                          className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                          aria-hidden="true"
                        />
                        <Input
                          id="booking-email"
                          type="email"
                          autoComplete="email"
                          error={errors.email?.message}
                          describedBy={errors.email ? 'booking-email-error' : undefined}
                          {...register('email')}
                          placeholder="dave@apexheating.com"
                          className="pl-9 bg-white border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 rounded-xl"
                        />
                      </div>
                      {errors.email && (
                        <p id="booking-email-error" className="text-[11px] text-rose-600 mt-1">
                          {errors.email.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="booking-monthlyCalls"
                        className="text-xs font-medium text-slate-700 block mb-1"
                      >
                        Monthly Inbound Calls
                      </label>
                      <select
                        id="booking-monthlyCalls"
                        {...register('monthlyCalls')}
                        className="w-full px-3 py-2 bg-white border border-slate-300 text-xs text-slate-900 rounded-xl outline-none focus:border-blue-600"
                      >
                        <option value="10-50">Under 50 calls/mo</option>
                        <option value="50-150">50 - 150 calls/mo</option>
                        <option value="150-500">150 - 500 calls/mo</option>
                        <option value="500+">500+ calls/mo</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl shadow-sm transition-all text-xs"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
                          Sending request…
                        </>
                      ) : (
                        'Request my walkthrough'
                      )}
                    </Button>
                  </div>

                  <p className="text-[10px] text-center text-slate-500 pt-1">
                    🔒 No credit card required. TCPA compliant. We never sell your details.
                  </p>
                </form>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
