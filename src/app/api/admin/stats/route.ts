import { requireAdmin } from '@/lib/auth';
import { apiHandler, jsonOk } from '@/lib/api';
import { query, queryOne } from '@/lib/db';

export const GET = apiHandler('admin/stats', async (req) => {
  await requireAdmin(req);

  const totals = await queryOne<{
    users: string;
    projects: string;
    clips: string;
    storage_bytes: string;
  }>(
    `SELECT
       (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM projects) AS projects,
       (SELECT count(*) FROM clips) AS clips,
       (SELECT COALESCE(sum(size_bytes),0) FROM clips) AS storage_bytes`,
  );

  const revenue = await queryOne<{ total_cents: string; count: string }>(
    `SELECT COALESCE(sum(amount_cents),0)::text AS total_cents, count(*)::text AS count
     FROM payments WHERE status = 'paid'`,
  );

  const plans = await query<{ plan: string; count: string }>(
    `SELECT plan, count(*)::text AS count FROM users GROUP BY plan ORDER BY plan`,
  );

  const jobStatus = await query<{ status: string; count: string }>(
    `SELECT status, count(*)::text AS count FROM processing_jobs GROUP BY status`,
  );

  const daily = await query<{ day: string; projects: string; clips: string; api_calls: string }>(
    `SELECT
       to_char(d.day, 'YYYY-MM-DD') AS day,
       (SELECT count(*) FROM projects p WHERE p.created_at >= d.day AND p.created_at < d.day + interval '1 day') AS projects,
       (SELECT count(*) FROM clips c WHERE c.created_at >= d.day AND c.created_at < d.day + interval '1 day') AS clips,
       (SELECT count(*) FROM api_usage a WHERE a.created_at >= d.day AND a.created_at < d.day + interval '1 day') AS api_calls
     FROM generate_series(now() - interval '13 days', now(), interval '1 day') AS d(day)
     ORDER BY d.day`,
  );

  const recentFailures = await query(
    `SELECT id, type, status, error, project_id, clip_id, created_at
     FROM processing_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10`,
  );

  return jsonOk({
    totals: {
      users: parseInt(totals?.users ?? '0', 10),
      projects: parseInt(totals?.projects ?? '0', 10),
      clips: parseInt(totals?.clips ?? '0', 10),
      storage_bytes: Number(totals?.storage_bytes ?? 0),
    },
    revenue: {
      total_cents: parseInt(revenue?.total_cents ?? '0', 10),
      payments: parseInt(revenue?.count ?? '0', 10),
    },
    plans,
    jobStatus,
    daily,
    recentFailures,
  });
});
