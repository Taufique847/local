'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { savePlanIntent, readPlanIntent } from '@/lib/plan-intent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { AlertCircle, Lock, Mail, User as UserIcon, ArrowRight, ShieldCheck } from 'lucide-react';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro Fleet',
  enterprise: 'Enterprise',
};

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signup, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // A plan chosen on the marketing site arrives as ?plan=&interval=. Persist it
  // so it survives signup and onboarding and can become a checkout session.
  const planParam = searchParams.get('plan');
  const intervalParam = searchParams.get('interval');

  useEffect(() => {
    if (planParam) savePlanIntent(planParam, intervalParam ?? 'month');
  }, [planParam, intervalParam]);

  const selectedPlan = planParam ?? readPlanIntent()?.tier ?? null;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  // If already authenticated, redirect to /app
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.push('/app');
    }
  }, [isAuthLoading, isAuthenticated, router]);

  const validate = (): boolean => {
    const errors: {
      name?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};

    if (!name.trim()) {
      errors.name = 'Full name is required';
    }

    if (!email.trim()) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters long';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm your password';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validate() || isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      // A brand-new account has no business yet, so go straight to onboarding
      // instead of bouncing off /app's redirect after a flash of the shell.
      router.push('/onboarding');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <a href="/" className="inline-flex items-center gap-2.5 group">
          <div className="h-9 w-9 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-base shadow-sm group-hover:bg-sky-700 transition-colors">
            BC
          </div>
          <span className="text-2xl font-bold text-slate-900 tracking-tight">BlueCollar AI</span>
        </a>
      </div>

      {/* Auth Card Container */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Card className="bg-white border-slate-200/90 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="space-y-1.5 px-6 pt-6 pb-4">
            <CardTitle className="text-xl font-semibold text-slate-900">
              Create your account
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              {selectedPlan
                ? `Your ${PLAN_LABELS[selectedPlan] ?? selectedPlan} trial starts as soon as your account is ready. No card needed today.`
                : 'Start your free trial. No credit card required.'}
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
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Full name
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="e.g. David Miller"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    disabled={isLoading}
                    error={fieldErrors.name}
                    className="pl-9 text-sm"
                    autoFocus
                  />
                  <UserIcon className="h-4 w-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
                {fieldErrors.name && (
                  <p className="text-xs text-rose-600 font-medium">{fieldErrors.name}</p>
                )}
              </div>

              {/* Email Address */}
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
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    disabled={isLoading}
                    error={fieldErrors.email}
                    className="pl-9 text-sm"
                    autoComplete="email"
                  />
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
                {fieldErrors.email && (
                  <p className="text-xs text-rose-600 font-medium">{fieldErrors.email}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <Input
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    disabled={isLoading}
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

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Confirm password
                </label>
                <div className="relative">
                  <Input
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                    }}
                    disabled={isLoading}
                    error={fieldErrors.confirmPassword}
                    className="pl-9 text-sm"
                    autoComplete="new-password"
                  />
                  <ShieldCheck className="h-4 w-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="text-xs text-rose-600 font-medium">{fieldErrors.confirmPassword}</p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoading}
                isLoading={isLoading}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 rounded-lg shadow-sm transition-all active:scale-[0.99] gap-2 mt-2"
              >
                <span>{isLoading ? 'Creating account...' : 'Create account'}</span>
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-center text-xs text-slate-600">
            <span>Already have an account?</span>
            <a href="/login" className="ml-1.5 font-semibold text-sky-700 hover:text-sky-800 hover:underline">
              Sign in
            </a>
          </CardFooter>
        </Card>

        {/* Footer Note */}
        <p className="text-center text-xs text-slate-400 mt-6 font-mono">
          BlueCollar AI &bull; Enterprise B2B SaaS Platform
        </p>
      </div>
    </div>
  );
}
