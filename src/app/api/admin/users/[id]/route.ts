import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { apiHandler, jsonOk, parseBody, ApiError } from '@/lib/api';
import { query, queryOne } from '@/lib/db';

const schema = z.object({
  plan: z.enum(['free', 'creator', 'pro', 'agency']).optional(),
  role: z.enum(['user', 'admin']).optional(),
  banned: z.boolean().optional(),
});

export const PATCH = apiHandler('admin/users/update', async (req, ctx) => {
  const admin = await requireAdmin(req);
  const body = await parseBody(req, schema);
  const target = await queryOne<{ id: string }>('SELECT id FROM users WHERE id = $1', [ctx.params.id]);
  if (!target) throw new ApiError(404, 'User not found', 'not_found');

  if (ctx.params.id === admin.id && (body.role === 'user' || body.banned === true)) {
    throw new ApiError(400, 'You cannot demote or ban your own admin account', 'conflict');
  }

  if (body.plan !== undefined) {
    await query('UPDATE users SET plan = $2, updated_at = now() WHERE id = $1', [ctx.params.id, body.plan]);
    await query(
      `INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, $2, 'active')
       ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now()`,
      [ctx.params.id, body.plan],
    );
  }
  if (body.role !== undefined) {
    await query('UPDATE users SET role = $2, updated_at = now() WHERE id = $1', [ctx.params.id, body.role]);
  }
  if (body.banned !== undefined) {
    await query('UPDATE users SET banned = $2, updated_at = now() WHERE id = $1', [ctx.params.id, body.banned]);
  }

  const user = await queryOne(
    'SELECT id, email, name, role, plan, banned, created_at FROM users WHERE id = $1',
    [ctx.params.id],
  );
  return jsonOk({ user });
});

export const DELETE = apiHandler('admin/users/delete', async (req, ctx) => {
  const admin = await requireAdmin(req);
  if (ctx.params.id === admin.id) throw new ApiError(400, 'You cannot delete your own account', 'conflict');
  await query('DELETE FROM users WHERE id = $1', [ctx.params.id]);
  return jsonOk({ deleted: true });
});
