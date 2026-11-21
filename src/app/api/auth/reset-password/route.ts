import { createHash } from 'node:crypto';
import { z } from 'zod';
import { queryOne, query } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { apiHandler, jsonOk, parseBody, ApiError } from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';

const schema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const POST = apiHandler('auth/reset-password', async (req) => {
  checkRateLimit(req, 10);
  const { token, password } = await parseBody(req, schema);
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const row = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  if (!row) throw new ApiError(400, 'This reset link is invalid or has expired', 'token');

  const passwordHash = await hashPassword(password);
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [row.user_id, passwordHash]);
  await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [row.id]);
  // Invalidate any other outstanding tokens for this user.
  await query(
    `UPDATE password_reset_tokens SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL`,
    [row.user_id],
  );

  return jsonOk({ message: 'Password updated — you can now sign in.' });
});
