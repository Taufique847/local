'use client';

import React, { useMemo, useState } from 'react';
import { Copy, Check, PhoneForwarded, Info, ExternalLink } from 'lucide-react';

/**
 * Carrier call-forwarding instructions.
 *
 * This is the single biggest onboarding blocker for this market: a contractor
 * with a fifteen-year-old number printed on their trucks and ranking in Google
 * Maps will not swap it for a new one. Forwarding lets them keep it and still
 * have the AI answer.
 *
 * Codes are the standard GSM/CDMA supplementary-service codes used by US
 * carriers. `dial` is the sequence to activate, `cancel` deactivates.
 */
interface Carrier {
  id: string;
  name: string;
  /** Template where {{number}} is replaced with the destination line. */
  dial: string;
  cancel: string;
  note?: string;
}

const CARRIERS: Carrier[] = [
  {
    id: 'verizon',
    name: 'Verizon',
    dial: '*72{{number}}',
    cancel: '*73',
    note: 'Dial the code, wait for the confirmation tone, then hang up.',
  },
  {
    id: 'att',
    name: 'AT&T',
    dial: '*21*{{number}}#',
    cancel: '#21#',
    note: 'Forwards all calls immediately, including when your phone is on.',
  },
  {
    id: 'tmobile',
    name: 'T-Mobile',
    dial: '**21*{{number}}#',
    cancel: '##21#',
    note: 'Press the call button after entering the code.',
  },
  {
    id: 'usmobile',
    name: 'US Cellular / other GSM',
    dial: '*72{{number}}',
    cancel: '*720',
  },
  {
    id: 'landline',
    name: 'Landline / VoIP (Comcast, Spectrum)',
    dial: '*72{{number}}',
    cancel: '*73',
    note: 'On most business landlines you must dial from the main line itself.',
  },
  {
    id: 'googlevoice',
    name: 'Google Voice',
    dial: '',
    cancel: '',
    note: 'Google Voice has no dial code. Open voice.google.com → Settings → Calls → Call forwarding, and add the number below as a forwarding destination.',
  },
];

/** Formats +13125550101 as (312) 555-0101 for readability. */
const formatUsNumber = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

/** Dial codes need bare digits, not formatting characters. */
const dialDigits = (raw: string): string => raw.replace(/\D/g, '').slice(-10);

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked by permissions; the code is visible on screen
      // anyway, so this is a non-critical enhancement.
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" aria-hidden="true" /> Copy
        </>
      )}
    </button>
  );
}

export function CallForwardingWizard({
  aiPhoneNumber,
  className = '',
}: {
  /** The BlueCollar AI line callers should be forwarded to. */
  aiPhoneNumber?: string | null;
  className?: string;
}) {
  const [carrierId, setCarrierId] = useState<string>('verizon');

  const carrier = CARRIERS.find((c) => c.id === carrierId) ?? CARRIERS[0];
  const digits = aiPhoneNumber ? dialDigits(aiPhoneNumber) : '';

  const dialCode = useMemo(
    () => (carrier.dial && digits ? carrier.dial.replace('{{number}}', digits) : ''),
    [carrier.dial, digits]
  );

  if (!aiPhoneNumber) {
    return (
      <div
        className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 ${className}`}
      >
        <p className="font-semibold text-slate-800">Keep your existing business number</p>
        <p className="mt-1 leading-relaxed">
          Connect an AI line first. Then you can forward your current number to it, so the number on
          your trucks and Google listing never changes.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="forwarding-heading"
      className={`rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`}
    >
      <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <PhoneForwarded className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <h3 id="forwarding-heading" className="text-sm font-bold text-slate-900">
            Keep your existing number
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Forward your current business line to your AI line. Your printed number never changes.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="forwarding-carrier"
            className="mb-1 block text-xs font-semibold text-slate-700"
          >
            Who is your carrier?
          </label>
          <select
            id="forwarding-carrier"
            value={carrierId}
            onChange={(e) => setCarrierId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600"
          >
            {CARRIERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            Forward to your AI line
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="font-mono text-base font-bold text-blue-950">
              {formatUsNumber(aiPhoneNumber)}
            </span>
            <CopyButton value={digits} label="AI phone number" />
          </div>
        </div>

        {carrier.id === 'googlevoice' ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="leading-relaxed">{carrier.note}</p>
            <a
              href="https://voice.google.com/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
            >
              Open Google Voice settings
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <ol className="space-y-2.5">
            <li className="flex gap-3">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                1
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900">
                  From your business phone, dial this exactly
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <code className="font-mono text-sm font-bold text-slate-900">{dialCode}</code>
                  <CopyButton value={dialCode} label="forwarding code" />
                </div>
              </div>
            </li>

            <li className="flex gap-3">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                2
              </span>
              <p className="text-xs text-slate-700">
                {carrier.note || 'Wait for the confirmation tone, then hang up.'}
              </p>
            </li>

            <li className="flex gap-3">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white"
                aria-hidden="true"
              >
                3
              </span>
              <p className="text-xs text-slate-700">
                Call your business number from a different phone. The AI should pick up.
              </p>
            </li>
          </ol>
        )}

        {carrier.cancel && (
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <p className="text-[11px] text-slate-600">
              To turn forwarding off later, dial{' '}
              <code className="rounded bg-white px-1 py-0.5 font-mono font-semibold text-slate-900">
                {carrier.cancel}
              </code>{' '}
              from the same phone.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
