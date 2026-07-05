import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_SESSION_COOKIE, verifyOAuthSessionToken } from '@/lib/server/oauth-session';

/** Convert string to Uint8Array */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verify an HMAC-signed token using Web Crypto API (Edge-compatible) */
async function verifyToken(token: string, accessCode: string): Promise<boolean> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const keyData = encode(accessCode);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = encode(timestamp);
  const expected = bufToHex(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer));

  // Constant-length comparison (not truly constant-time in JS, but sufficient here)
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

function isPublicAsset(pathname: string): boolean {
  const looksLikePublicFile = !pathname.startsWith('/api/') && /\.[a-zA-Z0-9]+$/.test(pathname);
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/logos/') ||
    pathname.startsWith('/avatars/') ||
    pathname === '/favicon.ico' ||
    pathname === '/apple-icon.png' ||
    pathname === '/logo-horizontal.png' ||
    pathname === '/openmaic-mark.png' ||
    looksLikePublicFile
  );
}

function isAuthBypassPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/access-code/') ||
    pathname.startsWith('/api/inkcraft/') ||
    pathname.startsWith('/api/integrations/inkcraft/') ||
    pathname === '/api/health'
  );
}

function buildLoginUrl(request: NextRequest): URL {
  const loginUrl = new URL('/api/auth/login', request.url);
  loginUrl.searchParams.set('returnTo', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return loginUrl;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  const oauthEnabled =
    process.env.INKCRAFT_OAUTH_DISABLED !== 'true' && !!process.env.INKCRAFT_OAUTH_CLIENT_ID;
  const authBypass = isAuthBypassPath(pathname);

  if (oauthEnabled && !authBypass) {
    const sessionCookie = request.cookies.get(OAUTH_SESSION_COOKIE)?.value;
    const hasOAuthSession =
      !!sessionCookie && !!(await verifyOAuthSessionToken(sessionCookie));

    if (!hasOAuthSession) {
      const loginUrl = buildLoginUrl(request);
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'INVALID_REQUEST',
            error: 'Authentication required',
            loginUrl: loginUrl.toString(),
          },
          { status: 401 },
        );
      }
      return NextResponse.redirect(loginUrl);
    }
  }

  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    return NextResponse.next();
  }

  // Whitelist: auth/access-code endpoints, Inkcraft server integration, health check.
  if (authBypass) {
    return NextResponse.next();
  }

  // Check cookie — validate HMAC signature, not just existence
  const cookie = request.cookies.get('openmaic_access');
  if (cookie?.value && (await verifyToken(cookie.value, accessCode))) {
    return NextResponse.next();
  }

  // API requests without valid cookie → 401
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
      { status: 401 },
    );
  }

  // Page requests → let through, frontend shows modal
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)'],
};
