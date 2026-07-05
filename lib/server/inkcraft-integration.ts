import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { apiError } from '@/lib/server/api-response';

export interface InkcraftExternalUser {
  id: string;
  name?: string;
  email?: string;
}

function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}

export function verifyInkcraftIntegrationRequest(req: NextRequest) {
  const secret = process.env.INKCRAFT_INTEGRATION_SECRET;
  if (!secret) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'INKCRAFT_INTEGRATION_SECRET is not configured',
    );
  }

  const auth = req.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = bearer || req.headers.get('x-inkcraft-secret') || '';

  if (!token || !safeEqual(token, secret)) {
    return apiError('INVALID_REQUEST', 401, 'Invalid Inkcraft integration token');
  }

  return null;
}

export function normalizeInkcraftExternalUser(value: unknown): InkcraftExternalUser | null {
  if (typeof value === 'string') {
    const id = value.trim();
    return id ? { id } : null;
  }

  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = record.id ?? record.userId ?? record.user_id ?? record.sub ?? record.openid;
  if (typeof id !== 'string' && typeof id !== 'number') return null;

  const name = record.name ?? record.nickname ?? record.username;
  const email = record.email;
  return {
    id: String(id),
    ...(typeof name === 'string' && name ? { name } : {}),
    ...(typeof email === 'string' && email ? { email } : {}),
  };
}
