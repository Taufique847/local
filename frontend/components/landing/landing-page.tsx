'use client';

import React, { useState } from 'react';
import { Navbar } from '@/components/landing/navbar';
import { HeroSection } from '@/components/landing/hero-section';
import { BentoGrid } from '@/components/landing/bento-grid';
import { ReputationShieldDemo } from '@/components/landing/reputation-shield-demo';
import { RoiCalculator } from '@/components/landing/roi-calculator';
import { PricingSection } from '@/components/landing/pricing-section';
import { ComparisonTable } from '@/components/landing/comparison-table';
import { BookingModal } from '@/components/landing/booking-modal';
import { Footer } from '@/components/landing/footer';

/**
 * Interactive landing page.
 *
 * Split out of app/page.tsx so that route can stay a server component and export
 * `metadata`. A `'use client'` page cannot export metadata, which is why the
 * marketing page previously inherited the generic root title and description and
 * had no Open Graph card of its own.
 */
export function LandingPage() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  const openBookingModal = () => setIsBookingOpen(true);
  const closeBookingModal = () => setIsBookingOpen(false);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col selection:bg-blue-600 selection:text-white font-sans antialiased">
      <Navbar onOpenBookingModal={openBookingModal} />

      <main id="main-content">
        <HeroSection onOpenBookingModal={openBookingModal} />

        <BentoGrid onOpenBookingModal={openBookingModal} />

        <ReputationShieldDemo onOpenBookingModal={openBookingModal} />

        <RoiCalculator onOpenBookingModal={openBookingModal} />

        <PricingSection onOpenBookingModal={openBookingModal} />

        <ComparisonTable onOpenBookingModal={openBookingModal} />
      </main>

      <Footer />

      {/* Demo request form (persists to /api/demo-requests) */}
      <BookingModal isOpen={isBookingOpen} onClose={closeBookingModal} />
    </div>
  );
}
