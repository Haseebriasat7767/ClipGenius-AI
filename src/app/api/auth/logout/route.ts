import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';
import { apiHandler, jsonOk } from '@/lib/api';

export const POST = apiHandler('auth/logout', async () => {
  const res = jsonOk({ loggedOut: true });
  clearSessionCookie(res as NextResponse);
  return res;
});
