import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/cors';

/**
 * Answer CORS preflights for all /api/* routes before routing (App Router
 * would otherwise 405 OPTIONS requests that have no exported handler).
 * Embedded previews can present the app cross-origin, where JSON POSTs
 * require a successful preflight.
 */
export function middleware(req: NextRequest): NextResponse {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
