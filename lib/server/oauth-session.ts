export const OAUTH_SESSION_COOKIE = 'openmaic_session';

export interface OAuthSessionUser {
  id: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface OAuthSession {
  provider: 'inkcraft';
  user: OAuthSessionUser;
  issuedAt: number;
  expiresAt: number;
}

const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      Math.ceil(value.length / 4) * 4,
      '=',
    );
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export function getOAuthSessionMaxAgeSeconds(): number {
  const raw = process.env.INKCRAFT_OAUTH_SESSION_MAX_AGE_SECONDS;
  if (!raw) return DEFAULT_SESSION_MAX_AGE_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_MAX_AGE_SECONDS;
}

export function getOAuthSessionSecret(): string | null {
  const secret =
    process.env.INKCRAFT_OAUTH_SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.INKCRAFT_OAUTH_CLIENT_SECRET ||
    process.env.ACCESS_CODE;

  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'openmaic-dev-session-secret';
  return null;
}

export async function createOAuthSessionToken(session: OAuthSession): Promise<string> {
  const secret = getOAuthSessionSecret();
  if (!secret) {
    throw new Error('INKCRAFT_OAUTH_SESSION_SECRET is required in production');
  }

  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(session)));
  const signature = base64UrlEncode(await hmacSha256(secret, payload));
  return `${payload}.${signature}`;
}

export async function verifyOAuthSessionToken(token: string): Promise<OAuthSession | null> {
  const secret = getOAuthSessionSecret();
  if (!secret) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const actual = base64UrlDecode(signature);
  if (!actual) return null;

  const expected = await hmacSha256(secret, payload);
  if (!timingSafeEqual(actual, expected)) return null;

  const payloadBytes = base64UrlDecode(payload);
  if (!payloadBytes) return null;

  try {
    const session = JSON.parse(new TextDecoder().decode(payloadBytes)) as OAuthSession;
    if (session.provider !== 'inkcraft') return null;
    if (!session.user?.id) return null;
    if (!session.expiresAt || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}
