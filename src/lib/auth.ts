import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { env } from './env';
import { queryOne } from './db';

export const SESSION_COOKIE = 'cg_session';
const SESSION_DAYS = 7;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  plan: 'free' | 'creator' | 'pro' | 'agency';
  banned: boolean;
  created_at: Date;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.jwtSecret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, plan: user.plan })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

/**
 * Whether the current request arrived over HTTPS (directly or through the
 * preview/deployment proxy). Embedded previews (iframes on another origin)
 * need `SameSite=None; Secure` cookies; plain HTTP local dev needs Lax.
 */
export function isSecureRequest(req?: NextRequest): boolean {
  if (req) {
    if (req.headers.get('x-forwarded-proto') === 'https') return true;
    if (req.nextUrl.protocol === 'https:') return true;
    const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? '';
    if (origin.startsWith('https://')) return true;
  }
  return env.appUrl.startsWith('https');
}

export function sessionCookieOptions(secure = false) {
  return {
    httpOnly: true,
    // Embedded previews run in a cross-site iframe: Lax cookies are blocked
    // there, so over HTTPS we use None+Secure (accepted in all contexts).
    sameSite: (secure ? 'none' : 'lax') as 'none' | 'lax',
    secure,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function setSessionCookie(
  res: NextResponse,
  user: SessionUser,
  req?: NextRequest,
): Promise<void> {
  const token = await createSessionToken(user);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(isSecureRequest(req)));
}

export function clearSessionCookie(res: NextResponse, req?: NextRequest): void {
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(isSecureRequest(req)), maxAge: 0 });
}

/** Verify a raw JWT and return the session user, or null. */
export async function userFromToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return await queryOne<SessionUser>(
      'SELECT id, email, name, role, plan, banned, created_at FROM users WHERE id = $1',
      [payload.sub],
    );
  } catch {
    return null;
  }
}

/**
 * Resolve the session user for a request.
 * Token sources, in order:
 *   1. `Authorization: Bearer <jwt>` (SPA fallback for embedded previews where
 *      browsers block cookies in cross-site iframes)
 *   2. `?t=<jwt>` query param — media/download routes only, since <video>/<img>
 *      and anchor navigations cannot send Authorization headers
 *   3. HttpOnly session cookie
 */
export async function getSessionUser(req?: NextRequest): Promise<SessionUser | null> {
  try {
    // 1. Authorization header
    const authHeader = req?.headers.get('authorization');
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      const user = await userFromToken(authHeader.slice(7).trim());
      if (user) return user;
    }

    // 2. Query token — restricted to media & file-download endpoints
    if (req) {
      const path = req.nextUrl.pathname;
      const isMediaRoute = path.startsWith('/api/media/') || path.endsWith('/download');
      if (isMediaRoute) {
        const t = req.nextUrl.searchParams.get('t');
        if (t) {
          const user = await userFromToken(t);
          if (user) return user;
        }
      }
    }

    // 3. Cookie
    const token =
      req?.cookies.get(SESSION_COOKIE)?.value ?? (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return (await userFromToken(token)) ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(req?: NextRequest): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw new AuthError('Not authenticated');
  if (user.banned) throw new AuthError('Account suspended');
  return user;
}

export async function requireAdmin(req?: NextRequest): Promise<SessionUser> {
  const user = await requireUser(req);
  if (user.role !== 'admin') throw new AuthError('Admin access required', 403);
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
