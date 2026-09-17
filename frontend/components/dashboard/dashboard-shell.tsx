'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { BusinessService } from '@/services/business.service';
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
  const [isLoadingBusiness, setIsLoadingBusiness] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadBusiness() {
      try {
        const res = await BusinessService.getMyBusiness();
        if (isMounted) {
          if (res) {
            setBusiness(res);
            // If onboarding is not completed, redirect to onboarding
            if (res.onboardingStatus !== 'completed') {
              router.push('/onboarding');
            }
          } else {
            // No business created yet -> redirect to onboarding wizard
            router.push('/onboarding');
          }
        }
      } catch (err) {
        console.error('Failed to load business profile:', err);
      } finally {
        if (isMounted) {
          setIsLoadingBusiness(false);
        }
      }
    }

    loadBusiness();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50 flex text-slate-900 font-sans antialiased">
        {/* Persistent Desktop Sidebar & Mobile Drawer */}
        <Sidebar 
          mobileOpen={mobileOpen} 
          onCloseMobile={() => setMobileOpen(false)} 
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
          <Header
            business={business}
            onOpenMobileMenu={() => setMobileOpen(true)}
            title={title}
            subtitle={subtitle}
          />

          <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
