'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Business } from '@/types/business';
import { SubscriptionData } from '@/services/billing.service';
import { Menu, LogOut, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  business: Business | null;
  subscription?: SubscriptionData | null;
  onOpenMobileMenu: () => void;
  title?: string;
  subtitle?: string;
}

export function Header({
  business,
  subscription,
  onOpenMobileMenu,
  title,
  subtitle,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2)
    : 'BO';

  // Trial countdown, derived from the real subscription rather than assumed.
  const trialDaysLeft =
    subscription?.status === 'trialing' && subscription.trialEndsAt
      ? Math.max(
          0,
          Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / 86_400_000)
        )
      : null;

  const needsBilling =
    subscription?.status === 'past_due' ||
    subscription?.status === 'canceled' ||
    subscription?.status === 'incomplete';

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between transition-colors">
      {/* Left section: mobile hamburger + current context */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          {title ? (
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <span className="hidden md:inline-block text-xs text-slate-500 font-normal">
                  — {subtitle}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 text-sm sm:text-base tracking-tight">
                {business?.name || 'Operations'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Right section: Date, Business Status indicator, User profile, Logout */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Date pill */}
        <div className="hidden md:flex items-center text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
          <span>{todayFormatted}</span>
        </div>

        {/* Billing status. Replaces the previous hardcoded "AI Employee: Ready"
            pill and the mock Dallas/Fort Worth branch switcher, neither of which
            reflected any real state. */}
        {needsBilling ? (
          <Link
            href="/app/billing"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Billing needs attention</span>
          </Link>
        ) : trialDaysLeft !== null ? (
          <Link
            href="/app/billing"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              Trial: {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left
            </span>
          </Link>
        ) : null}

        {/* User initials / Avatar */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-semibold tracking-wider shadow-sm">
            {userInitials}
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-900 leading-tight">
              {user?.name || 'Owner'}
            </span>
            <span className="text-[11px] text-slate-500 truncate max-w-[120px] leading-tight">
              {user?.email}
            </span>
          </div>

          {/* Quick Logout Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 h-8 w-8 rounded-lg ml-1"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
