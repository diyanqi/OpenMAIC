import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  normalizeInkcraftExternalUser,
  verifyInkcraftIntegrationRequest,
} from '@/lib/server/inkcraft-integration';
import {
  generateClassroom,
  type GenerateClassroomInput,
} from '@/lib/server/classroom-generation';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('InkcraftClassrooms API');

export const maxDuration = 30;

type InkcraftCreateClassroomBody = {
  prompt?: string;
  requirement?: string;
  user?: unknown;
  wait?: boolean;
  options?: Partial<GenerateClassroomInput>;
} & Partial<GenerateClassroomInput>;

function boolOption(
  body: InkcraftCreateClassroomBody,
  key: 'enableWebSearch' | 'enableImageGeneration' | 'enableVideoGeneration' | 'enableTTS',
) {
  return body.options?.[key] ?? body[key];
}

function buildInput(body: InkcraftCreateClassroomBody): GenerateClassroomInput | Response {
  const prompt = (body.prompt || body.requirement || '').trim();
  if (!prompt) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: prompt');
  }

  const user = normalizeInkcraftExternalUser(body.user);
  if (!user) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: user');
  }

  return {
    requirement: prompt,
    userId: user.id,
    userNickname: user.name || user.id,
    source: 'inkcraft',
    ...(body.pdfContent ? { pdfContent: body.pdfContent } : {}),
    ...(boolOption(body, 'enableWebSearch') != null
      ? { enableWebSearch: boolOption(body, 'enableWebSearch') }
      : {}),
    ...(body.webSearchProviderId ? { webSearchProviderId: body.webSearchProviderId } : {}),
    ...(body.webSearchApiKey ? { webSearchApiKey: body.webSearchApiKey } : {}),
    ...(body.baiduSubSources ? { baiduSubSources: body.baiduSubSources } : {}),
    ...(boolOption(body, 'enableImageGeneration') != null
      ? { enableImageGeneration: boolOption(body, 'enableImageGeneration') }
      : {}),
    ...(boolOption(body, 'enableVideoGeneration') != null
      ? { enableVideoGeneration: boolOption(body, 'enableVideoGeneration') }
      : {}),
    ...(boolOption(body, 'enableTTS') != null ? { enableTTS: boolOption(body, 'enableTTS') } : {}),
    ...(body.options?.agentMode || body.agentMode
      ? { agentMode: body.options?.agentMode || body.agentMode }
      : {}),
  };
}

export async function POST(req: NextRequest) {
  const unauthorized = verifyInkcraftIntegrationRequest(req);
  if (unauthorized) return unauthorized;

  let promptSnippet: string | undefined;
  try {
    const body = (await req.json()) as InkcraftCreateClassroomBody;
    promptSnippet = (body.prompt || body.requirement || '').slice(0, 60);
    const input = buildInput(body);
    if (input instanceof Response) return input;

    const baseUrl = buildRequestOrigin(req);
    const wait = body.wait === true || req.nextUrl.searchParams.get('wait') === 'true';

    if (wait) {
      const result = await generateClassroom(input, { baseUrl });
      return apiSuccess(
        {
          status: 'succeeded',
          classroomId: result.id,
          classroomUrl: result.url,
          scenesCount: result.scenesCount,
        },
        201,
      );
    }

    const jobId = nanoid(10);
    const job = await createClassroomGenerationJob(jobId, input);
    const statusUrl = `${baseUrl}/api/inkcraft/classrooms/${jobId}`;
    after(() => runClassroomGenerationJob(jobId, input, baseUrl));

    return apiSuccess(
      {
        jobId,
        status: job.status,
        step: job.step,
        message: job.message,
        statusUrl,
        pollUrl: statusUrl,
        pollIntervalMs: 5000,
        classroomUrl: null,
      },
      202,
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
