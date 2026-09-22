'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Total matching records, used for the "showing X of Y" label. */
  total?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  /** Describes what is being paged, e.g. "invoices". Used in the accessible label. */
  itemLabel?: string;
  disabled?: boolean;
}

/**
 * Page navigation for long lists.
 *
 * Rendered as a `<nav>` with an accessible name, and the current page is marked
 * with `aria-current` so screen reader users know where they are rather than
 * hearing a row of undifferentiated numbers.
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize = 20,
  onPageChange,
  itemLabel = 'results',
  disabled = false,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = total !== undefined ? Math.min(total, page * pageSize) : page * pageSize;

  /** Up to five page numbers centred on the current page. */
  const windowStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const windowEnd = Math.min(totalPages, windowStart + 4);
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd; p++) pages.push(p);

  const go = (target: number) => {
    if (disabled) return;
    const clamped = Math.min(totalPages, Math.max(1, target));
    if (clamped !== page) onPageChange(clamped);
  };

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3"
    >
      <p className="text-[11px] text-slate-500" aria-live="polite">
        {total !== undefined
          ? `Showing ${from}–${to} of ${total} ${itemLabel}`
          : `Page ${page} of ${totalPages}`}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={disabled || page <= 1}
          aria-label="Previous page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            disabled={disabled}
            aria-label={`Page ${p}`}
            aria-current={p === page ? 'page' : undefined}
            className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors ${
              p === page
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={disabled || page >= totalPages}
          aria-label="Next page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
