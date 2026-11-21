'use client';

import { useState } from 'react';
import { Search, ShieldCheck, Ban, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Modal, Select, Spinner, useToast, cn } from '@/components/ui';
import { api, ApiClientError, usePolling } from '@/lib/client';
import { formatBytes, timeAgo } from '@/lib/utils';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  banned: boolean;
  created_at: string;
  project_count: string;
  clip_count: string;
  paid_cents: string;
}

export default function AdminUsersPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const data = usePolling<{ users: AdminUser[] }>(
    () => api(`/api/admin/users?q=${encodeURIComponent(q)}`),
    10_000,
    true,
  );

  const update = async (id: string, patch: Record<string, unknown>, msg: string) => {
    try {
      await api(`/api/admin/users/${id}`, { method: 'PATCH', json: patch });
      toast.push('success', msg);
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Update failed');
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      toast.push('success', 'User deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Users</h1>
        <p className="mt-1.5 text-gray-400">Manage accounts, plans and access.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          className="input-base pl-10"
          placeholder="Search by email or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card padding={false} className="overflow-x-auto p-0">
        {!data ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-4 py-4 font-semibold">Plan</th>
                <th className="px-4 py-4 font-semibold">Role</th>
                <th className="px-4 py-4 font-semibold">Projects</th>
                <th className="px-4 py-4 font-semibold">Clips</th>
                <th className="px-4 py-4 font-semibold">Paid</th>
                <th className="px-4 py-4 font-semibold">Joined</th>
                <th className="px-6 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {(data.users ?? []).map((u) => (
                <tr key={u.id} className={cn('transition hover:bg-white/[0.02]', u.banned && 'opacity-60')}>
                  <td className="px-6 py-3.5">
                    <p className="font-medium text-gray-100">{u.name || '—'}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <select
                      className="rounded-lg border border-white/10 bg-ink-900 px-2.5 py-1.5 text-xs text-gray-200"
                      value={u.plan}
                      onChange={(e) => update(u.id, { plan: e.target.value }, 'Plan updated')}
                    >
                      {['free', 'creator', 'pro', 'agency'].map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge color={u.role === 'admin' ? 'purple' : 'default'}>{u.role}</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-gray-400">{u.project_count}</td>
                  <td className="px-4 py-3.5 text-gray-400">{u.clip_count}</td>
                  <td className="px-4 py-3.5 text-gray-400">${(parseInt(u.paid_cents, 10) / 100).toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">{timeAgo(u.created_at)}</td>
                  <td className="px-6 py-3.5">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        title={u.banned ? 'Unban' : 'Ban'}
                        onClick={() => update(u.id, { banned: !u.banned }, u.banned ? 'User unbanned' : 'User banned')}
                      >
                        <Ban className={cn('h-4 w-4', u.banned ? 'text-danger' : 'text-gray-500')} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title={u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                        onClick={() =>
                          update(u.id, { role: u.role === 'admin' ? 'user' : 'admin' }, 'Role updated')
                        }
                      >
                        <ShieldCheck className="h-4 w-4 text-gray-500" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Delete" onClick={() => setDeleteTarget(u)}>
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete user?">
        <p className="text-sm text-gray-300">
          Permanently delete <b className="text-white">{deleteTarget?.email}</b> and all of their
          projects, clips and media.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete user
          </Button>
        </div>
      </Modal>
    </div>
  );
}
