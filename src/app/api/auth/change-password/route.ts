import { z } from 'zod';
import { queryOne, query } from '@/lib/db';
import { hashPassword, requireUser, verifyPassword } from '@/lib/auth';
import { apiHandler, jsonOk, parseBody, ApiError } from '@/lib/api';

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export const POST = apiHandler('auth/change-password', async (req) => {
  const user = await requireUser(req);
  const { currentPassword, newPassword } = await parseBody(req, schema);

  const row = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new ApiError(401, 'Current password is incorrect', 'credentials');
  }
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
    user.id,
    await hashPassword(newPassword),
  ]);
  return jsonOk({ message: 'Password changed' });
});
