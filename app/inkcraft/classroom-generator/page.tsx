'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { nanoid } from 'nanoid';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { GenerationSessionState } from '@/app/generation-preview/types';
import type { UserRequirements } from '@/lib/types/generation';

interface LaunchPayload {
  prompt: string;
  userNickname?: string;
  webSearch?: boolean;
  interactiveMode?: boolean;
  taskEngineMode?: boolean;
}

function InkcraftClassroomGeneratorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const submittedRef = useRef(false);

  const initialPrompt = useMemo(() => searchParams.get('prompt') || '', [searchParams]);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [launchPayload, setLaunchPayload] = useState<LaunchPayload | null>(null);
  const [error, setError] = useState('');

  const buildRequirements = (payload?: LaunchPayload): UserRequirements => {
    const source = payload || {
      prompt,
      userNickname: searchParams.get('userNickname') || undefined,
      webSearch: searchParams.get('webSearch') === '1',
      interactiveMode:
        searchParams.get('interactiveMode') === '1' || searchParams.get('taskEngineMode') === '1',
      taskEngineMode: searchParams.get('taskEngineMode') === '1',
    };
    return {
      requirement: source.prompt.trim(),
      ...(source.userNickname ? { userNickname: source.userNickname } : {}),
      ...(source.webSearch ? { webSearch: true } : {}),
      ...(source.interactiveMode || source.taskEngineMode ? { interactiveMode: true } : {}),
      ...(source.taskEngineMode ? { taskEngineMode: true } : {}),
    };
  };

  const submit = (payload?: LaunchPayload) => {
    const trimmed = (payload?.prompt ?? prompt).trim();
    if (!trimmed || submittedRef.current) return;
    submittedRef.current = true;

    const sessionState: GenerationSessionState = {
      sessionId: nanoid(),
      requirements: buildRequirements(payload),
      pdfText: '',
      pdfImages: [],
      imageStorageIds: [],
      sceneOutlines: null,
      currentStep: 'generating',
      previewPhase: 'preparing',
    };

    sessionStorage.setItem('generationSession', JSON.stringify(sessionState));
    router.replace('/generation-preview');
  };

  useEffect(() => {
    const launchId = searchParams.get('launchId');
    if (!launchId) return;

    let cancelled = false;
    fetch(`/api/inkcraft/classroom-launch/${encodeURIComponent(launchId)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || 'Failed to load classroom prompt');
        }
        if (cancelled) return;

        const payload: LaunchPayload = {
          prompt: data.prompt || '',
          ...(data.userNickname ? { userNickname: data.userNickname } : {}),
          ...(data.webSearch === true ? { webSearch: true } : {}),
          ...(data.interactiveMode === true ? { interactiveMode: true } : {}),
          ...(data.taskEngineMode === true ? { taskEngineMode: true } : {}),
        };
        setPrompt(payload.prompt);
        setLaunchPayload(payload);
        submit(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load prompt');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get('launchId')) return;
    if (!initialPrompt.trim()) return;
    const frame = requestAnimationFrame(() => submitButtonRef.current?.click());
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, searchParams]);

  const canSubmit = !!prompt.trim() && !submittedRef.current;

  return (
    <main className="flex min-h-[100dvh] w-full items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 text-slate-950 dark:from-slate-950 dark:to-slate-900 dark:text-slate-50">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-[800px]"
      >
        <div className="mb-6 flex justify-center">
          <img src="/logo-horizontal.png" alt="OpenMAIC" className="h-12 md:h-16" />
        </div>

        <div className="w-full rounded-2xl border border-border/60 bg-white/80 shadow-xl shadow-black/[0.03] backdrop-blur-xl transition-shadow focus-within:shadow-2xl focus-within:shadow-violet-500/[0.06] dark:bg-slate-900/80 dark:shadow-black/20">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                submitButtonRef.current?.click();
              }
            }}
            className="min-h-[180px] resize-none border-0 bg-transparent px-4 py-4 text-[13px] leading-relaxed focus-visible:ring-0"
            autoFocus
          />

          <div className="flex justify-end px-3 pb-3">
            <Button
              ref={submitButtonRef}
              type="button"
              onClick={() => submit(launchPayload || undefined)}
              disabled={!canSubmit}
              className={cn('h-8 gap-1.5 rounded-lg px-3 text-xs font-medium')}
            >
              Enter Classroom
              <ArrowUp className="size-3.5" />
            </Button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </motion.div>
    </main>
  );
}

export default function InkcraftClassroomGeneratorPage() {
  return (
    <Suspense fallback={null}>
      <InkcraftClassroomGeneratorContent />
    </Suspense>
  );
}
