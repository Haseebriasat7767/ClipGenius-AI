import { z } from 'zod';
import { queryOne } from '@/lib/db';
import { createSessionToken, setSessionCookie, verifyPassword, type SessionUser } from '@/lib/auth';
import { apiHandler, jsonOk, parseBody, ApiError } from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export const POST = apiHandler('auth/login', async (req) => {
  checkRateLimit(req, 15);
  const { email, password } = await parseBody(req, schema);
  const normalized = email.toLowerCase().trim();

  const user = await queryOne<SessionUser & { password_hash: string }>(
    'SELECT id, email, name, role, plan, banned, created_at, password_hash FROM users WHERE email = $1',
    [normalized],
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new ApiError(401, 'Invalid email or password', 'credentials');
  }
  if (user.banned) throw new ApiError(403, 'This account has been suspended', 'banned');

  const res = jsonOk({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan },
    // Bearer fallback for embedded previews where cookies are blocked.
    token: await createSessionToken(user),
  });
  await setSessionCookie(res, user, req);
  return res;
});

/** PUT alias: some embedded-preview proxies filter POST; the client
 *  retries POST failures as PUT with X-HTTP-Method-Override. */
export const PUT = POST;
