/**
 * Agnes Video V2.0 adapter.
 * API: POST /v1/videos + GET /agnesapi?video_id=...
 */

import type {
  VideoGenerationConfig,
  VideoGenerationOptions,
  VideoGenerationResult,
} from '../types';
import {
  getRotatedAgnesApiKeys,
  shouldTryNextAgnesKey,
  splitAgnesApiKeys,
} from './agnes-key-rotation';

const DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com';
const DEFAULT_MODEL = 'agnes-video-v2.0';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120;
const DEFAULT_FRAME_RATE = 24;

interface AgnesSubmitResponse {
  id?: string;
  task_id?: string;
  video_id?: string;
  status?: string;
  seconds?: string;
  size?: string;
  error?: unknown;
}

interface AgnesPollResponse {
  id?: string;
  video_id?: string;
  status?: 'queued' | 'in_progress' | 'completed' | 'failed' | string;
  progress?: number;
  seconds?: string;
  size?: string;
  remixed_from_video_id?: string;
  error?: unknown;
}

function buildAgnesUrl(baseUrl: string | undefined, path: string): string {
  const base = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  if (base.endsWith('/v1') && path.startsWith('/v1/')) {
    return `${base}${path.slice(3)}`;
  }
  if (base.endsWith('/v1') && path.startsWith('/agnesapi')) {
    return `${base.slice(0, -3)}${path}`;
  }
  return `${base}${path}`;
}

function resolveDimensions(options: VideoGenerationOptions): { width: number; height: number } {
  const ratio = options.aspectRatio || '16:9';
  const resolution = options.resolution || '720p';
  const baseHeight = resolution === '1080p' ? 1080 : resolution === '480p' ? 480 : 720;
  const [rw, rh] = ratio.split(':').map(Number);
  if (!rw || !rh) return { width: 1280, height: 720 };
  return {
    width: Math.round((baseHeight * rw) / rh),
    height: baseHeight,
  };
}

function resolveFrameCount(duration: number): number {
  const requested = Math.round(duration * DEFAULT_FRAME_RATE);
  const normalized = Math.max(81, Math.round((requested - 1) / 8) * 8 + 1);
  return Math.min(normalized, 441);
}

function parseSize(size: string | undefined, fallback: { width: number; height: number }) {
  const [width, height] = (size || '').split('x').map((part) => Number.parseInt(part, 10));
  if (width > 0 && height > 0) return { width, height };
  return fallback;
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => response.statusText);
  return text || response.statusText;
}

async function submitTask(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
  key: string,
): Promise<AgnesSubmitResponse> {
  const duration = options.duration || 5;
  const dimensions = resolveDimensions(options);
  const response = await fetch(buildAgnesUrl(config.baseUrl, '/v1/videos'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_MODEL,
      prompt: options.prompt,
      width: dimensions.width,
      height: dimensions.height,
      num_frames: resolveFrameCount(duration),
      frame_rate: DEFAULT_FRAME_RATE,
    }),
  });

  if (!response.ok) {
    throw new Error(`Agnes Video submit error (${response.status}): ${await readError(response)}`);
  }

  return response.json() as Promise<AgnesSubmitResponse>;
}

async function pollTask(
  config: VideoGenerationConfig,
  key: string,
  videoId: string,
): Promise<AgnesPollResponse> {
  const url = new URL(buildAgnesUrl(config.baseUrl, '/agnesapi'));
  url.searchParams.set('video_id', videoId);
  url.searchParams.set('model_name', config.model || DEFAULT_MODEL);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Agnes Video poll error (${response.status}): ${await readError(response)}`);
  }

  return response.json() as Promise<AgnesPollResponse>;
}

function formatAgnesError(error: unknown): string {
  if (!error) return 'unknown';
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function generateWithAgnesVideo(
  config: VideoGenerationConfig,
  options: VideoGenerationOptions,
): Promise<VideoGenerationResult> {
  const keys = getRotatedAgnesApiKeys('video', config.apiKey);
  if (keys.length === 0) throw new Error('Agnes Video API key is required');

  let submit: AgnesSubmitResponse | undefined;
  let selectedKey = '';
  let lastError: Error | undefined;

  for (const key of keys) {
    try {
      submit = await submitTask(config, options, key);
      selectedKey = key;
      break;
    } catch (err) {
      lastError = err as Error;
      const status = Number(lastError.message.match(/\((\d+)\)/)?.[1] || 0);
      if (keys.length > 1 && shouldTryNextAgnesKey(status)) continue;
      throw lastError;
    }
  }

  if (!submit || !selectedKey) {
    throw lastError || new Error('Agnes Video submit failed');
  }

  const videoId = submit.video_id;
  if (!videoId) {
    throw new Error(`Agnes Video: no video_id returned. Response: ${JSON.stringify(submit)}`);
  }

  let lastStatus = submit.status || 'queued';
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const result = await pollTask(config, selectedKey, videoId);
    lastStatus = result.status || lastStatus;

    if (result.status === 'completed') {
      const url = result.remixed_from_video_id;
      if (!url) {
        throw new Error(`Agnes Video: completed task returned no video URL`);
      }
      const fallback = resolveDimensions(options);
      const dimensions = parseSize(result.size || submit.size, fallback);
      return {
        url,
        width: dimensions.width,
        height: dimensions.height,
        duration:
          Number.parseFloat(result.seconds || submit.seconds || '') || options.duration || 5,
      };
    }

    if (result.status === 'failed') {
      throw new Error(`Agnes Video generation failed: ${formatAgnesError(result.error)}`);
    }
  }

  throw new Error(
    `Agnes Video: timeout after ${MAX_POLL_ATTEMPTS} polls, last status: ${lastStatus}`,
  );
}

export async function testAgnesVideoConnectivity(
  config: VideoGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const key = splitAgnesApiKeys(config.apiKey)[0];
  if (!key) return { success: false, message: 'Agnes Video API key is required' };

  try {
    const response = await fetch(buildAgnesUrl(config.baseUrl, '/v1/videos'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        prompt: 'test connectivity',
        width: 1280,
        height: 720,
        num_frames: 81,
        frame_rate: DEFAULT_FRAME_RATE,
      }),
    });

    if (response.ok) return { success: true, message: 'Agnes Video API connected' };
    return {
      success: false,
      message: `API error (${response.status}): ${await readError(response)}`,
    };
  } catch (err) {
    return { success: false, message: `Connection failed: ${(err as Error).message}` };
  }
}
