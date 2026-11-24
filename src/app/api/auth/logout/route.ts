import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { apiHandler, jsonOk } from '@/lib/api';

export const POST = apiHandler('auth/logout', async (req: NextRequest) => {
  const res = jsonOk({ loggedOut: true });
  clearSessionCookie(res as NextResponse, req);
  return res;
});

/** PUT alias: some embedded-preview proxies filter POST; the client
 *  retries POST failures as PUT with X-HTTP-Method-Override. */
export const PUT = POST;
