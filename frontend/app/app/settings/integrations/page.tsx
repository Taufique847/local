'use client';

import React from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { FeatureUnavailable } from '@/components/ui/feature-unavailable';

/**
 * Calendar sync and third-party integrations.
 *
 * This page previously rendered hardcoded `MOCK_ACCOUNTS` and `MOCK_SYNC_LOG`
 * arrays showing a "connected" Google Calendar with a plausible sync history.
 * No OAuth flow, token storage, or sync worker exists, so every connection
 * status and log line on it was invented.
 *
 * Two-way calendar sync requires a Google/Microsoft OAuth app, encrypted refresh
 * token storage, webhook channel renewal and conflict resolution — none of which
 * is worth faking in the UI.
 */
export default function IntegrationsSettingsPage() {
  return (
    <DashboardShell title="Integrations" subtitle="Calendar sync and connected apps">
      <FeatureUnavailable
        title="Calendar sync is not connected yet"
        description="Appointments live in BlueCollar AI only. Two-way sync with Google Calendar and Outlook needs an approved OAuth application and a sync worker, and we are not going to show a connection that does not exist."
        plannedCapabilities={[
          'Two-way sync with Google Calendar and Outlook',
          'Block AI booking against events created outside BlueCollar AI',
          'Push technician assignments to their personal calendars',
        ]}
      />

      <p className="mx-auto max-w-xl pb-8 text-center text-xs text-slate-500">
        In the meantime, the AI books against availability held in{' '}
        <a href="/app/appointments" className="font-semibold text-blue-600 hover:underline">
          your BlueCollar calendar
        </a>
        , and your business hours control when slots are offered.
      </p>
    </DashboardShell>
  );
}
