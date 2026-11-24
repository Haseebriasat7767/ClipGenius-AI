import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { apiHandler, jsonOk } from '@/lib/api';
import { query } from '@/lib/db';

export const GET = apiHandler('admin/users', async (req: NextRequest) => {
  await requireAdmin(req);
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10));
  const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10));

  const users = await query(
    `SELECT u.id, u.email, u.name, u.role, u.plan, u.banned, u.stripe_customer_id, u.created_at,
            (SELECT count(*) FROM projects p WHERE p.user_id = u.id) AS project_count,
            (SELECT count(*) FROM clips c WHERE c.user_id = u.id) AS clip_count,
            (SELECT COALESCE(sum(amount_cents),0) FROM payments pay WHERE pay.user_id = u.id AND pay.status='paid') AS paid_cents
     FROM users u
     WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%')
     ORDER BY u.created_at DESC
     LIMIT $2 OFFSET $3`,
    [q, limit, offset],
  );
  return jsonOk({ users });
});
