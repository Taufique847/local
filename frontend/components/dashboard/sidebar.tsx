'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  UserPlus,
  Calendar,
  Wrench,
  Clock,
  Settings,
  BookOpen,
  CreditCard,
  Bot,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  LogOut,
  X,
} from 'lucide-react';
import { Business } from '@/types/business';

interface SidebarProps {
  business?: Business | null;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: string;
  badgeColor?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export function Sidebar({ business, mobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();

  const companyName = business?.name || 'Apex Heating & AC';
  const companyInitials = companyName
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .substring(0, 2) || 'BC';

  const navGroups: NavGroup[] = [
    {
      title: 'OPERATIONS',
      items: [
        { name: 'Dashboard', href: '/app', icon: LayoutDashboard, exact: true },
        { name: 'Live Calls & Audio', href: '/app/calls', icon: PhoneCall },
        { name: 'Field Appointments', href: '/app/appointments', icon: Calendar },
        { name: 'Leads & Pipeline', href: '/app/leads', icon: UserPlus },
        { name: 'Customers CRM', href: '/app/customers', icon: Users },
      ],
    },
    {
      title: 'AI & TELEPHONY',
      items: [
        { name: 'Phone Line & Routing', href: '/app/settings/phone', icon: PhoneCall, badge: 'Live', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
        { name: 'AI Policies & RAG', href: '/app/settings', icon: BookOpen },
        { name: 'Services & Pricing', href: '/app/services', icon: Wrench },
      ],
    },
    {
      title: 'FINANCIALS & ACCOUNT',
      items: [
        { name: 'Billing & Stripe Plans', href: '/app/billing', icon: CreditCard, badge: 'Pro', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200' },
        { name: 'Business Onboarding', href: '/onboarding', icon: Clock },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200/90 w-64 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200/80 shrink-0">
        <Link href="/app" className="flex items-center gap-3 group">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-sm group-hover:bg-blue-700 transition-colors">
            BC
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black text-slate-900 tracking-tight">BlueCollar AI</span>
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            </div>
            <span className="block text-[10px] font-mono text-slate-400 leading-none mt-0.5">
              HVAC Dispatch OS
            </span>
          </div>
        </Link>

        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <h3 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {group.title}
            </h3>
            <div className="space-y-1 pt-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href) && item.href !== '#';

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => {
                      if (onCloseMobile) onCloseMobile();
                    }}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-blue-50/80 text-blue-700 font-semibold shadow-2xs border-l-3 border-blue-600'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`h-4 w-4 transition-colors ${
                          isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                      <span>{item.name}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border ${
                          item.badgeColor || 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User Profile & Subscription Footer Card */}
      <div className="p-3.5 border-t border-slate-200/80 shrink-0 bg-slate-50/70">
        <Link
          href="/app/billing"
          className="p-2.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all block space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                {companyInitials}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-900 truncate block group-hover:text-blue-600 transition-colors">
                  {companyName}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono leading-none mt-0.5">
                  Owner Portal
                </span>
              </div>
            </div>

            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
              Pro Fleet
            </span>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span className="flex items-center gap-1 font-medium text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Stripe Active
            </span>
            <span className="text-blue-600 group-hover:underline flex items-center gap-0.5 font-semibold">
              Manage &rarr;
            </span>
          </div>
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Persistent) */}
      <aside className="hidden lg:flex flex-col shrink-0 h-screen sticky top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Slide-Over) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-xl z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
