import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';

const INKCRAFT_CLASSROOM_LAUNCHES_DIR = path.join(
  process.cwd(),
  'data',
  'inkcraft-classroom-launches',
);

export interface InkcraftClassroomLaunch {
  id: string;
  prompt: string;
  userId: string;
  userNickname?: string;
  webSearch?: boolean;
  interactiveMode?: boolean;
  taskEngineMode?: boolean;
  createdAt: string;
}

function launchFilePath(id: string) {
  return path.join(INKCRAFT_CLASSROOM_LAUNCHES_DIR, `${id}.json`);
}

export function isValidInkcraftClassroomLaunchId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function createInkcraftClassroomLaunch(
  input: Omit<InkcraftClassroomLaunch, 'id' | 'createdAt'>,
): Promise<InkcraftClassroomLaunch> {
  const launch: InkcraftClassroomLaunch = {
    id: nanoid(21),
    ...input,
    createdAt: new Date().toISOString(),
  };
  await writeJsonFileAtomic(launchFilePath(launch.id), launch);
  return launch;
}

export async function readInkcraftClassroomLaunch(
  id: string,
): Promise<InkcraftClassroomLaunch | null> {
  if (!isValidInkcraftClassroomLaunchId(id)) return null;
  try {
    const content = await fs.readFile(launchFilePath(id), 'utf-8');
    return JSON.parse(content) as InkcraftClassroomLaunch;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
