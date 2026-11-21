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

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.appUrl.startsWith('https'),
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function setSessionCookie(res: NextResponse, user: SessionUser): Promise<void> {
  const token = await createSessionToken(user);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
}

export async function getSessionUser(req?: NextRequest): Promise<SessionUser | null> {
  try {
    const token =
      req?.cookies.get(SESSION_COOKIE)?.value ?? (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    const user = await queryOne<SessionUser>(
      'SELECT id, email, name, role, plan, banned, created_at FROM users WHERE id = $1',
      [payload.sub],
    );
    return user ?? null;
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
