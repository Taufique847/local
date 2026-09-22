'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Error boundary scoped to the authenticated dashboard. Keeps a failure on one
 * page (say, a bad API response on /app/invoices) from taking down the whole
 * app shell.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard route error:', error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600"
          aria-hidden="true"
        >
          <AlertTriangle className="h-5 w-5" />
        </div>

        <div className="space-y-1">
          <h1 className="text-base font-bold text-slate-900">This page failed to load</h1>
          <p className="text-xs text-slate-600">
            Nothing was lost. Retry, or head back to your dashboard.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
          <Link
            href="/app"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Dashboard
          </Link>
        </div>

        {error.digest && (
          <p className="font-mono text-[11px] text-slate-400">Reference: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
