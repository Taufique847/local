'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { apiClient, toErrorMessage } from '@/lib/api-client';

type State = 'working' | 'done' | 'failed' | 'missing';

/**
 * Landing page for the link in the verification email.
 *
 * The token in the query string is the credential, so this page works without a
 * session — the recipient opens it from their mail client, which is the whole
 * point of the check.
 */
function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<State>('working');
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback(async (value: string) => {
    setState('working');
    setError(null);
    try {
      await apiClient.post('/api/auth/verify-email/confirm', { token: value });
      setState('done');
    } catch (err) {
      setError(toErrorMessage(err, 'This verification link could not be used.'));
      setState('failed');
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setState('missing');
      return;
    }
    void confirm(token);
  }, [token, confirm]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        {state === 'working' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
            <h1 className="text-lg font-bold text-slate-900">Confirming your email…</h1>
          </div>
        )}

        {state === 'done' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" aria-hidden="true" />
            <h1 className="text-lg font-bold text-slate-900">Email confirmed</h1>
            <p className="text-sm text-slate-600">
              Your address is verified. You can sign in and carry on setting up your AI
              receptionist.
            </p>
            <Link
              href="/login"
              className="mt-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
            >
              Go to sign in
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        )}

        {(state === 'failed' || state === 'missing') && (
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-9 w-9 text-amber-600" aria-hidden="true" />
            <h1 className="text-lg font-bold text-slate-900">
              {state === 'missing' ? 'Nothing to confirm' : 'Link did not work'}
            </h1>
            <p role="alert" className="text-sm text-slate-600">
              {state === 'missing'
                ? 'This page needs the link from your verification email.'
                : error}
            </p>
            <p className="text-xs text-slate-500">
              Verification links expire after 24 hours, and only the most recent one works. Sign
              in and request a new one from your account settings.
            </p>
            <Link
              href="/login"
              className="mt-2 inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              Go to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
        </main>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
