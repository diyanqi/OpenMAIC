'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  Atom,
  BookOpen,
  Check,
  Clock,
  Copy,
  Monitor,
  Moon,
  Pencil,
  Search,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Slide } from '@openmaic/dsl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SlideThumbnail } from '@/components/slide-renderer/SlideThumbnail';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import { createLogger } from '@/lib/logger';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { cn } from '@/lib/utils';
import {
  deleteStageData,
  getFirstSlideByStages,
  listStages,
  renameStage,
  revokeThumbnailSlideMediaUrls,
  type StageListItem,
} from '@/lib/utils/stage-storage';

const log = createLogger('Home');

function HomePage() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [themeOpen, setThemeOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const thumbnailsRef = useRef<Record<string, Slide>>({});
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const themeOptions = [
    { value: 'light' as const, Icon: Sun, label: t('settings.themeOptions.light') },
    { value: 'dark' as const, Icon: Moon, label: t('settings.themeOptions.dark') },
    { value: 'system' as const, Icon: Monitor, label: t('settings.themeOptions.system') },
  ];

  const replaceThumbnails = useCallback((slides: Record<string, Slide>) => {
    const previous = thumbnailsRef.current;
    thumbnailsRef.current = slides;
    setThumbnails(slides);
    window.setTimeout(() => revokeThumbnailSlideMediaUrls(previous), 0);
  }, []);

  const loadClassrooms = useCallback(async () => {
    try {
      const list = await listStages();
      setClassrooms(list);
      replaceThumbnails(list.length > 0 ? await getFirstSlideByStages(list.map((c) => c.id)) : {});
    } catch (err) {
      log.error('Failed to load classrooms:', err);
    }
  }, [replaceThumbnails]);

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrates recent classrooms from IndexedDB on mount. */
  useEffect(() => {
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });
    void loadClassrooms();
    return () => {
      revokeThumbnailSlideMediaUrls(thumbnailsRef.current);
      thumbnailsRef.current = {};
    };
  }, [loadClassrooms]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!themeOpen) return;
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeOpen]);

  const filteredClassrooms = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return classrooms;
    return classrooms.filter((c) => {
      const name = c.name?.toLowerCase() ?? '';
      const desc = c.description?.toLowerCase() ?? '';
      return name.includes(q) || desc.includes(q);
    });
  }, [classrooms, deferredSearchQuery]);

  const handleDelete = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      await deleteStageData(id);
      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error('Failed to delete classroom');
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await renameStage(id, newName);
      setClassrooms((prev) => prev.map((c) => (c.id === id ? { ...c, name: newName } : c)));
    } catch (err) {
      log.error('Failed to rename classroom:', err);
      toast.error(t('classroom.renameFailed'));
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div
        ref={toolbarRef}
        className="fixed top-4 right-4 z-50 flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/75 px-2 py-1.5 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/75"
      >
        <LanguageSwitcher onOpen={() => setThemeOpen(false)} />
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
        <div className="relative">
          <button
            onClick={() => setThemeOpen((open) => !open)}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Theme"
          >
            {theme === 'light' && <Sun className="size-4" />}
            {theme === 'dark' && <Moon className="size-4" />}
            {theme === 'system' && <Monitor className="size-4" />}
          </button>
          {themeOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 min-w-[140px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
              {themeOptions.map(({ value, Icon, label }) => (
                <button
                  key={value}
                  onClick={() => {
                    setTheme(value);
                    setThemeOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800',
                    theme === value && 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-4 pb-10 pt-20 md:px-8">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <img src="/logo-horizontal.png" alt="OpenMAIC" className="mb-5 h-10 md:h-12" />
            <div className="flex items-center gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <Clock className="size-4" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-normal">
                  {t('classroom.recentClassrooms')}
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {classrooms.length}
                </p>
              </div>
            </div>
          </div>

          {classrooms.length > 0 && (
            <InputGroup className="h-9 w-full rounded-lg bg-white shadow-none md:w-72 dark:bg-slate-900">
              <Search className="ml-3 size-4 text-slate-400" />
              <InputGroupInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('classroom.searchPlaceholder')}
                aria-label={t('classroom.searchAriaLabel')}
                className="h-9"
              />
              {searchQuery && (
                <InputGroupButton
                  size="icon-xs"
                  aria-label={t('classroom.clearSearch')}
                  onClick={() => setSearchQuery('')}
                >
                  <X />
                </InputGroupButton>
              )}
            </InputGroup>
          )}
        </motion.header>

        <AnimatePresence mode="wait">
          {classrooms.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-1 items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white/60 px-8 py-10 text-center dark:border-slate-800 dark:bg-slate-900/50">
                <BookOpen className="size-8 text-slate-400" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  No recent learning yet
                </p>
              </div>
            </motion.div>
          ) : filteredClassrooms.length === 0 ? (
            <motion.div
              key="search-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-16 text-center text-sm text-slate-500 dark:text-slate-400"
            >
              {t('classroom.searchEmpty')}
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4"
            >
              {filteredClassrooms.map((classroom, i) => (
                <motion.div
                  key={classroom.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.025, duration: 0.25, ease: 'easeOut' }}
                >
                  <ClassroomCard
                    classroom={classroom}
                    slide={thumbnails[classroom.id]}
                    formatDate={formatDate}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    confirmingDelete={pendingDeleteId === classroom.id}
                    onConfirmDelete={() => confirmDelete(classroom.id)}
                    onCancelDelete={() => setPendingDeleteId(null)}
                    onClick={() => router.push(`/classroom/${classroom.id}`)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function ClassroomCard({
  classroom,
  slide,
  formatDate,
  onDelete,
  onRename,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
}: {
  classroom: StageListItem;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete: (id: string, e: MouseEvent) => void;
  onRename: (id: string, newName: string) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const isTaskEngineMode = classroom.taskEngineMode === true;
  const showModeBadge = classroom.interactiveMode || isTaskEngineMode;
  const ModeBadgeIcon = isTaskEngineMode ? Sparkles : Atom;
  const modeBadgeLabel = isTaskEngineMode ? 'Vocational Mode' : t('toolbar.interactiveModeLabel');

  const startRename = (e: MouseEvent) => {
    e.stopPropagation();
    setNameDraft(classroom.name);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== classroom.name) {
      onRename(classroom.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="group cursor-pointer" onClick={confirmingDelete ? undefined : onClick}>
      <div
        ref={thumbRef}
        className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-slate-100 transition-transform duration-200 group-hover:scale-[1.02] dark:bg-slate-800/80"
      >
        {slide && thumbWidth > 0 ? (
          <SlideThumbnail
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-12 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              <BookOpen className="size-5" />
            </div>
          </div>
        ) : null}

        {showModeBadge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={modeBadgeLabel}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'absolute bottom-2 left-2 z-10 inline-flex size-5 items-center justify-center rounded-full bg-white/75 shadow-sm backdrop-blur-sm dark:bg-slate-900/70',
                  isTaskEngineMode
                    ? 'text-amber-600 ring-1 ring-amber-500/35 dark:text-amber-300'
                    : 'text-cyan-600 ring-1 ring-cyan-500/30 dark:text-cyan-300',
                )}
              >
                <ModeBadgeIcon className="size-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" sideOffset={-4} className="text-xs">
              {modeBadgeLabel}
            </TooltipContent>
          </Tooltip>
        )}

        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-2 top-2 size-7 rounded-full bg-black/30 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-destructive/80 hover:text-white group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-11 top-2 size-7 rounded-full bg-black/30 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/50 hover:text-white group-hover:opacity-100"
                onClick={startRename}
              >
                <Pencil className="size-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="rounded-lg bg-white/15 px-3.5 py-1 text-[12px] font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-white/25"
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="rounded-lg bg-red-500/90 px-3.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-red-500"
                  onClick={onConfirmDelete}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-2.5 flex items-center gap-2 px-1">
        <span className="inline-flex shrink-0 items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:bg-violet-900/30 dark:text-violet-300">
          {classroom.sceneCount} {t('classroom.slides')} · {formatDate(classroom.updatedAt)}
        </span>
        {editing ? (
          <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1">
              <input
                ref={nameInputRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditing(false);
                }}
                onBlur={commitRename}
                maxLength={100}
                placeholder={t('classroom.renamePlaceholder')}
                className="w-full border-b border-violet-400/60 bg-transparent text-[15px] font-medium text-foreground/90 outline-none placeholder:text-muted-foreground/40"
              />
              <Check className="size-3.5 text-violet-500" />
            </div>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className="min-w-0 cursor-text truncate text-[15px] font-medium text-foreground/90"
                onDoubleClick={startRename}
              >
                {classroom.name}
              </p>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={4}
              className="!max-w-[min(90vw,32rem)] whitespace-normal break-words"
            >
              <div className="flex items-center gap-1.5">
                <span className="break-all">{classroom.name}</span>
                <button
                  className="shrink-0 rounded p-0.5 transition-colors hover:bg-foreground/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(classroom.name);
                    toast.success(t('classroom.nameCopied'));
                  }}
                >
                  <Copy className="size-3 opacity-60" />
                </button>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <HomePage />;
}
