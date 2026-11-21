'use client';

import { useState } from 'react';
import { RefreshCcw, XCircle, Filter } from 'lucide-react';
import { Badge, Button, Card, Select, Spinner, useToast } from '@/components/ui';
import { api, ApiClientError, usePolling } from '@/lib/client';
import { timeAgo } from '@/lib/utils';

interface JobRow {
  id: string;
  type: string;
  status: string;
  progress: number;
  stage: string;
  attempts: number;
  error: string | null;
  project_id: string | null;
  clip_id: string | null;
  user_email: string | null;
  project_title: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export default function AdminJobsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const data = usePolling<{ jobs: JobRow[] }>(
    () => api(`/api/admin/jobs?status=${status}&type=${type}`),
    6000,
    true,
  );

  const act = async (jobId: string, action: 'retry' | 'cancel') => {
    try {
      await api('/api/admin/jobs', { method: 'POST', json: { jobId, action } });
      toast.push('success', action === 'retry' ? 'Job re-queued' : 'Job canceled');
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Action failed');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Processing jobs</h1>
        <p className="mt-1.5 text-gray-400">Background analysis & render queue.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-gray-500" />
        <div className="w-40">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['queued', 'running', 'completed', 'failed', 'canceled'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            <option value="analyze">analyze</option>
            <option value="render">render</option>
          </Select>
        </div>
      </div>

      <Card padding={false} className="overflow-x-auto p-0">
        {!data ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4 font-semibold">Type</th>
                <th className="px-4 py-4 font-semibold">Status</th>
                <th className="px-4 py-4 font-semibold">Progress</th>
                <th className="px-4 py-4 font-semibold">Stage</th>
                <th className="px-4 py-4 font-semibold">User</th>
                <th className="px-4 py-4 font-semibold">Created</th>
                <th className="px-6 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {(data.jobs ?? []).map((j) => (
                <tr key={j.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-6 py-3.5">
                    <Badge color={j.type === 'analyze' ? 'blue' : 'purple'}>{j.type}</Badge>
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge
                      color={
                        j.status === 'completed'
                          ? 'green'
                          : j.status === 'failed'
                            ? 'red'
                            : j.status === 'running'
                              ? 'blue'
                              : j.status === 'canceled'
                                ? 'default'
                                : 'yellow'
                      }
                    >
                      {j.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-brand-gradient"
                          style={{ width: `${j.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{j.progress}%</span>
                    </div>
                  </td>
                  <td className="max-w-[220px] px-4 py-3.5">
                    <p className="truncate text-xs text-gray-400">{j.stage || '—'}</p>
                    {j.error && <p className="truncate text-xs text-danger">{j.error}</p>}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">{j.user_email ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">{timeAgo(j.created_at)}</td>
                  <td className="px-6 py-3.5">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Retry"
                        onClick={() => act(j.id, 'retry')}
                        disabled={j.status === 'running'}
                      >
                        <RefreshCcw className="h-4 w-4 text-gray-400" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Cancel"
                        onClick={() => act(j.id, 'cancel')}
                        disabled={j.status === 'completed' || j.status === 'canceled'}
                      >
                        <XCircle className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
