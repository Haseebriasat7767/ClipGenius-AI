'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Sparkles,
  Film,
  Clock,
  HardDrive,
  ArrowRight,
  FolderKanban,
  Plus,
  TrendingUp,
} from 'lucide-react';
import { Badge, Card, Progress, Spinner, cn } from '@/components/ui';
import { api, usePolling, useSession, type UsageInfo, type PlanInfo } from '@/lib/client';
import { formatDuration, formatBytes, timeAgo } from '@/lib/utils';

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  clips_count: number;
  progress: number;
  stage: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, 'green' | 'yellow' | 'red' | 'purple' | 'blue' | 'default'> = {
  completed: 'green',
  processing: 'blue',
  queued: 'yellow',
  failed: 'red',
  draft: 'default',
};

export default function DashboardPage() {
  const { user, plan, usage, refresh } = useSession();
  const projects = usePolling<{ projects: ProjectRow[] }>(
    () => api('/api/projects'),
    10_000,
    !!user,
  );

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">
            Welcome back, {user.name?.split(' ')[0] || 'creator'} 👋
          </h1>
          <p className="mt-1.5 text-gray-400">
            Here&apos;s what&apos;s happening with your clips this month.
          </p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <Plus className="h-4 w-4" /> Create new clips
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Sparkles}
          label="Clips generated"
          value={String(usage?.clips_generated ?? 0)}
          sub={plan ? `of ${plan.clipsPerMonth} this month` : ''}
          accent
        />
        <StatCard
          icon={FolderKanban}
          label="Projects"
          value={String(usage?.projects_this_month ?? 0)}
          sub={plan ? `of ${plan.maxProjectsPerMonth} this month` : ''}
        />
        <StatCard
          icon={Clock}
          label="Minutes processed"
          value={(usage?.minutes_processed ?? 0).toFixed(1)}
          sub="source video analyzed"
        />
        <StatCard
          icon={HardDrive}
          label="Storage used"
          value={formatBytes(usage?.storage_bytes ?? 0)}
          sub={`${usage?.renders ?? 0} renders`}
        />
      </div>

      {/* Usage overview */}
      {plan && usage && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-white">Monthly usage</h2>
              <p className="text-sm text-gray-500">
                {plan.name} plan — resets on the 1st of each month
              </p>
            </div>
            <Link href="/billing" className="btn-secondary py-2 text-xs">
              Manage plan <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <UsageBar
              label="Clips"
              used={usage.clips_generated}
              total={plan.clipsPerMonth}
            />
            <UsageBar
              label="Projects"
              used={usage.projects_this_month}
              total={plan.maxProjectsPerMonth}
            />
          </div>
        </Card>
      )}

      {/* Recent projects */}
      <Card padding={false} className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <h2 className="font-display text-lg font-bold text-white">Recent projects</h2>
          <Link href="/projects" className="text-sm font-semibold text-brand-300 hover:text-brand-200">
            View all
          </Link>
        </div>
        {!projects ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : projects.projects.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient-soft">
              <Film className="h-7 w-7 text-brand-300" />
            </div>
            <p className="font-display text-lg font-bold text-white">No projects yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-gray-500">
              Upload your first video and watch ClipGenius turn it into scroll-stopping clips.
            </p>
            <Link href="/projects/new" className="btn-primary mt-6 inline-flex">
              <Sparkles className="h-4 w-4" /> Create your first project
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {projects.projects.slice(0, 6).map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-4 px-6 py-4 transition hover:bg-white/[0.03]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.05]">
                  <Film className="h-5 w-5 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-100">{p.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {p.duration_seconds ? formatDuration(p.duration_seconds) : '—'} ·{' '}
                    {p.clips_count} clips · {timeAgo(p.created_at)}
                  </p>
                </div>
                {p.status === 'processing' || p.status === 'queued' ? (
                  <div className="w-36">
                    <Progress value={p.progress} className="h-1.5" />
                    <p className="mt-1 text-right text-[10px] text-gray-500">{p.stage || p.status}</p>
                  </div>
                ) : (
                  <Badge color={STATUS_COLORS[p.status] ?? 'default'}>{p.status}</Badge>
                )}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({
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
          <p className="text-sm text-gray-400">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold text-white">{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
        </div>
        <div
          className={cn(
            'rounded-2xl p-3',
            accent ? 'bg-brand-gradient shadow-glow' : 'bg-white/[0.05]',
          )}
        >
          <Icon className={cn('h-5 w-5', accent ? 'text-white' : 'text-gray-400')} />
        </div>
      </div>
    </Card>
  );
}

function UsageBar({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = Math.min(100, (used / Math.max(1, total)) * 100);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-gray-300">
          <TrendingUp className="h-4 w-4 text-brand-300" /> {label}
        </span>
        <span className="text-gray-500">
          <b className="text-gray-200">{used}</b> / {total}
        </span>
      </div>
      <Progress value={pct} />
    </div>
  );
}
