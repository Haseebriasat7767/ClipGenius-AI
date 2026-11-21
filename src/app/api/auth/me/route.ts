import { queryOne, currentMonth } from '@/lib/db';
import { getSessionUser, requireUser } from '@/lib/auth';
import { apiHandler, jsonOk, parseBody } from '@/lib/api';
import { getPlan } from '@/lib/plans';
import { z } from 'zod';

export const PATCH = apiHandler('auth/update-profile', async (req) => {
  const sessionUser = await requireUser(req);
  const { name } = await parseBody(req, z.object({ name: z.string().max(100) }));
  await queryOne('UPDATE users SET name = $2, updated_at = now() WHERE id = $1', [sessionUser.id, name.trim()]);
  const user = await queryOne(
    'SELECT id, email, name, role, plan, banned, created_at FROM users WHERE id = $1',
    [sessionUser.id],
  );
  return jsonOk({ user });
});

export const GET = apiHandler('auth/me', async () => {
  const user = await getSessionUser();
  if (!user) return jsonOk({ user: null });

  const usage = await queryOne<{
    clips_generated: number;
    minutes_processed: number;
    renders: number;
    storage_bytes: number;
  }>(
    `SELECT clips_generated, minutes_processed, renders, storage_bytes
     FROM usage_counters WHERE user_id = $1 AND month = $2`,
    [user.id, currentMonth()],
  );
  const projects = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM projects
     WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
    [user.id],
  );

  return jsonOk({
    user,
    plan: getPlan(user.plan),
    usage: {
      clips_generated: usage?.clips_generated ?? 0,
      minutes_processed: Number(usage?.minutes_processed ?? 0),
      renders: usage?.renders ?? 0,
      storage_bytes: Number(usage?.storage_bytes ?? 0),
      projects_this_month: parseInt(projects?.count ?? '0', 10),
    },
  });
});
