import { type NextRequest, NextResponse } from 'next/server';
import { OAUTH_SESSION_COOKIE } from '@/lib/server/oauth-session';

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL('/api/auth/login', req.nextUrl.origin));
  response.cookies.set(OAUTH_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
