import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidInkcraftClassroomLaunchId,
  readInkcraftClassroomLaunch,
} from '@/lib/server/inkcraft-classroom-launch-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('InkcraftClassroomLaunch API');

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ launchId: string }> }) {
  let resolvedLaunchId: string | undefined;
  try {
    const { launchId } = await context.params;
    resolvedLaunchId = launchId;

    if (!isValidInkcraftClassroomLaunchId(launchId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid Inkcraft classroom launch id');
    }

    const launch = await readInkcraftClassroomLaunch(launchId);
    if (!launch) {
      return apiError('INVALID_REQUEST', 404, 'Inkcraft classroom launch not found');
    }

    return apiSuccess({
      launchId: launch.id,
      prompt: launch.prompt,
      userId: launch.userId,
      userNickname: launch.userNickname,
      webSearch: launch.webSearch === true,
      interactiveMode: launch.interactiveMode === true,
      taskEngineMode: launch.taskEngineMode === true,
    });
  } catch (error) {
    log.error(
      `Inkcraft classroom launch retrieval failed [launchId=${resolvedLaunchId ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to retrieve Inkcraft classroom launch',
      error instanceof Error ? error.message : String(error),
    );
  }
}
