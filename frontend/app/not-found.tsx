import React from 'react';
import Link from 'next/link';
import { Compass, Home, LayoutDashboard } from 'lucide-react';

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

/**
 * 404 page. Previously missing, so unknown URLs rendered Next.js's unstyled
 * default with no navigation back into the product.
 */
export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-16"
    >
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500"
          aria-hidden="true"
        >
          <Compass className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">404</p>
          <h1 className="text-xl font-bold text-slate-900">We could not find that page</h1>
          <p className="text-sm text-slate-600">
            The link may be out of date, or the page may have moved.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/app"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Go to dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
