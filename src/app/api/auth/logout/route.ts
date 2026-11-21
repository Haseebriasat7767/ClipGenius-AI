import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { apiHandler, jsonOk } from '@/lib/api';

export const POST = apiHandler('auth/logout', async (req: NextRequest) => {
  const res = jsonOk({ loggedOut: true });
  clearSessionCookie(res as NextResponse, req);
  return res;
});
