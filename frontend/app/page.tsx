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

export default function LandingPage() {
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  const openBookingModal = () => setIsBookingOpen(true);
  const closeBookingModal = () => setIsBookingOpen(false);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col selection:bg-blue-600 selection:text-white font-sans antialiased">
      
      {/* 1. Clean Frosted Navbar */}
      <Navbar onOpenBookingModal={openBookingModal} />

      {/* 2. Hero Section + Interactive Voice Demo Player */}
      <HeroSection onOpenBookingModal={openBookingModal} />

      {/* 3. 5-Engine Bento Grid (Light Enterprise Cards) */}
      <BentoGrid onOpenBookingModal={openBookingModal} />

      {/* 4. Google 5-Star Reputation Shield Simulator */}
      <ReputationShieldDemo onOpenBookingModal={openBookingModal} />

      {/* 5. Contractor ROI Revenue Calculator */}
      <RoiCalculator onOpenBookingModal={openBookingModal} />

      {/* 6. Module 26: Pricing & Plans ($299, $799, $1,499) */}
      <PricingSection onOpenBookingModal={openBookingModal} />

      {/* 7. Side-by-Side Competitor Comparison */}
      <ComparisonTable onOpenBookingModal={openBookingModal} />

      {/* 8. Corporate Footer with Live Telemetry Ping */}
      <Footer />

      {/* 8. Demo Booking Modal (React Hook Form + Zod) */}
      <BookingModal isOpen={isBookingOpen} onClose={closeBookingModal} />

    </div>
  );
}
