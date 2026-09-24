'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient, toErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { AlertCircle, Check, Loader2, MailX } from 'lucide-react';

/**
 * Marketing email unsubscribe.
 *
 * Reached from the footer link and the `List-Unsubscribe` header in campaign email. No
 * login — the signed token in the URL is the only authorization factor, exactly like the
 * invoice and quote portal pages.
 *
 * **Loading this page does not unsubscribe anybody.** It reads a description and waits
 * for a click. Mail clients and security scanners prefetch links in email, so a page
 * that acted on load would opt out recipients who never touched it. The backend enforces
 * the same split: GET describes, POST acts.
 */

interface Preview {
  email: string;
  businessName: string;
  alreadyUnsubscribed: boolean;
}

export default function UnsubscribePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const json = await apiClient.get<Preview>(`/api/portal/unsubscribe/${token}`);
      setPreview(json);
      // A link used twice, or clicked after the mail client's one-click button already
      // fired, should read as done rather than as an error.
      if (json.alreadyUnsubscribed) setDone(true);
    } catch (err) {
      setError(toErrorMessage(err, 'This unsubscribe link is not valid.'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post<{ success: boolean }>(`/api/portal/unsubscribe/${token}`, {});
      setDone(true);
    } catch (err) {
      setError(toErrorMessage(err, 'We could not complete that. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-600" aria-hidden="true" />
              <h1 className="text-lg font-bold text-slate-900">Link not valid</h1>
            </div>
            <p role="alert" className="text-sm text-slate-600">
              {error}
            </p>
            {/* Honest about the remedy rather than offering a retry that cannot work. */}
            <p className="text-xs text-slate-500">
              If you keep receiving email you did not ask for, reply to any message from the
              business and ask them to remove you.
            </p>
          </div>
        ) : done ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <h1 className="text-lg font-bold text-slate-900">You&apos;re unsubscribed</h1>
            </div>
            <p className="text-sm text-slate-600">
              <span className="font-medium">{preview?.email}</span> will no longer receive
              marketing email from {preview?.businessName}.
            </p>
            {/*
              Stated plainly, because the alternative is a customer who unsubscribed and
              then thinks the business has stopped sending their invoices.
            */}
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              You will still get email about things you asked for — appointment
              confirmations and reminders, quotes, invoices and payment receipts. To change
              those, contact {preview?.businessName} directly.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MailX className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <h1 className="text-lg font-bold text-slate-900">Unsubscribe</h1>
            </div>

            <p className="text-sm text-slate-600">
              Stop sending marketing email to{' '}
              <span className="font-medium">{preview?.email}</span> from{' '}
              <span className="font-medium">{preview?.businessName}</span>?
            </p>

            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              You will still receive email about things you asked for — appointment
              confirmations and reminders, quotes, invoices and payment receipts.
            </p>

            <Button onClick={confirm} disabled={submitting} className="w-full">
              {submitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <MailX className="mr-1.5 h-4 w-4" />
              )}
              Unsubscribe
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
