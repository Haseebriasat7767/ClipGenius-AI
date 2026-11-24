import { NextRequest } from 'next/server';
import { query } from './db';
import { env } from './env';

/**
 * Sliding-window rate limiter. In-memory for single-node deployments;
 * the API usage log in Postgres provides durable accounting for admins.
 */
const buckets = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'local';
}

export function checkRateLimit(req: NextRequest, limitPerMinute = env.rateLimitRpm): void {
  const key = `${clientIp(req)}:${req.nextUrl.pathname}`;
  const now = Date.now();
  const windowMs = 60_000;
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limitPerMinute) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ApiError } = require('./errors') as typeof import('./errors');
    throw new ApiError(429, 'Too many requests — slow down and try again shortly', 'rate_limit');
  }
  hits.push(now);
  buckets.set(key, hits);
  // periodic cleanup so the map cannot grow unbounded
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
}

export async function recordApiUsage(
  req: NextRequest,
  route: string,
  statusCode: number,
  durationMs: number,
): Promise<void> {
  try {
    await query(
      `INSERT INTO api_usage (user_id, method, route, status_code, duration_ms, ip)
       VALUES (NULLIF($1, '')::uuid, $2, $3, $4, $5, $6)`,
      [
        (req.headers.get('x-user-id') ?? '').slice(0, 36),
        req.method,
        route,
        statusCode,
        Math.round(durationMs),
        clientIp(req),
      ],
    );
  } catch {
    /* usage logging must never break requests */
  }
}
