import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

const ttsMock = vi.hoisted(() => ({
  setMetadata: vi.fn(),
  toStream: vi.fn(),
  close: vi.fn(),
  constructorOptions: undefined as unknown,
}));

vi.mock('msedge-tts', () => ({
  OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3' },
  MsEdgeTTS: class {
    setMetadata = ttsMock.setMetadata;
    toStream = ttsMock.toStream;
    close = ttsMock.close;
    constructor(options?: unknown) {
      ttsMock.constructorOptions = options;
    }
  },
}));

import { generateTTS } from '@/lib/audio/tts-providers';
import type { TTSModelConfig } from '@/lib/audio/types';

const config = { providerId: 'edge-tts', voice: 'zh-CN-XiaoxiaoNeural' } as TTSModelConfig;

describe('Edge TTS provider', () => {
  afterEach(() => {
    vi.resetAllMocks();
    ttsMock.constructorOptions = undefined;
  });

  it('synthesizes MP3 audio through msedge-tts', async () => {
    ttsMock.setMetadata.mockResolvedValue(undefined);
    ttsMock.toStream.mockReturnValue({
      audioStream: Readable.from([Buffer.from([1, 2]), Buffer.from([3, 4, 5])]),
      metadataStream: null,
    });

    const result = await generateTTS(config, '你好');

    expect(ttsMock.setMetadata).toHaveBeenCalledWith(
      'zh-CN-XiaoxiaoNeural',
      'audio-24khz-48kbitrate-mono-mp3',
    );
    expect(Array.from(result.audio)).toEqual([1, 2, 3, 4, 5]);
    expect(result.format).toBe('mp3');
    expect(ttsMock.constructorOptions).toMatchObject({
      connectionTimeoutMs: expect.any(Number),
      synthesisTimeoutMs: expect.any(Number),
    });
    expect(ttsMock.close).toHaveBeenCalledOnce();
  });

  it('propagates upstream errors (e.g. 429) and still closes the client', async () => {
    ttsMock.setMetadata.mockRejectedValue(
      Object.assign(new Error('Unexpected server response: 429'), { statusCode: 429 }),
    );

    await expect(generateTTS(config, '你好')).rejects.toThrow(/429/);
    expect(ttsMock.close).toHaveBeenCalledOnce();
  });

  it('rejects when upstream returns no audio', async () => {
    ttsMock.setMetadata.mockResolvedValue(undefined);
    ttsMock.toStream.mockReturnValue({ audioStream: Readable.from([]), metadataStream: null });

    await expect(generateTTS(config, '你好')).rejects.toThrow(/no audio/i);
    expect(ttsMock.close).toHaveBeenCalledOnce();
  });
});
