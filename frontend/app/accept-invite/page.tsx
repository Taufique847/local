'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TeamService, InvitePreview } from '@/services/team.service';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { AlertCircle, ArrowRight, Loader2, Lock, User as UserIcon } from 'lucide-react';

const ROLE_BLURB: Record<string, string> = {
  owner: 'full access, including billing and team management',
  dispatcher: 'day-to-day operations: calls, bookings, dispatch and invoicing',
  technician: 'the field app, showing only the jobs assigned to you',
};

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { checkAuth } = useAuth();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    password?: string;
    confirm?: string;
  }>({});

  const loadPreview = useCallback(async () => {
    if (!token) {
      setLoadError('This invitation link is incomplete. Open the link from your email directly.');
      setIsLoadingPreview(false);
      return;
    }

    try {
      // Reads the invite without consuming it, so reloading this page does not
      // burn the invitation.
      const data = await TeamService.peekInvite(token);
      setPreview(data);
      setName(data.name || '');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'This invitation link is invalid or has expired.';
      setLoadError(message);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const errors: { name?: string; password?: string; confirm?: string } = {};
    if (!name.trim() || name.trim().length < 2) {
      errors.name = 'Please enter your full name';
    }
    if (!password) {
      errors.password = 'Choose a password';
    } else if (password.length < 8) {
      errors.password = 'Must be at least 8 characters';
    } else if (password.length > 72) {
      errors.password = 'Must be 72 characters or fewer';
    }
    if (confirm !== password) {
      errors.confirm = 'Passwords do not match';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await TeamService.acceptInvite({ token, name: name.trim(), password });
      // The server signs the new member in, so refresh the context before
      // routing rather than sending them to a login form for credentials they
      // just created.
      await checkAuth();
      router.push(preview?.businessRole === 'technician' ? '/worker' : '/app');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Your account could not be created. Try again.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <div className="inline-flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
            BC
          </div>
          <span className="text-2xl font-bold text-slate-900 tracking-tight">BlueCollar AI</span>
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl overflow-hidden">
          {isLoadingPreview ? (
            <CardContent className="px-6 py-10 flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Checking your invitation...</span>
            </CardContent>
          ) : loadError ? (
            <>
              <CardHeader className="space-y-1.5 px-6 pt-6 pb-4">
                <div className="h-10 w-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mb-1">
                  <AlertCircle className="h-5 w-5 text-rose-600" />
                </div>
                <CardTitle className="text-xl font-semibold text-slate-900">
                  This invitation cannot be used
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">{loadError}</CardDescription>
              </CardHeader>
              <CardContent className="px-6 py-2">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Invitations expire after 7 days and can only be used once. Ask whoever invited you
                  to send a new one.
                </p>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1.5 px-6 pt-6 pb-4">
                <CardTitle className="text-xl font-semibold text-slate-900">
                  Join {preview?.businessName}
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  Set up your account for{' '}
                  <span className="font-medium text-slate-700">{preview?.email}</span>. You will join
                  as a{' '}
                  <span className="font-medium text-slate-700">{preview?.businessRole}</span> —{' '}
                  {ROLE_BLURB[preview?.businessRole || ''] || 'access scoped to your role'}.
                </CardDescription>
              </CardHeader>

              <CardContent className="px-6 py-2 space-y-4">
                {errorMessage && (
                  <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200/90 flex items-start gap-2.5 text-rose-800 text-xs">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">{errorMessage}</span>
                  </div>
                )}

                {/*
                  The email address is fixed by the invitation and is not editable.
                  Acceptance requires the exact address the link was sent to, so a
                  forwarded invite cannot be redeemed under someone else's identity.
                */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Email address
                  </label>
                  <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600 font-mono">
                    {preview?.email}
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Your name
                    </label>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="Jordan Reyes"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (fieldErrors.name)
                            setFieldErrors((prev) => ({ ...prev, name: undefined }));
                        }}
                        disabled={isSubmitting}
                        error={fieldErrors.name}
                        className="pl-9 text-sm"
                        autoComplete="name"
                        autoFocus
                      />
                      <UserIcon className="h-4 w-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    </div>
                    {fieldErrors.name && (
                      <p className="text-xs text-rose-600 font-medium">{fieldErrors.name}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Create a password
                    </label>
                    <div className="relative">
                      <Input
                        type="password"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (fieldErrors.password)
                            setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        }}
                        disabled={isSubmitting}
                        error={fieldErrors.password}
                        className="pl-9 text-sm"
                        autoComplete="new-password"
                      />
                      <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    </div>
                    {fieldErrors.password && (
                      <p className="text-xs text-rose-600 font-medium">{fieldErrors.password}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Confirm password
                    </label>
                    <div className="relative">
                      <Input
                        type="password"
                        placeholder="Type it again"
                        value={confirm}
                        onChange={(e) => {
                          setConfirm(e.target.value);
                          if (fieldErrors.confirm)
                            setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
                        }}
                        disabled={isSubmitting}
                        error={fieldErrors.confirm}
                        className="pl-9 text-sm"
                        autoComplete="new-password"
                      />
                      <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    </div>
                    {fieldErrors.confirm && (
                      <p className="text-xs text-rose-600 font-medium">{fieldErrors.confirm}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    isLoading={isSubmitting}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 rounded-lg shadow-sm transition-all active:scale-[0.99] gap-2 mt-2"
                  >
                    <span>{isSubmitting ? 'Creating account...' : 'Create account and continue'}</span>
                    {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          <CardFooter className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-center text-xs text-slate-600">
            <span>Already have an account?</span>
            <a href="/login" className="ml-1.5 font-semibold text-sky-700 hover:text-sky-800 hover:underline">
              Sign in
            </a>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
