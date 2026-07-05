import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { VIDEO_PROVIDERS, normalizeVideoOptions } from '@/lib/media/video-providers';
import { generateWithAgnesImage } from '@/lib/media/adapters/agnes-image-adapter';
import { generateWithAgnesVideo } from '@/lib/media/adapters/agnes-video-adapter';

describe('Agnes media providers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('registers Agnes image and video models', () => {
    expect(IMAGE_PROVIDERS.agnes.models.map((model) => model.id)).toContain(
      'agnes-image-2.1-flash',
    );
    expect(VIDEO_PROVIDERS.agnes.models.map((model) => model.id)).toContain('agnes-video-v2.0');
  });

  it('rotates to the next Agnes image key when the current key is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ url: 'https://cdn.example.com/i.png' }] }), {
          status: 200,
        }),
      );

    const result = await generateWithAgnesImage(
      { providerId: 'agnes', apiKey: 'key-a,key-b', model: 'agnes-image-2.1-flash' },
      { prompt: 'city', width: 1024, height: 768 },
    );

    expect(result.url).toBe('https://cdn.example.com/i.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer key-a',
    );
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer key-b',
    );
  });

  it('submits Agnes video jobs and polls by video_id with the same key', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            task_id: 'task-1',
            video_id: 'video-1',
            status: 'queued',
            seconds: '5.0',
            size: '1280x720',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            video_id: 'video-1',
            status: 'completed',
            seconds: '5.0',
            size: '1280x720',
            remixed_from_video_id: 'https://cdn.example.com/v.mp4',
          }),
          { status: 200 },
        ),
      );

    const promise = generateWithAgnesVideo(
      { providerId: 'agnes', apiKey: 'video-key', model: 'agnes-video-v2.0' },
      normalizeVideoOptions('agnes', {
        prompt: 'camera move',
        duration: 5,
        aspectRatio: '16:9',
        resolution: '720p',
      }),
    );

    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.url).toBe('https://cdn.example.com/v.mp4');
    const submitBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(submitBody.model).toBe('agnes-video-v2.0');
    expect(submitBody.num_frames).toBe(121);
    expect(fetchMock.mock.calls[1][0].toString()).toContain('/agnesapi?video_id=video-1');
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe(
      'Bearer video-key',
    );
  });
});
