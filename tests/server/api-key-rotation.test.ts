import { describe, expect, it, vi } from 'vitest';

import {
  fetchWithRotatingBearerAuth,
  getFirstApiKey,
  getRotatedApiKeys,
  splitApiKeys,
} from '@/lib/server/api-key-rotation';

describe('api-key-rotation', () => {
  it('splits comma, semicolon, and newline separated keys', () => {
    expect(splitApiKeys(' sk-a,sk-b;\nsk-c\n\n')).toEqual(['sk-a', 'sk-b', 'sk-c']);
    expect(getFirstApiKey(' sk-a,sk-b ')).toBe('sk-a');
  });

  it('rotates the starting key per scope', () => {
    expect(getRotatedApiKeys('unit:rotation', 'sk-a,sk-b,sk-c')).toEqual(['sk-a', 'sk-b', 'sk-c']);
    expect(getRotatedApiKeys('unit:rotation', 'sk-a,sk-b,sk-c')).toEqual(['sk-b', 'sk-c', 'sk-a']);
  });

  it('tries the next key for retryable upstream statuses', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await fetchWithRotatingBearerAuth(
      'unit:fetch',
      'sk-a,sk-b',
      'https://api.example.com/v1/test',
      { headers: { 'Content-Type': 'application/json' } },
      fetchMock,
    );

    expect(await response.text()).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer sk-a',
    );
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe(
      'Bearer sk-b',
    );
  });
});
