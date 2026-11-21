import { requireAdmin } from '@/lib/auth';
import { apiHandler, jsonOk } from '@/lib/api';
import { query } from '@/lib/db';

export const GET = apiHandler('admin/payments', async (req) => {
  await requireAdmin(req);
  const payments = await query(
    `SELECT p.*, u.email AS user_email
     FROM payments p LEFT JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC LIMIT 200`,
  );
  return jsonOk({ payments });
});
