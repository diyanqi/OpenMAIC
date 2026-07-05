import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidClassroomJobId,
  readClassroomGenerationJob,
} from '@/lib/server/classroom-job-store';
import { verifyInkcraftIntegrationRequest } from '@/lib/server/inkcraft-integration';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('InkcraftClassroomJob API');

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const unauthorized = verifyInkcraftIntegrationRequest(req);
  if (unauthorized) return unauthorized;

  let resolvedJobId: string | undefined;
  try {
    const { jobId } = await context.params;
    resolvedJobId = jobId;

    if (!isValidClassroomJobId(jobId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid classroom generation job id');
    }

    const job = await readClassroomGenerationJob(jobId);
    if (!job) {
      return apiError('INVALID_REQUEST', 404, 'Classroom generation job not found');
    }

    const origin = buildRequestOrigin(req);
    const statusUrl = `${origin}/api/inkcraft/classrooms/${jobId}`;
    return apiSuccess({
      jobId: job.id,
      status: job.status,
      step: job.step,
      progress: job.progress,
      message: job.message,
      statusUrl,
      pollUrl: statusUrl,
      pollIntervalMs: 5000,
      scenesGenerated: job.scenesGenerated,
      totalScenes: job.totalScenes,
      classroomId: job.result?.classroomId ?? null,
      classroomUrl: job.result ? `${origin}/classroom/${job.result.classroomId}` : null,
      scenesCount: job.result?.scenesCount ?? null,
      error: job.error,
      done: job.status === 'succeeded' || job.status === 'failed',
    });
  } catch (error) {
    log.error(`Inkcraft classroom job retrieval failed [jobId=${resolvedJobId ?? 'unknown'}]:`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to retrieve Inkcraft classroom job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
