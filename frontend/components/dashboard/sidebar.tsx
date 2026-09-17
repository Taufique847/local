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
  Briefcase, 
  MessageSquare, 
  Bot, 
  Wrench, 
  Clock, 
  Settings,
  X
} from 'lucide-react';

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();

  const navGroups: NavGroup[] = [
    {
      title: 'MAIN',
      items: [
        { name: 'Dashboard', href: '/app', icon: LayoutDashboard, exact: true },
      ],
    },
    {
      title: 'OPERATIONS',
      items: [
        { name: 'Customers', href: '/app/customers', icon: Users },
        { name: 'Leads', href: '/app/leads', icon: UserPlus },
        { name: 'Services', href: '/app/services', icon: Wrench },
        { name: 'Appointments', href: '/app/appointments', icon: Calendar },
        { name: 'Calls', href: '/app/calls', icon: PhoneCall },
        { name: 'Jobs', href: '#', icon: Briefcase, badge: 'Soon' },
      ],
    },
    {
      title: 'AI & TELEPHONY',
      items: [
        { name: 'Phone Line', href: '/app/settings/phone', icon: PhoneCall },
        { name: 'AI Employee', href: '#', icon: Bot, badge: 'M10' },
        { name: 'SMS Automation', href: '#', icon: MessageSquare, badge: 'M13' },
      ],
    },
    {
      title: 'BUSINESS CONFIG',
      items: [
        { name: 'Services & Rates', href: '/app/services', icon: Wrench },
        { name: 'Business Hours', href: '/onboarding', icon: Clock },
      ],
    },
    {
      title: 'SETTINGS',
      items: [
        { name: 'Phone Settings', href: '/app/settings/phone', icon: Settings },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 shrink-0">
        <Link href="/app" className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
            BC
          </div>
          <div>
            <span className="text-base font-bold text-slate-900 tracking-tight">BlueCollar AI</span>
            <span className="block text-[10px] font-mono text-slate-400 leading-none">HVAC Operations</span>
          </div>
        </Link>

        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
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
            <div className="space-y-0.5 pt-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href) && item.href !== '#';
                const isPlaceholder = item.href === '#';

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => {
                      if (onCloseMobile) onCloseMobile();
                    }}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-sky-50 text-sky-700 font-semibold shadow-2xs'
                        : isPlaceholder
                        ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-not-allowed opacity-80'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                      <span>{item.name}</span>
                    </div>

                    {item.badge && (
                      <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
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

      {/* Bottom Business Workspace Indicator */}
      <div className="p-4 border-t border-slate-200 shrink-0 bg-slate-50/50">
        <div className="flex items-center justify-between text-xs">
          <div className="space-y-0.5 truncate">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Workspace</span>
            <span className="font-semibold text-slate-800 truncate block">HVAC Operations</span>
          </div>
          <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Persistent) */}
      <aside className="hidden md:flex flex-col shrink-0 h-screen sticky top-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Slide-Over) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
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
