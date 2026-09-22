'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

/**
 * Route-level error boundary.
 *
 * Without this, any thrown render error showed Next.js's default error screen —
 * in production a blank page with no way back. This gives the user a retry, a
 * route home, and a digest they can quote to support.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with your error tracker (Sentry etc.) when one is configured.
    console.error('Unhandled route error:', error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-16"
    >
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600"
          aria-hidden="true"
        >
          <AlertTriangle className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
          <p className="text-sm text-slate-600">
            This page hit an unexpected error. Your data is safe — try loading it again.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/app"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Go to dashboard
          </Link>
        </div>

        {error.digest && (
          <p className="border-t border-slate-100 pt-3 font-mono text-[11px] text-slate-400">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
