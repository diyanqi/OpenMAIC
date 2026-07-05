import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { OAUTH_SESSION_COOKIE, verifyOAuthSessionToken } from '@/lib/server/oauth-session';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(OAUTH_SESSION_COOKIE)?.value;
  const session = token ? await verifyOAuthSessionToken(token) : null;
  return NextResponse.json({
    success: true,
    authenticated: !!session,
    user: session?.user ?? null,
  });
}
