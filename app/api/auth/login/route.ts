import { randomBytes, createHash } from 'crypto';
import { type NextRequest, NextResponse } from 'next/server';
import {
  getInkcraftOAuthConfig,
  INKCRAFT_OAUTH_RETURN_TO_COOKIE,
  INKCRAFT_OAUTH_STATE_COOKIE,
  INKCRAFT_OAUTH_VERIFIER_COOKIE,
  normalizeReturnTo,
  resolveOAuthRedirectUri,
} from '@/lib/server/inkcraft-oauth';

function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export async function GET(req: NextRequest) {
  const config = getInkcraftOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { success: false, error: 'INKCRAFT_OAUTH_CLIENT_ID is not configured' },
      { status: 500 },
    );
  }

  const state = randomToken();
  const verifier = randomToken(48);
  const returnTo = normalizeReturnTo(req.nextUrl.searchParams.get('returnTo'));
  const redirectUri = resolveOAuthRedirectUri(req);

  const authUrl = new URL(config.authorizationEndpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', config.scope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge(verifier));
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const response = NextResponse.redirect(authUrl);
  const secure = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: 60 * 10,
  };

  response.cookies.set(INKCRAFT_OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(INKCRAFT_OAUTH_VERIFIER_COOKIE, verifier, cookieOptions);
  response.cookies.set(INKCRAFT_OAUTH_RETURN_TO_COOKIE, returnTo, cookieOptions);
  return response;
}
