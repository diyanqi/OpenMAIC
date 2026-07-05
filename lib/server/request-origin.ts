import type { NextRequest } from 'next/server';

export interface ResolveRequestOriginOptions {
  configuredOrigin?: string | null;
  fallbackOrigin?: string;
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null;
}

function normalizeConfiguredOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeProtocol(value: string | null | undefined): 'http' | 'https' {
  const normalized = (value || '').replace(/:$/, '').toLowerCase();
  return normalized === 'http' ? 'http' : 'https';
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function hasUnroutableHostname(origin: string): boolean {
  try {
    const normalized = new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return normalized === '0.0.0.0' || normalized === '::';
  } catch {
    return true;
  }
}

function hasInternalHostname(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return isLoopbackHostname(hostname) || hasUnroutableHostname(origin);
  } catch {
    return true;
  }
}

function isDefaultPort(protocol: 'http' | 'https', port: string): boolean {
  return (protocol === 'http' && port === '80') || (protocol === 'https' && port === '443');
}

function originFromUrlHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    const origin = new URL(value).origin;
    return hasUnroutableHostname(origin) ? null : origin;
  } catch {
    return null;
  }
}

function originFromHost(
  host: string,
  protocol: 'http' | 'https',
  forwardedPort?: string | null,
): string | null {
  try {
    const url = new URL(`${protocol}://${host}`);
    const port = forwardedPort && /^\d+$/.test(forwardedPort) ? forwardedPort : null;

    if (port) {
      url.port = isDefaultPort(protocol, port) ? '' : port;
    } else if (protocol === 'https' && url.port === '3000' && !isLoopbackHostname(url.hostname)) {
      // Common reverse-proxy misconfiguration: x-forwarded-host leaks the
      // internal Next.js port even though the public URL is standard HTTPS.
      url.port = '';
    }

    const origin = url.origin;
    return hasUnroutableHostname(origin) ? null : origin;
  } catch {
    return null;
  }
}

export function resolveRequestOrigin(
  req: NextRequest,
  options: ResolveRequestOriginOptions = {},
): string {
  const configured = normalizeConfiguredOrigin(options.configuredOrigin);
  if (configured) return configured;

  const requestOrigin =
    originFromUrlHeader(firstHeaderValue(req.headers.get('origin'))) ||
    originFromUrlHeader(firstHeaderValue(req.headers.get('referer')));

  const forwardedHost = firstHeaderValue(req.headers.get('x-forwarded-host'));
  if (forwardedHost) {
    const protocol = normalizeProtocol(firstHeaderValue(req.headers.get('x-forwarded-proto')));
    const origin = originFromHost(
      forwardedHost,
      protocol,
      firstHeaderValue(req.headers.get('x-forwarded-port')),
    );
    if (origin && !hasInternalHostname(origin)) return origin;
  }

  const host = firstHeaderValue(req.headers.get('host'));
  if (host) {
    const protocol =
      firstHeaderValue(req.headers.get('x-forwarded-proto')) ||
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    const origin = originFromHost(host, normalizeProtocol(protocol));
    if (origin && !hasInternalHostname(origin)) return origin;
  }

  if (requestOrigin && !hasInternalHostname(requestOrigin)) {
    return requestOrigin;
  }

  if (!hasInternalHostname(req.nextUrl.origin)) {
    return req.nextUrl.origin;
  }

  if (forwardedHost) {
    const protocol = normalizeProtocol(firstHeaderValue(req.headers.get('x-forwarded-proto')));
    const origin = originFromHost(
      forwardedHost,
      protocol,
      firstHeaderValue(req.headers.get('x-forwarded-port')),
    );
    if (origin) return origin;
  }

  if (host) {
    const protocol =
      firstHeaderValue(req.headers.get('x-forwarded-proto')) ||
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    const origin = originFromHost(host, normalizeProtocol(protocol));
    if (origin) return origin;
  }

  return options.fallbackOrigin || 'http://localhost:3000';
}
