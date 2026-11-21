'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  FolderKanban,
  Film,
  DollarSign,
  HardDrive,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from 'recharts';
import { Badge, Card, Spinner, cn } from '@/components/ui';
import { api, usePolling, useSession } from '@/lib/client';
import { formatBytes } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface Stats {
  totals: { users: number; projects: number; clips: number; storage_bytes: number };
  revenue: { total_cents: number; payments: number };
  plans: Array<{ plan: string; count: string }>;
  jobStatus: Array<{ status: string; count: string }>;
  daily: Array<{ day: string; projects: string; clips: string; api_calls: string }>;
  recentFailures: Array<{ id: string; type: string; error: string | null; created_at: string }>;
}

export default function AdminOverviewPage() {
  const { user, loading } = useSession();
  const router = useRouter();
  const stats = usePolling<Stats>(() => api('/api/admin/stats'), 15_000, user?.role === 'admin');

  useEffect(() => {
    if (!loading && user && user.role !== 'admin') router.replace('/dashboard');
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'admin') {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const daily = (stats?.daily ?? []).map((d) => ({
    ...d,
    day: d.day.slice(5),
    projects: parseInt(d.projects, 10),
    clips: parseInt(d.clips, 10),
    api_calls: parseInt(d.api_calls, 10),
  }));

  const planData = (stats?.plans ?? []).map((p) => ({
    plan: p.plan,
    users: parseInt(p.count, 10),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Admin overview</h1>
        <p className="mt-1.5 text-gray-400">Platform-wide statistics and health.</p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Users} label="Users" value={String(stats?.totals.users ?? '—')} />
        <Kpi icon={FolderKanban} label="Projects" value={String(stats?.totals.projects ?? '—')} />
        <Kpi icon={Film} label="Clips" value={String(stats?.totals.clips ?? '—')} />
        <Kpi
          icon={DollarSign}
          label="Revenue"
          value={`$${(((stats?.revenue.total_cents ?? 0) / 100)).toLocaleString()}`}
          sub={`${stats?.revenue.payments ?? 0} payments`}
          accent
        />
        <Kpi icon={HardDrive} label="Rendered storage" value={formatBytes(stats?.totals.storage_bytes ?? 0)} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="font-display text-lg font-bold text-white">Activity — last 14 days</h2>
          <div className="mt-5 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="gClips" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gProj" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#14142a',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12,
                    color: '#e5e7eb',
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="clips" stroke="#8b5cf6" strokeWidth={2} fill="url(#gClips)" />
                <Area type="monotone" dataKey="projects" stroke="#3b82f6" strokeWidth={2} fill="url(#gProj)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-bold text-white">Users by plan</h2>
          <div className="mt-5 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="plan" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: '#14142a',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12,
                    color: '#e5e7eb',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="users" fill="#7c3aed" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Job status + failures */}
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Activity className="h-5 w-5 text-brand-300" /> Job status
          </h2>
          <div className="mt-4 space-y-2.5">
            {(stats?.jobStatus ?? []).map((j) => (
              <div
                key={j.status}
                className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-ink-900/50 px-4 py-2.5"
              >
                <Badge
                  color={
                    j.status === 'completed' ? 'green' : j.status === 'failed' ? 'red' : j.status === 'running' ? 'blue' : 'yellow'
                  }
                >
                  {j.status}
                </Badge>
                <span className="font-semibold text-gray-200">{j.count}</span>
              </div>
            ))}
            {!stats?.jobStatus?.length && <p className="py-4 text-center text-sm text-gray-500">No jobs yet</p>}
          </div>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <AlertTriangle className="h-5 w-5 text-danger" /> Recent failures
          </h2>
          <div className="mt-4 space-y-2.5">
            {(stats?.recentFailures ?? []).map((f) => (
              <div key={f.id} className="rounded-xl border border-white/[0.07] bg-ink-900/50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <Badge color="red">{f.type}</Badge>
                  <span className="text-xs text-gray-500">{new Date(f.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs text-gray-400">{f.error ?? 'Unknown error'}</p>
              </div>
            ))}
            {!stats?.recentFailures?.length && (
              <p className="py-6 text-center text-sm text-gray-500">No failures 🎉</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card hover className={cn(accent && 'border-brand-400/30')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-white">{value}</p>
          {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
        </div>
        <div className={cn('rounded-xl p-2.5', accent ? 'bg-brand-gradient' : 'bg-white/[0.05]')}>
          <Icon className={cn('h-4.5 w-4.5', accent ? 'text-white' : 'text-gray-400')} />
        </div>
      </div>
    </Card>
  );
}
