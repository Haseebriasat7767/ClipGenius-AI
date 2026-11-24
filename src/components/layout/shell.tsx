'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Sparkles,
  Film,
  CreditCard,
  Settings,
  ShieldCheck,
  Plus,
  LogOut,
  Menu,
  X,
  Zap,
} from 'lucide-react';
import { cn, Progress, Spinner } from '@/components/ui';
import { api, useSession, type SessionUser, type PlanInfo, type UsageInfo } from '@/lib/client';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/projects/new', label: 'Create clips', icon: Sparkles },
  { href: '/clips', label: 'Clip library', icon: Film },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const ADMIN_NAV = [
  { href: '/admin', label: 'Overview', icon: ShieldCheck },
  { href: '/admin/users', label: 'Users', icon: ShieldCheck },
  { href: '/admin/jobs', label: 'Jobs', icon: ShieldCheck },
  { href: '/admin/payments', label: 'Payments', icon: ShieldCheck },
  { href: '/admin/usage', label: 'API usage', icon: ShieldCheck },
];

function SidebarContent({
  user,
  plan,
  usage,
  onNavigate,
}: {
  user: SessionUser;
  plan: PlanInfo | null;
  usage: UsageInfo | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const clipsPct = plan ? Math.min(100, ((usage?.clips_generated ?? 0) / plan.clipsPerMonth) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-2" onClick={onNavigate}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient shadow-glow">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-display text-lg font-bold leading-tight text-white">
            ClipGenius <span className="gradient-text">AI</span>
          </p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Viral clip engine</p>
        </div>
      </Link>

      <Link
        href="/projects/new"
        onClick={onNavigate}
        className="btn-primary mb-6 w-full py-2.5 text-sm"
      >
        <Plus className="h-4 w-4" /> New project
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition',
              isActive(item.href)
                ? 'bg-brand-gradient-soft border border-brand-400/30 text-white shadow-glow'
                : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-200',
            )}
          >
            <item.icon className={cn('h-[18px] w-[18px]', isActive(item.href) && 'text-brand-300')} />
            {item.label}
          </Link>
        ))}

        {user.role === 'admin' && (
          <>
            <p className="px-3.5 pb-1 pt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-600">
              Admin
            </p>
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-medium transition',
                  isActive(item.href) && pathname === item.href
                    ? 'bg-white/[0.08] text-white'
                    : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-200',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {plan && (
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-ink-900/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-300">{plan.name} plan</p>
            <Link href="/billing" className="text-[11px] font-semibold text-brand-300 hover:text-brand-200">
              Upgrade
            </Link>
          </div>
          <Progress value={clipsPct} className="h-1.5" />
          <p className="mt-2 text-[11px] text-gray-500">
            {usage?.clips_generated ?? 0} / {plan.clipsPerMonth} clips this month
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-white/[0.07] px-2 pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white">
          {(user.name || user.email)[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-200">{user.name || 'Creator'}</p>
          <p className="truncate text-[11px] text-gray-500">{user.email}</p>
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="rounded-lg p-2 text-gray-500 transition hover:bg-white/10 hover:text-danger"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, plan, usage, loading } = useSession();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-hero-radial">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] border-r border-white/[0.06] bg-ink-900/70 p-5 backdrop-blur-xl lg:block">
        <SidebarContent user={user} plan={plan} usage={usage} />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-white/10 bg-ink-900 p-5">
            <SidebarContent user={user} plan={plan} usage={usage} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-ink-950/80 px-5 py-3.5 backdrop-blur-xl lg:px-8">
          <button
            className="rounded-lg p-2 text-gray-300 hover:bg-white/10 lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="hidden items-center gap-2 text-xs text-gray-500 lg:flex">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-success" />
            Processing engine online
          </div>
          <div className="flex items-center gap-3">
            <Link href="/projects/new" className="btn-primary hidden py-2 text-xs sm:inline-flex">
              <Plus className="h-3.5 w-3.5" /> New clips
            </Link>
          </div>
        </header>
        <main className="flex-1 px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
