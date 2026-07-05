/**
 * Agnes Image 2.1 Flash adapter.
 * API: POST /v1/images/generations
 */

import type {
  ImageGenerationConfig,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '../types';
import {
  getRotatedAgnesApiKeys,
  shouldTryNextAgnesKey,
  splitAgnesApiKeys,
} from './agnes-key-rotation';

const DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com';
const DEFAULT_MODEL = 'agnes-image-2.1-flash';

function buildAgnesUrl(baseUrl: string | undefined, path: string): string {
  const base = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  if (base.endsWith('/v1') && path.startsWith('/v1/')) {
    return `${base}${path.slice(3)}`;
  }
  return `${base}${path}`;
}

function resolveSize(options: ImageGenerationOptions): {
  size: string;
  width: number;
  height: number;
} {
  const width = options.width || 1024;
  const height = options.height || 1024;
  return { size: `${width}x${height}`, width, height };
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => response.statusText);
  return text || response.statusText;
}

export async function generateWithAgnesImage(
  config: ImageGenerationConfig,
  options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const keys = getRotatedAgnesApiKeys('image', config.apiKey);
  if (keys.length === 0) throw new Error('Agnes Image API key is required');

  const { size, width, height } = resolveSize(options);
  let lastError: Error | undefined;

  for (const key of keys) {
    const response = await fetch(buildAgnesUrl(config.baseUrl, '/v1/images/generations'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        prompt: options.prompt,
        size,
        extra_body: {
          response_format: 'url',
        },
      }),
    });

    if (!response.ok) {
      const err = new Error(
        `Agnes Image API error (${response.status}): ${await readError(response)}`,
      );
      lastError = err;
      if (keys.length > 1 && shouldTryNextAgnesKey(response.status)) continue;
      throw err;
    }

    const data = await response.json();
    const imageData = data?.data?.[0];
    if (!imageData?.url && !imageData?.b64_json) {
      throw new Error(`Agnes Image returned empty image response: ${JSON.stringify(data)}`);
    }

    return {
      url: imageData.url,
      base64: imageData.b64_json,
      width,
      height,
    };
  }

  throw lastError || new Error('Agnes Image generation failed');
}

export async function testAgnesImageConnectivity(
  config: ImageGenerationConfig,
): Promise<{ success: boolean; message: string }> {
  const key = splitAgnesApiKeys(config.apiKey)[0];
  if (!key) return { success: false, message: 'Agnes Image API key is required' };

  try {
    const response = await fetch(buildAgnesUrl(config.baseUrl, '/v1/images/generations'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        prompt: 'test',
        size: '1024x1024',
        extra_body: { response_format: 'url' },
      }),
    });

    if (response.ok) return { success: true, message: 'Agnes Image API connected' };
    return {
      success: false,
      message: `API error (${response.status}): ${await readError(response)}`,
    };
  } catch (err) {
    return { success: false, message: `Connection failed: ${(err as Error).message}` };
  }
}
