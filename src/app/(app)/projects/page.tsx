'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Film,
  Plus,
  Search,
  Trash2,
  Clock,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { Badge, Button, Card, Modal, Progress, Spinner, useToast } from '@/components/ui';
import { api, ApiClientError, usePolling } from '@/lib/client';
import { formatDuration, formatBytes, timeAgo } from '@/lib/utils';

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  size_bytes: number | null;
  clips_count: number;
  progress: number;
  stage: string;
  error: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, 'green' | 'yellow' | 'red' | 'purple' | 'blue' | 'default'> = {
  completed: 'green',
  processing: 'blue',
  queued: 'yellow',
  failed: 'red',
  draft: 'default',
};

export default function ProjectsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [busy, setBusy] = useState(false);
  const data = usePolling<{ projects: ProjectRow[] }>(() => api('/api/projects'), 8000, true);

  const projects = (data?.projects ?? []).filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()),
  );

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
      toast.push('success', 'Project deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const reprocess = async (p: ProjectRow) => {
    try {
      await api(`/api/projects/${p.id}/process`, { method: 'POST' });
      toast.push('success', 'Re-processing queued');
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Failed to queue');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Projects</h1>
          <p className="mt-1.5 text-gray-400">Every video you&apos;ve sent through ClipGenius.</p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <Plus className="h-4 w-4" /> New project
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          className="input-base pl-10"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : projects.length === 0 ? (
        <Card className="py-16 text-center">
          <Film className="mx-auto mb-4 h-12 w-12 text-gray-600" />
          <p className="font-display text-lg font-bold text-white">No projects found</p>
          <p className="mt-1.5 text-sm text-gray-500">
            {search ? 'Try a different search.' : 'Create your first project to get started.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id} hover className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/projects/${p.id}`}
                    className="line-clamp-2 font-display text-lg font-bold text-white hover:text-brand-200"
                  >
                    {p.title}
                  </Link>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {p.duration_seconds ? formatDuration(p.duration_seconds) : '—'}
                    </span>
                    {p.size_bytes ? <span>{formatBytes(p.size_bytes)}</span> : null}
                    <span>{p.clips_count} clips</span>
                    <span>{timeAgo(p.created_at)}</span>
                  </p>
                </div>
                <Badge color={STATUS_COLORS[p.status] ?? 'default'}>{p.status}</Badge>
              </div>

              {(p.status === 'processing' || p.status === 'queued') && (
                <div className="mt-4">
                  <Progress value={p.progress} />
                  <p className="mt-1.5 text-xs text-gray-500">{p.stage || 'Working…'}</p>
                </div>
              )}

              {p.status === 'failed' && p.error && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/[0.08] px-3.5 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  <p className="line-clamp-2 text-xs text-gray-300">{p.error}</p>
                </div>
              )}

              <div className="mt-5 flex items-center gap-2">
                <Link href={`/projects/${p.id}`} className="btn-secondary flex-1 py-2 text-xs">
                  Open project
                </Link>
                {(p.status === 'completed' || p.status === 'failed') && (
                  <Button variant="ghost" size="sm" onClick={() => reprocess(p)} title="Re-process">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(p)} title="Delete">
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete project?">
        <p className="text-sm text-gray-300">
          This permanently removes <b className="text-white">{deleteTarget?.title}</b>, all of its
          clips and rendered files. This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete project
          </Button>
        </div>
      </Modal>
    </div>
  );
}
