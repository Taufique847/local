'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthService } from '@/services/auth.service';
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
import { AlertCircle, ArrowRight, CheckCircle2, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});

  // Redirect after success so the user lands on a login form with the new password
  // fresh in mind. The reset revoked every session, so there is nothing to return to.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.push('/login'), 2500);
    return () => clearTimeout(t);
  }, [done, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const errors: { password?: string; confirm?: string } = {};
    if (!password) {
      errors.password = 'Choose a password';
    } else if (password.length < 8) {
      errors.password = 'Must be at least 8 characters';
    } else if (password.length > 72) {
      // Matches the server: bcrypt truncates past 72 bytes, so a longer
      // passphrase would not be fully applied.
      errors.password = 'Must be 72 characters or fewer';
    }
    if (confirm !== password) {
      errors.confirm = 'Passwords do not match';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || isLoading) return;

    setIsLoading(true);
    try {
      await AuthService.resetPassword(token, password);
      setDone(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'This reset link is invalid or has expired.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <a href="/" className="inline-flex items-center gap-2.5 group">
          <div className="h-9 w-9 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-base shadow-sm group-hover:bg-sky-700 transition-colors">
            BC
          </div>
          <span className="text-2xl font-bold text-slate-900 tracking-tight">BlueCollar AI</span>
        </a>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl overflow-hidden">
          {!token ? (
            <CardHeader className="space-y-1.5 px-6 py-6">
              <CardTitle className="text-xl font-semibold text-slate-900">
                Link is incomplete
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                This page needs the token from your reset email. Open the link from the message
                directly, or{' '}
                <a href="/forgot-password" className="font-semibold text-sky-700 hover:underline">
                  request a new one
                </a>
                .
              </CardDescription>
            </CardHeader>
          ) : done ? (
            <CardHeader className="space-y-1.5 px-6 py-6">
              <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-1">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <CardTitle className="text-xl font-semibold text-slate-900">
                Password changed
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                You have been signed out on every device, which is deliberate — if someone else had
                access to this account, they no longer do. Taking you to sign in...
              </CardDescription>
            </CardHeader>
          ) : (
            <>
              <CardHeader className="space-y-1.5 px-6 pt-6 pb-4">
                <CardTitle className="text-xl font-semibold text-slate-900">
                  Choose a new password
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  Pick something you have not used here before. This will sign you out everywhere
                  else.
                </CardDescription>
              </CardHeader>

              <CardContent className="px-6 py-2 space-y-4">
                {errorMessage && (
                  <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200/90 flex items-start gap-2.5 text-rose-800 text-xs">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1.5">
                      <span className="font-medium leading-relaxed block">{errorMessage}</span>
                      <a
                        href="/forgot-password"
                        className="font-semibold text-rose-900 hover:underline"
                      >
                        Request a new link
                      </a>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      New password
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
                        disabled={isLoading}
                        error={fieldErrors.password}
                        className="pl-9 text-sm"
                        autoComplete="new-password"
                        autoFocus
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
                        disabled={isLoading}
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
                    disabled={isLoading}
                    isLoading={isLoading}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 rounded-lg shadow-sm transition-all active:scale-[0.99] gap-2 mt-2"
                  >
                    <span>{isLoading ? 'Saving...' : 'Set new password'}</span>
                    {!isLoading && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          <CardFooter className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-center text-xs text-slate-600">
            <a href="/login" className="font-semibold text-sky-700 hover:text-sky-800 hover:underline">
              Back to sign in
            </a>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
