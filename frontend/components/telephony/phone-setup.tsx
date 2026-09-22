'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Loader2,
  PhoneCall,
  CheckCircle2,
  AlertCircle,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TelephonyService } from '@/services/telephony.service';
import { toErrorMessage } from '@/lib/api-client';
import type { AvailablePhoneNumber, BusinessPhoneNumber } from '@/types/telephony';
import { CallForwardingWizard } from './call-forwarding-wizard';

/**
 * Connects a phone line to the workspace: buy a new local number, or register a
 * number the contractor already controls.
 *
 * Extracted into a shared component so the onboarding wizard and the settings
 * page drive the exact same flow. Onboarding previously had no telephony step at
 * all, so a "completed" account still had no line and could not answer calls.
 */
export function PhoneSetup({
  onConnected,
  compact = false,
}: {
  onConnected?: (number: BusinessPhoneNumber) => void;
  compact?: boolean;
}) {
  const [numbers, setNumbers] = useState<BusinessPhoneNumber[]>([]);
  const [loadingNumbers, setLoadingNumbers] = useState(true);

  const [areaCode, setAreaCode] = useState('');
  const [available, setAvailable] = useState<AvailablePhoneNumber[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [provisioning, setProvisioning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [mode, setMode] = useState<'buy' | 'existing'>('buy');
  const [existingNumber, setExistingNumber] = useState('');
  const [connectingExisting, setConnectingExisting] = useState(false);

  const loadNumbers = useCallback(async () => {
    try {
      const list = await TelephonyService.getPhoneNumbers();
      setNumbers(list);
    } catch (err) {
      setError(toErrorMessage(err, 'Could not load your phone numbers.'));
    } finally {
      setLoadingNumbers(false);
    }
  }, []);

  useEffect(() => {
    loadNumbers();
  }, [loadNumbers]);

  const primary = numbers.find((n) => n.isPrimary) ?? numbers[0] ?? null;

  const handleSearch = async () => {
    setError(null);
    setSearching(true);
    setSearched(false);
    try {
      const results = await TelephonyService.searchAvailableNumbers('US', areaCode || undefined);
      setAvailable(results);
      setSearched(true);
    } catch (err) {
      setError(toErrorMessage(err, 'Could not search for numbers.'));
    } finally {
      setSearching(false);
    }
  };

  const handleProvision = async (phoneNumber: string) => {
    setError(null);
    setNotice(null);
    setProvisioning(phoneNumber);
    try {
      const connected = await TelephonyService.provisionNumber(phoneNumber);
      setNotice(`${connected.phoneNumber} is connected and ready to take calls.`);
      setAvailable([]);
      setSearched(false);
      await loadNumbers();
      onConnected?.(connected);
    } catch (err) {
      // A 402 here means the plan's phone-number allowance is used up.
      setError(toErrorMessage(err, 'Could not connect that number.'));
    } finally {
      setProvisioning(null);
    }
  };

  const handleConnectExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const digits = existingNumber.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Enter a valid 10-digit US phone number.');
      return;
    }

    setConnectingExisting(true);
    try {
      const connected = await TelephonyService.assignNumber({
        phoneNumber: existingNumber,
        friendlyName: 'Existing business line',
      });
      setNotice(`${connected.phoneNumber} is connected.`);
      setExistingNumber('');
      await loadNumbers();
      onConnected?.(connected);
    } catch (err) {
      setError(toErrorMessage(err, 'Could not connect that number.'));
    } finally {
      setConnectingExisting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {/* Already-connected lines */}
      {loadingNumbers ? (
        <div className="h-16 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
      ) : numbers.length > 0 ? (
        <ul className="space-y-2">
          {numbers.map((n) => (
            <li
              key={n._id || n.phoneNumber}
              className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <PhoneCall className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold text-slate-900">
                    {n.phoneNumber}
                  </p>
                  {n.friendlyName && (
                    <p className="truncate text-[11px] text-slate-500">{n.friendlyName}</p>
                  )}
                </div>
              </div>
              {n.isPrimary && (
                <span className="shrink-0 rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                  Primary
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <p className="text-xs text-amber-800">
              <span className="font-bold">No line connected yet.</span> Until you connect one, the AI
              receptionist cannot answer any calls.
            </p>
          </div>
        </div>
      )}

      {/* Mode switch */}
      <div
        role="tablist"
        aria-label="How to connect a line"
        className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-semibold"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'buy'}
          onClick={() => setMode('buy')}
          className={`flex-1 rounded-lg px-3 py-1.5 transition-all ${
            mode === 'buy' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
          }`}
        >
          Get a new local number
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'existing'}
          onClick={() => setMode('existing')}
          className={`flex-1 rounded-lg px-3 py-1.5 transition-all ${
            mode === 'existing' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
          }`}
        >
          I already have a number
        </button>
      </div>

      {mode === 'buy' ? (
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="area-code" className="mb-1 block text-xs font-semibold text-slate-700">
                Preferred area code (optional)
              </label>
              <Input
                id="area-code"
                inputMode="numeric"
                maxLength={3}
                placeholder="312"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className="text-sm"
              />
            </div>
            <Button
              type="button"
              onClick={handleSearch}
              disabled={searching}
              className="h-10 shrink-0 gap-1.5 bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
            >
              {searching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Search
            </Button>
          </div>

          {searched && available.length === 0 && (
            <p className="text-xs text-slate-500">
              No numbers found for that area code. Try a different one.
            </p>
          )}

          {available.length > 0 && (
            <ul className="space-y-2">
              {available.map((n) => (
                <li
                  key={n.phoneNumber}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-slate-900">{n.friendlyName}</p>
                    <p className="text-[11px] text-slate-500">
                      {[n.locality, n.region].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => handleProvision(n.phoneNumber)}
                    disabled={provisioning !== null}
                    className="h-8 shrink-0 gap-1 bg-slate-900 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    {provisioning === n.phoneNumber ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Connect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <form onSubmit={handleConnectExisting} className="space-y-3" noValidate>
          <div>
            <label
              htmlFor="existing-number"
              className="mb-1 block text-xs font-semibold text-slate-700"
            >
              Your existing business number
            </label>
            <Input
              id="existing-number"
              type="tel"
              inputMode="tel"
              placeholder="(312) 555-0199"
              value={existingNumber}
              onChange={(e) => setExistingNumber(e.target.value)}
              className="text-sm"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Use this if the number is already on a Twilio account you control. Otherwise get a new
              line above and forward your existing number to it.
            </p>
          </div>
          <Button
            type="submit"
            disabled={connectingExisting}
            className="h-9 gap-1.5 bg-slate-900 text-xs font-bold text-white hover:bg-slate-800"
          >
            {connectingExisting && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            Connect this number
          </Button>
        </form>
      )}

      {!compact && <CallForwardingWizard aiPhoneNumber={primary?.phoneNumber} />}
    </div>
  );
}
