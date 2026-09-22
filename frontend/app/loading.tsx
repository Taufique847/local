import React from 'react';

/**
 * Route-transition fallback. Purely presentational; `role="status"` announces
 * the pending navigation to screen readers.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-slate-50"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
          aria-hidden="true"
        />
        <span>Loading…</span>
      </div>
    </div>
  );
}
