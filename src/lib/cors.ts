/**
 * CORS support for trusted embedding contexts (Arena live preview, local dev).
 *
 * Only origins on known preview/dev hosts are reflected — arbitrary sites
 * never receive CORS headers, so cross-site credentialed access stays closed.
 */
import type { NextRequest } from 'next/server';

const TRUSTED_HOST = /(^|\.)(arena\.ai|arena\.site|e2b\.app)$/;

export function isTrustedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return TRUSTED_HOST.test(host) || host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

export function corsHeaders(req: { headers: { get(name: string): string | null } }): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!isTrustedOrigin(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin as string,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-HTTP-Method-Override',
    Vary: 'Origin',
  };
}

/** Attach CORS headers (when appropriate) to a response without mutating the original. */
export function withCors<T extends Response>(req: { headers: { get(name: string): string | null } }, res: T): T {
  const extra = corsHeaders(req);
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}
