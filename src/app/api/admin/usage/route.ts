import { requireAdmin } from '@/lib/auth';
import { apiHandler, jsonOk } from '@/lib/api';
import { query } from '@/lib/db';

export const GET = apiHandler('admin/usage', async (req) => {
  await requireAdmin(req);

  const byRoute = await query<{ route: string; calls: string; avg_ms: string; errors: string }>(
    `SELECT route,
            count(*)::text AS calls,
            round(avg(duration_ms))::text AS avg_ms,
            count(*) FILTER (WHERE status_code >= 400)::text AS errors
     FROM api_usage
     WHERE created_at > now() - interval '24 hours'
     GROUP BY route
     ORDER BY count(*) DESC
     LIMIT 40`,
  );

  const byUser = await query<{ user_id: string | null; email: string | null; calls: string }>(
    `SELECT a.user_id, u.email, count(*)::text AS calls
     FROM api_usage a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.created_at > now() - interval '24 hours'
     GROUP BY a.user_id, u.email
     ORDER BY count(*) DESC
     LIMIT 25`,
  );

  const recentErrors = await query(
    `SELECT id, user_id, method, route, status_code, duration_ms, ip, created_at
     FROM api_usage
     WHERE status_code >= 500 AND created_at > now() - interval '24 hours'
     ORDER BY created_at DESC LIMIT 30`,
  );

  return jsonOk({ byRoute, byUser, recentErrors });
});
