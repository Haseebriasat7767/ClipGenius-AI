import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from './auth';
import { withCors } from './cors';
import { recordApiUsage } from './rate-limit';

export { ApiError } from './errors';
import { ApiError } from './errors';

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(status: number, message: string, code = 'error', extra?: object): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message, ...extra } }, { status });
}

type Handler = (req: NextRequest, ctx: { params: Record<string, string> }) => Promise<Response>;

/** Wraps a route handler with error handling + API usage recording. */
export function apiHandler(routeName: string, handler: Handler): Handler {
  return async (req, ctx) => {
    const started = Date.now();
    let status = 200;
    try {
      const res = withCors(req, await handler(req, ctx));
      status = res.status;
      return res;
    } catch (err) {
      if (err instanceof ApiError) {
        status = err.status;
        return withCors(req, jsonError(err.status, err.message, err.code));
      }
      if (err instanceof AuthError) {
        status = err.status;
        return withCors(req, jsonError(err.status, err.message, 'auth'));
      }
      if (err instanceof ZodError) {
        status = 400;
        const first = err.errors[0];
        return withCors(req, jsonError(400, first ? `${first.path.join('.')}: ${first.message}` : 'Invalid input', 'validation'));
      }
      console.error(`[api] ${routeName} failed:`, err);
      status = 500;
      return withCors(req, jsonError(500, 'Internal server error', 'internal'));
    } finally {
      // fire-and-forget usage log (never block the response path on failure)
      recordApiUsage(req, routeName, status, Date.now() - started).catch(() => {});
    }
  };
}

/** Parses and validates a JSON body. */
export async function parseBody<T>(req: NextRequest, schema: { parse: (v: unknown) => T }): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON body', 'validation');
  }
  return schema.parse(raw);
}
