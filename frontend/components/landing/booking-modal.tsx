'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Sparkles, Loader2, Phone, Building, User, Mail, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
});

type BookingFormData = z.infer<typeof bookingSchema>;

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BookingModal({ isOpen, onClose }: BookingModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      trade: 'hvac',
      monthlyCalls: '50-150',
    },
  });

  const onSubmit = async (data: BookingFormData) => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    console.log('Booked Demo Lead:', data);
    setLoading(false);
    setSubmitted(true);
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setSubmitted(false);
      reset();
    }, 300);
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
          />

          {/* Dialog Body */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl z-10 overflow-hidden text-left"
          >
            {/* Close Button */}
            <button
              onClick={handleClose}
              className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {submitted ? (
              <div className="py-8 text-center space-y-4 animate-in fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-xl font-bold text-slate-900">Live AI Demo Reserved!</h3>
                  <p className="text-sm text-slate-600 max-w-xs mx-auto">
                    We just sent a calendar invite and an interactive test call link to your phone number.
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 max-w-sm mx-auto space-y-1 text-left">
                  <div className="flex items-center gap-1.5 font-semibold text-blue-700">
                    <Sparkles className="w-3.5 h-3.5" /> What happens next:
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Our AI Receptionist will place a 60-second test call to your number so you can experience the sub-300ms latency firsthand.
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
                    <Sparkles className="w-3.5 h-3.5" /> 1-on-1 Personalized Walkthrough
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                    Experience BlueCollar AI Live
                  </h2>
                  <p className="text-xs text-slate-500">
                    See how contractors recover $15,000+ monthly in missed emergency calls.
                  </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5 text-left">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-1">
                        Full Name
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          {...register('fullName')}
                          placeholder="Dave Miller"
                          className="pl-9 bg-white border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 rounded-xl"
                        />
                      </div>
                      {errors.fullName && (
                        <p className="text-[11px] text-rose-600 mt-1">{errors.fullName.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-1">
                        Company Name
                      </label>
                      <div className="relative">
                        <Building className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          {...register('businessName')}
                          placeholder="Apex Heating & Air"
                          className="pl-9 bg-white border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 rounded-xl"
                        />
                      </div>
                      {errors.businessName && (
                        <p className="text-[11px] text-rose-600 mt-1">
                          {errors.businessName.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-1">
                        Contractor Trade
                      </label>
                      <div className="relative">
                        <Wrench className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <select
                          {...register('trade')}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 text-xs text-slate-900 rounded-xl outline-none focus:border-blue-600"
                        >
                          <option value="hvac">HVAC & Heating</option>
                          <option value="plumbing">Plumbing</option>
                          <option value="electrical">Electrical</option>
                          <option value="roofing">Roofing</option>
                          <option value="multi_trade">Multi-Trade Service</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-1">
                        Direct Phone (For Test Call)
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          {...register('phone')}
                          placeholder="(312) 555-0199"
                          className="pl-9 bg-white border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 rounded-xl"
                        />
                      </div>
                      {errors.phone && (
                        <p className="text-[11px] text-rose-600 mt-1">{errors.phone.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-1">
                        Business Email
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          {...register('email')}
                          placeholder="dave@apexheating.com"
                          className="pl-9 bg-white border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 rounded-xl"
                        />
                      </div>
                      {errors.email && (
                        <p className="text-[11px] text-rose-600 mt-1">{errors.email.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-1">
                        Monthly Inbound Calls
                      </label>
                      <select
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
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Configuring Demo Stream...
                        </>
                      ) : (
                        'Watch 15-Minute Interactive Demo'
                      )}
                    </Button>
                  </div>

                  <p className="text-[10px] text-center text-slate-500 pt-1">
                    🔒 No credit card required. TCPA compliant. Never spammed.
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
