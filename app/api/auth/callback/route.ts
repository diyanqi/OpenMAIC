import { type NextRequest, NextResponse } from 'next/server';
import {
  getInkcraftOAuthConfig,
  INKCRAFT_OAUTH_RETURN_TO_COOKIE,
  INKCRAFT_OAUTH_STATE_COOKIE,
  INKCRAFT_OAUTH_VERIFIER_COOKIE,
  normalizeInkcraftUser,
  normalizeReturnTo,
  resolveOAuthRedirectUri,
  resolvePublicOrigin,
} from '@/lib/server/inkcraft-oauth';
import {
  createOAuthSessionToken,
  getOAuthSessionMaxAgeSeconds,
  OAUTH_SESSION_COOKIE,
  type OAuthSession,
} from '@/lib/server/oauth-session';

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

function clearOAuthHandshakeCookies(response: NextResponse) {
  for (const name of [
    INKCRAFT_OAUTH_STATE_COOKIE,
    INKCRAFT_OAUTH_VERIFIER_COOKIE,
    INKCRAFT_OAUTH_RETURN_TO_COOKIE,
  ]) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
}

async function exchangeCodeForToken({
  code,
  codeVerifier,
  redirectUri,
}: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const config = getInkcraftOAuthConfig();
  if (!config) throw new Error('INKCRAFT_OAUTH_CLIENT_ID is not configured');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });

  const headers: HeadersInit = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };

  const authMethod = process.env.INKCRAFT_OAUTH_TOKEN_AUTH_METHOD || 'client_secret_post';
  if (config.clientSecret && authMethod === 'client_secret_basic') {
    const encoded = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    headers.authorization = `Basic ${encoded}`;
  } else if (config.clientSecret && authMethod !== 'none') {
    body.set('client_secret', config.clientSecret);
  }

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers,
    body,
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to exchange OAuth code');
  }
  return data;
}

async function fetchUserInfo(accessToken: string): Promise<Record<string, unknown>> {
  const config = getInkcraftOAuthConfig();
  if (!config) throw new Error('INKCRAFT_OAUTH_CLIENT_ID is not configured');

  const response = await fetch(config.userInfoEndpoint, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error('Failed to fetch Inkcraft userinfo');
  }
  return data;
}

export async function GET(req: NextRequest) {
  try {
    const error = req.nextUrl.searchParams.get('error');
    if (error) throw new Error(req.nextUrl.searchParams.get('error_description') || error);

    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state');
    const expectedState = req.cookies.get(INKCRAFT_OAUTH_STATE_COOKIE)?.value;
    const codeVerifier = req.cookies.get(INKCRAFT_OAUTH_VERIFIER_COOKIE)?.value;

    if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
      throw new Error('Invalid OAuth callback state');
    }

    const token = await exchangeCodeForToken({
      code,
      codeVerifier,
      redirectUri: resolveOAuthRedirectUri(req),
    });
    const user = normalizeInkcraftUser(await fetchUserInfo(token.access_token!));
    const maxAge = getOAuthSessionMaxAgeSeconds();
    const now = Date.now();
    const session: OAuthSession = {
      provider: 'inkcraft',
      user,
      issuedAt: now,
      expiresAt: now + maxAge * 1000,
    };
    const sessionToken = await createOAuthSessionToken(session);
    const returnTo = normalizeReturnTo(
      req.cookies.get(INKCRAFT_OAUTH_RETURN_TO_COOKIE)?.value ?? null,
    );
    const response = NextResponse.redirect(new URL(returnTo, resolvePublicOrigin(req)));

    clearOAuthHandshakeCookies(response);
    response.cookies.set(OAUTH_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    });
    return response;
  } catch (err) {
    const response = NextResponse.redirect(new URL('/api/auth/login', resolvePublicOrigin(req)));
    clearOAuthHandshakeCookies(response);
    response.cookies.set(OAUTH_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    response.headers.set('x-openmaic-auth-error', err instanceof Error ? err.message : String(err));
    return response;
  }
}
