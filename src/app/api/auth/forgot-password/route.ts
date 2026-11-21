import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { queryOne, query } from '@/lib/db';
import { apiHandler, jsonOk, parseBody } from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendPasswordResetEmail } from '@/lib/mail';
import { env } from '@/lib/env';

const schema = z.object({ email: z.string().email().max(200) });

export const POST = apiHandler('auth/forgot-password', async (req) => {
  checkRateLimit(req, 5);
  const { email } = await parseBody(req, schema);
  const normalized = email.toLowerCase().trim();

  const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [normalized]);

  // Never reveal whether the account exists.
  const generic = {
    message: 'If an account exists for that email, a password reset link has been sent.',
  };

  if (!user) return jsonOk(generic);

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '60 minutes')`,
    [user.id, tokenHash],
  );

  const resetUrl = `${env.appUrl}/reset-password?token=${token}`;
  const result = await sendPasswordResetEmail(normalized, resetUrl);

  return jsonOk({
    ...generic,
    // When SMTP is not configured the link is surfaced so the flow still works
    // in development / self-hosted setups without a mail relay.
    ...(result.delivered ? {} : { dev_mode: true, reset_link: resetUrl }),
  });
});
