import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { queryOne } from '@/lib/db';
import { hashPassword, setSessionCookie, createSessionToken, type SessionUser } from '@/lib/auth';
import { apiHandler, jsonOk, parseBody, ApiError } from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import { sendWelcomeEmail } from '@/lib/mail';

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name: z.string().max(100).optional().default(''),
});

export const POST = apiHandler('auth/register', async (req) => {
  checkRateLimit(req, 10);
  const { email, password, name } = await parseBody(req, schema);
  const normalized = email.toLowerCase().trim();

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [normalized]);
  if (existing) throw new ApiError(409, 'An account with this email already exists', 'exists');

  const passwordHash = await hashPassword(password);
  const role = env.adminEmails.includes(normalized) ? 'admin' : 'user';
  const user = await queryOne<SessionUser>(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, plan, banned, created_at`,
    [normalized, passwordHash, name.trim(), role],
  );
  if (!user) throw new ApiError(500, 'Failed to create account');

  await queryOne(`INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'free', 'active')`, [user.id]);
  sendWelcomeEmail(user.email, user.name).catch(() => {});

  const res = jsonOk(
    {
      user,
      // Bearer fallback for embedded previews where cookies are blocked.
      token: await createSessionToken(user),
    },
    { status: 201 },
  );
  await setSessionCookie(res, user, req);
  return res;
});
