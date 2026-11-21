'use client';

import { Badge, Card, Spinner } from '@/components/ui';
import { api, usePolling } from '@/lib/client';

interface UsageData {
  byRoute: Array<{ route: string; calls: string; avg_ms: string; errors: string }>;
  byUser: Array<{ user_id: string | null; email: string | null; calls: string }>;
  recentErrors: Array<{
    id: string;
    method: string;
    route: string;
    status_code: number;
    duration_ms: number;
    ip: string | null;
    created_at: string;
  }>;
}

export default function AdminUsagePage() {
  const data = usePolling<UsageData>(() => api('/api/admin/usage'), 15_000, true);

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">API usage</h1>
        <p className="mt-1.5 text-gray-400">Traffic, latency and errors — last 24 hours.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card padding={false} className="overflow-x-auto p-0">
          <h2 className="border-b border-white/[0.06] px-6 py-5 font-display text-lg font-bold text-white">
            By endpoint
          </h2>
          {!data ? (
            <div className="flex justify-center py-14">
              <Spinner />
            </div>
          ) : (
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3.5 font-semibold">Route</th>
                  <th className="px-4 py-3.5 font-semibold">Calls</th>
                  <th className="px-4 py-3.5 font-semibold">Avg ms</th>
                  <th className="px-6 py-3.5 font-semibold">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {(data.byRoute ?? []).map((r) => (
                  <tr key={r.route} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 font-mono text-xs text-gray-300">{r.route}</td>
                    <td className="px-4 py-3 text-gray-200">{r.calls}</td>
                    <td className="px-4 py-3 text-gray-400">{r.avg_ms}</td>
                    <td className="px-6 py-3">
                      {parseInt(r.errors, 10) > 0 ? (
                        <Badge color="red">{r.errors}</Badge>
                      ) : (
                        <Badge color="green">0</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-lg font-bold text-white">Top users (24h)</h2>
          <div className="mt-4 space-y-2">
              {(data?.byUser ?? []).map((u, i) => (
                <div
                  key={u.user_id ?? i}
                  className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-ink-900/40 px-3.5 py-2.5"
                >
                  <p className="truncate text-xs text-gray-300">{u.email ?? 'anonymous'}</p>
                  <Badge color="purple">{u.calls}</Badge>
                </div>
              ))}
              {!data?.byUser?.length && (
                <p className="py-6 text-center text-sm text-gray-500">No traffic yet</p>
              )}
          </div>
        </Card>
      </div>

      <Card padding={false} className="overflow-x-auto p-0">
        <h2 className="border-b border-white/[0.06] px-6 py-5 font-display text-lg font-bold text-white">
          Server errors (5xx)
        </h2>
        {!data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (data.recentErrors ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">No server errors 🎉</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3.5 font-semibold">Method</th>
                <th className="px-4 py-3.5 font-semibold">Route</th>
                <th className="px-4 py-3.5 font-semibold">Status</th>
                <th className="px-4 py-3.5 font-semibold">Duration</th>
                <th className="px-4 py-3.5 font-semibold">IP</th>
                <th className="px-6 py-3.5 font-semibold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {(data.recentErrors ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="px-6 py-3 text-gray-200">{e.method}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">{e.route}</td>
                  <td className="px-4 py-3">
                    <Badge color="red">{e.status_code}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{e.duration_ms}ms</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{e.ip ?? '—'}</td>
                  <td className="px-6 py-3 text-xs text-gray-500">
                    {new Date(e.created_at).toLocaleTimeString()}
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
