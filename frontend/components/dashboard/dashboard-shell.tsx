'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { BusinessService } from '@/services/business.service';
import { BillingService, SubscriptionData } from '@/services/billing.service';
import { Business } from '@/types/business';
import { ProtectedRoute } from '@/components/auth/protected-route';

interface DashboardShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function DashboardShell({ children, title, subtitle }: DashboardShellProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadShellData() {
      try {
        const res = await BusinessService.getMyBusiness();
        if (!isMounted) return;

        if (!res) {
          router.replace('/onboarding');
          return;
        }

        setBusiness(res);
        if (res.onboardingStatus !== 'completed') {
          router.replace('/onboarding');
          return;
        }

        // Subscription drives the real plan badge in the sidebar, which was
        // previously hardcoded to "Pro Fleet" / "Stripe Active" for every user.
        const sub = await BillingService.getSubscription().catch(() => null);
        if (isMounted) setSubscription(sub);
      } catch (err) {
        // Navigation failures here are non-fatal: ProtectedRoute handles the
        // unauthenticated case, and pages render their own error states.
        console.error('Failed to load workspace profile:', err);
      }
    }

    loadShellData();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50 flex text-slate-900 font-sans antialiased">
        {/* Persistent Desktop Sidebar & Mobile Drawer */}
        <Sidebar
          business={business}
          subscription={subscription}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <Header
            business={business}
            subscription={subscription}
            onOpenMobileMenu={() => setMobileOpen(true)}
            title={title}
            subtitle={subtitle}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
