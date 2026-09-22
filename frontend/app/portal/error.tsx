'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Error boundary for the public customer portal (quotes and invoices).
 *
 * Deliberately gives homeowners no links into the authenticated app, and no
 * technical detail — they are not users of the product, just recipients of a
 * document link.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Customer portal error:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600"
          aria-hidden="true"
        >
          <AlertTriangle className="h-5 w-5" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-slate-900">This document could not be opened</h1>
          <p className="text-sm text-slate-600">
            The link may have expired. Please contact your contractor for an up-to-date link.
          </p>
        </div>

        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    </main>
  );
}
