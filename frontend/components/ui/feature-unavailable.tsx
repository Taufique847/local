import React from 'react';
import Link from 'next/link';
import { Construction, ArrowLeft } from 'lucide-react';

/**
 * Honest placeholder for a feature that is designed but not built.
 *
 * Used to replace screens that previously rendered convincing hardcoded data
 * (fake branch lists, fake connected calendar accounts, fake sync logs). Showing
 * invented data as if it were real is worse than showing nothing: an operator
 * will make decisions on it, and will stop trusting the rest of the product the
 * moment they notice.
 */
export function FeatureUnavailable({
  title,
  description,
  plannedCapabilities,
  backHref = '/app/settings',
  backLabel = 'Back to settings',
}: {
  title: string;
  description: string;
  plannedCapabilities?: string[];
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-xl py-8">
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs sm:p-8">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600"
          aria-hidden="true"
        >
          <Construction className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Not available yet
          </span>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="mx-auto max-w-md text-sm text-slate-600">{description}</p>
        </div>

        {plannedCapabilities && plannedCapabilities.length > 0 && (
          <ul className="mx-auto max-w-sm space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
            {plannedCapabilities.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-slate-600">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
