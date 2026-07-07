import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  normalizeInkcraftExternalUser,
  verifyInkcraftIntegrationRequest,
} from '@/lib/server/inkcraft-integration';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createInkcraftClassroomLaunch } from '@/lib/server/inkcraft-classroom-launch-store';
import { resolvePublicOrigin } from '@/lib/server/inkcraft-oauth';
import { createLogger } from '@/lib/logger';

const log = createLogger('InkcraftClassrooms API');

export const maxDuration = 30;

type InkcraftCreateClassroomBody = {
  prompt?: string;
  requirement?: string;
  user?: unknown;
  options?: {
    enableWebSearch?: boolean;
    interactiveMode?: boolean;
    taskEngineMode?: boolean;
  };
  enableWebSearch?: boolean;
  interactiveMode?: boolean;
  taskEngineMode?: boolean;
};

function boolOption(
  body: InkcraftCreateClassroomBody,
  key: 'enableWebSearch' | 'interactiveMode' | 'taskEngineMode',
) {
  return body.options?.[key] ?? body[key];
}

async function buildLaunchUrl(
  req: NextRequest,
  body: InkcraftCreateClassroomBody,
): Promise<string | Response> {
  const prompt = (body.prompt || body.requirement || '').trim();
  if (!prompt) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: prompt');
  }

  const user = normalizeInkcraftExternalUser(body.user);
  if (!user) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: user');
  }

  const launch = await createInkcraftClassroomLaunch({
    prompt,
    userId: user.id,
    userNickname: user.name || user.id,
    ...(boolOption(body, 'enableWebSearch') === true ? { webSearch: true } : {}),
    ...(boolOption(body, 'interactiveMode') === true ? { interactiveMode: true } : {}),
    ...(boolOption(body, 'taskEngineMode') === true ? { taskEngineMode: true } : {}),
  });

  const origin = resolveInkcraftFrontendOrigin(req);
  const url = new URL('/inkcraft/classroom-generator', origin);
  url.searchParams.set('launchId', launch.id);
  return url.toString();
}

function resolveInkcraftFrontendOrigin(req: NextRequest): string {
  const configured =
    process.env.INKCRAFT_CLASSROOM_FRONTEND_URL ||
    process.env.MAIC_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return new URL(configured).origin;

  const publicOrigin = resolvePublicOrigin(req);
  if (!isInternalOrigin(publicOrigin)) return publicOrigin;

  const requestOrigin = buildRequestOrigin(req);
  if (!isInternalOrigin(requestOrigin)) return requestOrigin;

  return 'https://maic.inkcraft.cn';
}

function isInternalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '::'
    );
  } catch {
    return true;
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = verifyInkcraftIntegrationRequest(req);
  if (unauthorized) return unauthorized;

  let promptSnippet: string | undefined;
  try {
    const body = (await req.json()) as InkcraftCreateClassroomBody;
    promptSnippet = (body.prompt || body.requirement || '').slice(0, 60);
    const launchUrl = await buildLaunchUrl(req, body);
    if (launchUrl instanceof Response) return launchUrl;

    return apiSuccess(
      {
        status: 'ready',
        classroomUrl: launchUrl,
        url: launchUrl,
      },
      201,
    );
  } catch (error) {
    log.error(
      `Inkcraft classroom creation failed [prompt="${promptSnippet ?? 'unknown'}..."]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom from Inkcraft request',
      error instanceof Error ? error.message : String(error),
    );
  }
}
