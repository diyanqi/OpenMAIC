import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildRequestOrigin } from '@/lib/server/classroom-storage';

const originalMaicPublicUrl = process.env.MAIC_PUBLIC_URL;
const originalNextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

function mockRequest(headers: Record<string, string>, origin = 'http://0.0.0.0:3000') {
  return {
    headers: new Headers(headers),
    nextUrl: new URL(`${origin}/api/generate-classroom`),
  } as NextRequest;
}

describe('buildRequestOrigin', () => {
  beforeEach(() => {
    delete process.env.MAIC_PUBLIC_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (originalMaicPublicUrl === undefined) {
      delete process.env.MAIC_PUBLIC_URL;
    } else {
      process.env.MAIC_PUBLIC_URL = originalMaicPublicUrl;
    }
    if (originalNextPublicAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalNextPublicAppUrl;
    }
  });

  it('prefers the configured public MAIC origin', () => {
    process.env.MAIC_PUBLIC_URL = 'https://maic.inkcraft.cn/some/path';

    expect(
      buildRequestOrigin(
        mockRequest({
          'x-forwarded-host': 'internal.example:3000',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://maic.inkcraft.cn');
  });

  it('removes an internal Next.js port leaked through forwarded HTTPS host', () => {
    expect(
      buildRequestOrigin(
        mockRequest({
          'x-forwarded-host': 'maic.inkcraft.cn:3000',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://maic.inkcraft.cn');
  });

  it('keeps the localhost development port', () => {
    expect(
      buildRequestOrigin(
        mockRequest(
          {
            host: 'localhost:3000',
          },
          'http://localhost:3000',
        ),
      ),
    ).toBe('http://localhost:3000');
  });

  it('uses the public browser origin when proxy headers only expose localhost', () => {
    expect(
      buildRequestOrigin(
        mockRequest(
          {
            host: 'localhost:3000',
            origin: 'https://maic.inkcraft.cn',
          },
          'http://localhost:3000',
        ),
      ),
    ).toBe('https://maic.inkcraft.cn');
  });

  it('uses the public referer when no origin header is present', () => {
    expect(
      buildRequestOrigin(
        mockRequest(
          {
            host: 'localhost:3000',
            referer: 'https://maic.inkcraft.cn/generation-preview?jobId=abc',
          },
          'http://localhost:3000',
        ),
      ),
    ).toBe('https://maic.inkcraft.cn');
  });
});
