import { describe, expect, it, vi } from 'vitest';
import type { ActionEngine } from '@/lib/action/engine';
import { PlaybackEngine } from '@/lib/playback/engine';
import type { Scene } from '@/lib/types/stage';
import type { AudioPlayer } from '@/lib/utils/audio-player';

function makeSpeechScene(): Scene {
  return {
    id: 'scene-1',
    stageId: 'stage-1',
    title: 'Scene 1',
    order: 0,
    type: 'slide',
    content: {
      type: 'slide',
      canvas: {
        elements: [],
        viewportSize: 1000,
        viewportRatio: 0.5625,
      },
    },
    actions: [
      {
        id: 'speech-1',
        type: 'speech',
        text: 'Hello from EdgeTTS',
        audioId: 'audio-1',
      },
    ],
  } as unknown as Scene;
}

function nextMicrotask(): Promise<void> {
  return Promise.resolve();
}

describe('PlaybackEngine TTS interruption handling', () => {
  it('does not fall back to browser TTS when generated audio playback is intentionally interrupted', async () => {
    let rejectPlay: ((error: unknown) => void) | undefined;
    const playPromise = new Promise<boolean>((_, reject) => {
      rejectPlay = reject;
    });
    const audioPlayer = {
      play: vi.fn(() => playPromise),
      onEnded: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      isPlaying: vi.fn(() => false),
      hasActiveAudio: vi.fn(() => false),
    } as unknown as AudioPlayer;
    const speak = vi.fn();

    vi.stubGlobal('window', {
      speechSynthesis: {
        speak,
        cancel: vi.fn(),
        getVoices: vi.fn(() => []),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const engine = new PlaybackEngine(
      [makeSpeechScene()],
      { clearEffects: vi.fn() } as unknown as ActionEngine,
      audioPlayer,
      {},
    );

    engine.start();
    engine.stop();
    rejectPlay?.(Object.assign(new Error('The play() request was interrupted by a call to pause()'), {
      name: 'AbortError',
    }));
    await nextMicrotask();

    expect(speak).not.toHaveBeenCalled();
  });
});
