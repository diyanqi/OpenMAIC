import { type NextRequest, NextResponse } from 'next/server';
import { resolvePublicOrigin } from '@/lib/server/inkcraft-oauth';
import { OAUTH_SESSION_COOKIE } from '@/lib/server/oauth-session';

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL('/api/auth/login', resolvePublicOrigin(req)));
  response.cookies.set(OAUTH_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
