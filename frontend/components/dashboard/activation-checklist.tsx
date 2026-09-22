'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, ArrowRight, Rocket } from 'lucide-react';
import type { ActivationState } from '@/services/dashboard.service';

/**
 * Guides a brand-new account to the point where the AI receptionist can
 * actually answer a call.
 *
 * This replaces the old behaviour where an empty account displayed fabricated
 * KPI fallbacks (5 customers, 4 leads, 142 minutes used, "charismatalk",
 * "Dallas, TX"), which told a new user nothing about what to do next and broke
 * trust the moment they noticed the numbers were invented.
 */
export function ActivationChecklist({ activation }: { activation: ActivationState }) {
  const { steps, completedCount, totalCount } = activation;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const nextStep = steps.find((s) => !s.done);

  if (completedCount === totalCount) return null;

  return (
    <section
      aria-labelledby="activation-heading"
      className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-white p-5 shadow-xs"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Rocket className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 id="activation-heading" className="text-sm font-bold text-slate-900">
              Finish setting up your AI receptionist
            </h2>
            <p className="text-xs text-slate-600">
              {nextStep
                ? `Next: ${nextStep.label.toLowerCase()}.`
                : 'You are all set.'}{' '}
              Until a phone number is connected, no calls can be answered.
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xs font-semibold text-slate-700">
            {completedCount} of {totalCount} complete
          </div>
          <div
            className="mt-1.5 h-2 w-36 overflow-hidden rounded-full bg-blue-100"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={`group flex items-start gap-2.5 rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                step.done
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              {step.done ? (
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
              )}

              <span className="min-w-0 flex-1">
                <span
                  className={`block text-xs font-semibold ${
                    step.done ? 'text-emerald-800 line-through decoration-emerald-400' : 'text-slate-900'
                  }`}
                >
                  {step.label}
                  <span className="sr-only">{step.done ? ' (completed)' : ' (not completed)'}</span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                  {step.description}
                </span>
              </span>

              {!step.done && (
                <ArrowRight
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-blue-600"
                  aria-hidden="true"
                />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
