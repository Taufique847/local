'use client';

import React, { useState } from 'react';
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
import { AlertCircle, ArrowLeft, ArrowRight, Mail, MailCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFieldError('Enter a valid email address');
      return;
    }
    if (isLoading) return;

    setIsLoading(true);
    try {
      await AuthService.forgotPassword(trimmed);
      setSubmitted(true);
    } catch (err: unknown) {
      // Only transport and throttling failures reach here — the server answers
      // 200 whether or not the address is registered.
      const message =
        err instanceof Error ? err.message : 'Could not send the reset link. Try again.';
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
          {submitted ? (
            <>
              <CardHeader className="space-y-1.5 px-6 pt-6 pb-4">
                <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-1">
                  <MailCheck className="h-5 w-5 text-emerald-600" />
                </div>
                <CardTitle className="text-xl font-semibold text-slate-900">
                  Check your inbox
                </CardTitle>
                {/*
                  Worded to match what the server actually did. It does not reveal
                  whether the address has an account, so promising "we sent you an
                  email" would be a claim the response cannot support.
                */}
                <CardDescription className="text-sm text-slate-500">
                  If an account exists for <span className="font-medium text-slate-700">{email.trim()}</span>,
                  a password reset link is on its way. The link expires in one hour and can only be
                  used once.
                </CardDescription>
              </CardHeader>

              <CardContent className="px-6 py-2 space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Nothing arrived? Check the spam folder, and confirm you typed the same address you
                  signed up with.
                </p>
                <Button
                  onClick={() => {
                    setSubmitted(false);
                    setErrorMessage(null);
                  }}
                  className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium py-2.5 rounded-lg transition-all"
                >
                  Try a different address
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="space-y-1.5 px-6 pt-6 pb-4">
                <CardTitle className="text-xl font-semibold text-slate-900">
                  Reset your password
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  Enter the email address on your account and we will send you a link to choose a new
                  password.
                </CardDescription>
              </CardHeader>

              <CardContent className="px-6 py-2 space-y-4">
                {errorMessage && (
                  <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200/90 flex items-start gap-2.5 text-rose-800 text-xs">
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Email address
                    </label>
                    <div className="relative">
                      <Input
                        type="email"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldError) setFieldError(undefined);
                        }}
                        disabled={isLoading}
                        error={fieldError}
                        className="pl-9 text-sm"
                        autoComplete="email"
                        autoFocus
                      />
                      <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    </div>
                    {fieldError && (
                      <p className="text-xs text-rose-600 font-medium">{fieldError}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    isLoading={isLoading}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 rounded-lg shadow-sm transition-all active:scale-[0.99] gap-2 mt-2"
                  >
                    <span>{isLoading ? 'Sending...' : 'Send reset link'}</span>
                    {!isLoading && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          <CardFooter className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-center text-xs text-slate-600">
            <a
              href="/login"
              className="inline-flex items-center gap-1.5 font-semibold text-sky-700 hover:text-sky-800 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </a>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
