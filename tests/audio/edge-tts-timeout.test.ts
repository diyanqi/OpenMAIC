import { afterEach, describe, expect, it, vi } from 'vitest';

// Simulate the edge-tts-universal hang: its WebSocket only awaits the 'open'
// event, so a stalled/unreachable connection never yields or rejects.
vi.mock('edge-tts-universal', () => ({
  Communicate: class {
    async *stream(): AsyncGenerator<unknown> {
      await new Promise(() => {});
    }
  },
}));

import { generateTTS } from '@/lib/audio/tts-providers';
import type { TTSModelConfig } from '@/lib/audio/types';

describe('Edge TTS resilience', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects instead of hanging when the Edge TTS stream stalls', async () => {
    vi.useFakeTimers();

    const promise = generateTTS(
      { providerId: 'edge-tts', voice: 'zh-CN-XiaoxiaoNeural' } as TTSModelConfig,
      'hello',
    );
    const expectation = expect(promise).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(25_000);
    await expectation;
  });
});
