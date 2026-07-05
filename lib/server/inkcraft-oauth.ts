import type { NextRequest } from 'next/server';
import { resolveRequestOrigin } from '@/lib/server/request-origin';

export const INKCRAFT_OAUTH_BASE_URL =
  process.env.INKCRAFT_OAUTH_BASE_URL?.replace(/\/+$/, '') || 'https://www.inkcraft.cn';
export const INKCRAFT_OAUTH_API_BASE_URL =
  process.env.INKCRAFT_OAUTH_API_BASE_URL?.replace(/\/+$/, '') || 'https://inkcraft-api.amzcd.top';
export const INKCRAFT_OAUTH_STATE_COOKIE = 'openmaic_oauth_state';
export const INKCRAFT_OAUTH_VERIFIER_COOKIE = 'openmaic_oauth_verifier';
export const INKCRAFT_OAUTH_RETURN_TO_COOKIE = 'openmaic_oauth_return_to';

export interface InkcraftOAuthConfig {
  baseUrl: string;
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  scope: string;
}

export interface InkcraftUserInfo {
  id: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export function getInkcraftOAuthConfig(): InkcraftOAuthConfig | null {
  const clientId = process.env.INKCRAFT_OAUTH_CLIENT_ID;
  if (!clientId) return null;

  const baseUrl = INKCRAFT_OAUTH_BASE_URL;
  const apiBaseUrl = INKCRAFT_OAUTH_API_BASE_URL;
  return {
    baseUrl,
    clientId,
    clientSecret: process.env.INKCRAFT_OAUTH_CLIENT_SECRET || undefined,
    authorizationEndpoint:
      process.env.INKCRAFT_OAUTH_AUTHORIZATION_ENDPOINT || `${baseUrl}/oauth/authorize`,
    tokenEndpoint: process.env.INKCRAFT_OAUTH_TOKEN_ENDPOINT || `${apiBaseUrl}/oauth/token`,
    userInfoEndpoint:
      process.env.INKCRAFT_OAUTH_USERINFO_ENDPOINT || `${apiBaseUrl}/oauth/userinfo`,
    scope: process.env.INKCRAFT_OAUTH_SCOPE || 'openid profile email',
  };
}

export function resolvePublicOrigin(req: NextRequest): string {
  const configuredRedirectUri = process.env.INKCRAFT_OAUTH_REDIRECT_URI;
  if (configuredRedirectUri) {
    return new URL(configuredRedirectUri).origin;
  }

  const publicUrl = process.env.MAIC_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL;
  return resolveRequestOrigin(req, {
    configuredOrigin: publicUrl,
    fallbackOrigin: 'http://localhost:3000',
  });
}

export function resolveOAuthRedirectUri(req: NextRequest): string {
  return `${resolvePublicOrigin(req)}/api/auth/callback`;
}

export function normalizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function normalizeInkcraftUser(raw: Record<string, unknown>): InkcraftUserInfo {
  const id =
    raw.sub ?? raw.id ?? raw.user_id ?? raw.userId ?? raw.openid ?? raw.uid ?? raw.username ?? null;
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new Error('Inkcraft userinfo response did not include a user id');
  }

  const name = raw.name ?? raw.nickname ?? raw.username ?? raw.display_name;
  const email = raw.email;
  const avatar = raw.avatar_url ?? raw.avatarUrl ?? raw.picture ?? raw.avatar;

  return {
    id: String(id),
    ...(typeof name === 'string' && name ? { name } : {}),
    ...(typeof email === 'string' && email ? { email } : {}),
    ...(typeof avatar === 'string' && avatar ? { avatarUrl: avatar } : {}),
  };
}
