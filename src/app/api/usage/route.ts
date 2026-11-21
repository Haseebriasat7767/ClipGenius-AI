import { requireUser } from '@/lib/auth';
import { apiHandler, jsonOk } from '@/lib/api';
import { query, queryOne, currentMonth } from '@/lib/db';
import { getPlan } from '@/lib/plans';

export const GET = apiHandler('usage/get', async (req) => {
  const user = await requireUser(req);
  const plan = getPlan(user.plan);

  const usage = await queryOne<{
    clips_generated: number;
    minutes_processed: number;
    renders: number;
    storage_bytes: number;
    api_calls: number;
  }>(
    `SELECT clips_generated, minutes_processed, renders, storage_bytes, api_calls
     FROM usage_counters WHERE user_id = $1 AND month = $2`,
    [user.id, currentMonth()],
  );

  const history = await query(
    `SELECT month, clips_generated, minutes_processed, renders, storage_bytes
     FROM usage_counters WHERE user_id = $1 ORDER BY month DESC LIMIT 12`,
    [user.id],
  );

  const projects = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM projects WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
    [user.id],
  );

  return jsonOk({
    plan,
    usage: {
      clips_generated: usage?.clips_generated ?? 0,
      minutes_processed: Number(usage?.minutes_processed ?? 0),
      renders: usage?.renders ?? 0,
      storage_bytes: Number(usage?.storage_bytes ?? 0),
      api_calls: usage?.api_calls ?? 0,
      projects_this_month: parseInt(projects?.count ?? '0', 10),
    },
    history,
  });
});
