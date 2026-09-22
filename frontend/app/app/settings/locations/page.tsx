'use client';

import React from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { FeatureUnavailable } from '@/components/ui/feature-unavailable';

/**
 * Multi-location management.
 *
 * This page previously rendered a hardcoded `MOCK_BRANCHES` array — two invented
 * Dallas / Fort Worth branches with fake technician counts and call volumes —
 * presented as if it were live data. Nothing on it was wired to the backend, and
 * there is no multi-location model in the database.
 *
 * Until that exists, contractors are served by the service-zone routing on the
 * settings page, which IS real.
 */
export default function LocationsSettingsPage() {
  return (
    <DashboardShell title="Multi-Location" subtitle="Manage branches and territories">
      <FeatureUnavailable
        title="Multi-location support is not ready yet"
        description="Your workspace currently runs as a single business with one service area. Multi-branch routing needs changes to how customers, technicians and phone numbers are grouped, and we would rather ship it properly than fake it."
        plannedCapabilities={[
          'Separate branches with their own phone numbers and business hours',
          'Route each caller to the nearest branch by ZIP code',
          'Per-branch revenue, call volume and technician reporting',
        ]}
      />

      <p className="mx-auto max-w-xl pb-8 text-center text-xs text-slate-500">
        Need territory routing today? Set up{' '}
        <a href="/app/settings" className="font-semibold text-blue-600 hover:underline">
          service zones
        </a>{' '}
        to match callers to the right technician by ZIP code.
      </p>
    </DashboardShell>
  );
}
