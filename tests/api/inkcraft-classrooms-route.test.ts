import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalSecret = process.env.INKCRAFT_INTEGRATION_SECRET;
const originalFrontendUrl = process.env.INKCRAFT_CLASSROOM_FRONTEND_URL;
const originalMaicPublicUrl = process.env.MAIC_PUBLIC_URL;
const originalNextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

async function postInkcraftClassroom(
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  const { POST } = await import('@/app/api/inkcraft/classrooms/route');
  const request = {
    headers: new Headers({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-secret',
      ...headers,
    }),
    nextUrl: new URL('http://localhost:3000/api/inkcraft/classrooms'),
    json: async () => body,
  };
  return POST(request as unknown as NextRequest);
}

describe('POST /api/inkcraft/classrooms', () => {
  beforeEach(() => {
    process.env.INKCRAFT_INTEGRATION_SECRET = 'test-secret';
    delete process.env.INKCRAFT_CLASSROOM_FRONTEND_URL;
    delete process.env.MAIC_PUBLIC_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.INKCRAFT_INTEGRATION_SECRET;
    } else {
      process.env.INKCRAFT_INTEGRATION_SECRET = originalSecret;
    }
    if (originalFrontendUrl === undefined) {
      delete process.env.INKCRAFT_CLASSROOM_FRONTEND_URL;
    } else {
      process.env.INKCRAFT_CLASSROOM_FRONTEND_URL = originalFrontendUrl;
    }
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

  it('returns a browser launch URL instead of starting a server generation job', async () => {
    process.env.MAIC_PUBLIC_URL = 'https://maic.inkcraft.cn';

    const res = await postInkcraftClassroom({
      prompt: '写一个英语作文课',
      user: { id: 'u-1', name: 'Diyan' },
      enableWebSearch: true,
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toMatchObject({
      success: true,
      status: 'ready',
    });
    expect(json.jobId).toBeUndefined();
    expect(json.pollUrl).toBeUndefined();

    const url = new URL(json.classroomUrl);
    expect(url.origin).toBe('https://maic.inkcraft.cn');
    expect(url.pathname).toBe('/inkcraft/classroom-generator');
    expect(url.searchParams.get('prompt')).toBeNull();
    expect(url.searchParams.get('userNickname')).toBeNull();
    expect(url.searchParams.get('webSearch')).toBeNull();
    expect(url.searchParams.get('launchId')).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(json.url).toBe(json.classroomUrl);

    const { GET } = await import('@/app/api/inkcraft/classroom-launch/[launchId]/route');
    const launchRes = await GET({} as NextRequest, {
      params: Promise.resolve({ launchId: url.searchParams.get('launchId')! }),
    });
    const launchJson = await launchRes.json();

    expect(launchJson).toMatchObject({
      success: true,
      prompt: '写一个英语作文课',
      userNickname: 'Diyan',
      webSearch: true,
    });
  });

  it('falls back to the Inkcraft MAIC domain when only localhost is visible server-side', async () => {
    const res = await postInkcraftClassroom({
      prompt: 'lesson',
      user: 'u-2',
    });
    const json = await res.json();

    expect(new URL(json.classroomUrl).origin).toBe('https://maic.inkcraft.cn');
  });

  it('keeps the launch URL short for long prompts', async () => {
    process.env.MAIC_PUBLIC_URL = 'https://maic.inkcraft.cn';
    const longPrompt = '请基于这个主题创建视频课。'.repeat(500);

    const res = await postInkcraftClassroom({
      prompt: longPrompt,
      user: 'u-3',
    });
    const json = await res.json();
    const url = new URL(json.classroomUrl);

    expect(json.classroomUrl.length).toBeLessThan(160);
    expect(url.searchParams.get('prompt')).toBeNull();

    const { GET } = await import('@/app/api/inkcraft/classroom-launch/[launchId]/route');
    const launchRes = await GET({} as NextRequest, {
      params: Promise.resolve({ launchId: url.searchParams.get('launchId')! }),
    });
    const launchJson = await launchRes.json();

    expect(launchJson.prompt).toBe(longPrompt);
  });
});
