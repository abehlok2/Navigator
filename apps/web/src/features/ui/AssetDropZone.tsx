import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { cn } from '../../lib/utils';
import { useSessionStore } from '../../state/session';
import { handleDrop } from '../audio/assets';

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.aiff', '.aif', '.opus'];

function isAudioFile(file: File) {
  if (file.type && file.type.startsWith('audio/')) return true;
  const lower = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

type UploadStatus = 'processing' | 'success' | 'error';

interface UploadItem {
  id: string;
  fileName: string;
  size: number;
  type: string;
  manifestId?: string;
  status: UploadStatus;
  progress: number;
  message: string;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const borderAnimation = {
  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
  transition: { duration: 10, ease: 'linear', repeat: Infinity },
};

export default function AssetDropZone() {
  const manifestEntries = useSessionStore(state => Object.values(state.manifest));
  const assetProgress = useSessionStore(state => state.assetProgress);
  const assetsStore = useSessionStore(state => state.assets);
  const loadedAssets = useMemo(() => new Set(assetsStore), [assetsStore]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [isDragging, setDragging] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [draggedFileCount, setDraggedFileCount] = useState(0);

  const expectedCount = manifestEntries.length;
  const loadedCount = useMemo(
    () => manifestEntries.filter(entry => loadedAssets.has(entry.id)).length,
    [loadedAssets, manifestEntries]
  );
  const disabled = expectedCount === 0;
  const percent = expectedCount === 0 ? 0 : Math.round((loadedCount / expectedCount) * 100);

  const hasQueue = uploads.length > 0;
  const activeUploads = uploads.filter(item => item.status === 'processing');

  useEffect(() => {
    if (!Object.keys(assetProgress).length) return;
    setUploads(prev => {
      let changed = false;
      const next = prev.map(item => {
        if (!item.manifestId) return item;
        const progressEntry = assetProgress[item.manifestId];
        if (!progressEntry) return item;

        const total = progressEntry.total ?? 0;
        const loaded = progressEntry.loaded ?? 0;
        const computedProgress = total ? Math.round((loaded / total) * 100) : loaded ? 100 : 0;
        let status: UploadStatus = item.status;
        let message = item.message;

        if (computedProgress >= 100 || loadedAssets.has(item.manifestId)) {
          status = 'success';
          message = 'Waveform ready. Asset synced successfully.';
        } else if (loaded > 0) {
          status = 'processing';
          message = 'Generating waveform…';
        }

        const progress = Math.max(item.progress, computedProgress);
        if (progress !== item.progress || status !== item.status || message !== item.message) {
          changed = true;
          return { ...item, progress, status, message };
        }
        return item;
      });
      return changed ? next : prev;
    });
  }, [assetProgress, loadedAssets]);

  const resetDragState = useCallback(() => {
    setDragDepth(0);
    setDragging(false);
    setDraggedFileCount(0);
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer?.files ?? []);
      resetDragState();
      if (!files.length) return;

      const timestamp = Date.now();
      const nextItems: UploadItem[] = [];

      if (disabled) {
        files.forEach((file, index) => {
          nextItems.push({
            id: `${file.name}-${timestamp}-${index}`,
            fileName: file.name,
            size: file.size,
            type: file.type,
            status: 'error',
            progress: 0,
            message: 'Asset manifest not loaded yet. Please wait for the session manifest.',
          });
        });
        setUploads(prev => [...prev, ...nextItems]);
        return;
      }

      files.forEach((file, index) => {
        const id = `${file.name}-${timestamp}-${index}`;
        if (!isAudioFile(file)) {
          nextItems.push({
            id,
            fileName: file.name,
            size: file.size,
            type: file.type,
            status: 'error',
            progress: 0,
            message: 'Unsupported file type. Drop audio files such as wav, mp3, aac, ogg, flac, or opus.',
          });
          return;
        }

        const manifestEntry = manifestEntries.find(entry => entry.id === file.name);
        if (!manifestEntry) {
          nextItems.push({
            id,
            fileName: file.name,
            size: file.size,
            type: file.type,
            status: 'error',
            progress: 0,
            message: 'No matching entry in the manifest. Use filenames that match asset IDs.',
          });
          return;
        }

        nextItems.push({
          id,
          fileName: file.name,
          size: file.size,
          type: file.type,
          manifestId: manifestEntry.id,
          status: 'processing',
          progress: 0,
          message: 'Hashing & decoding audio…',
        });
      });

      if (nextItems.length) {
        setUploads(prev => [...prev, ...nextItems]);
      }

      const hasValid = nextItems.some(item => item.status === 'processing');
      if (!hasValid) {
        return;
      }

      try {
        await handleDrop(event.nativeEvent);
      } catch (error) {
        console.error('Failed to process dropped files', error);
        setUploads(prev =>
          prev.map(item => {
            if (nextItems.some(nextItem => nextItem.id === item.id && nextItem.status === 'processing')) {
              return {
                ...item,
                status: 'error',
                message: 'Something went wrong while processing this file. Check the console for details.',
              };
            }
            return item;
          })
        );
      }
    },
    [disabled, manifestEntries, resetDragState]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault();
    const count = event.dataTransfer?.items?.length ?? event.dataTransfer?.files?.length ?? 0;
    setDraggedFileCount(count);
  }, []);

  const onDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault();
    setDragDepth(prev => prev + 1);
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault();
    setDragDepth(prev => {
      const next = Math.max(prev - 1, 0);
      if (next === 0) {
        resetDragState();
      }
      return next;
    });
  }, [resetDragState]);

  const dropHandlers = {
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
  };

  const instructions = disabled
    ? 'Waiting for asset manifest…'
    : 'Drag & drop audio files that match the manifest IDs to sync them locally.';

  return (
    <>
      <motion.div
        {...dropHandlers}
        className={cn(
          'relative flex flex-col gap-6 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-lg backdrop-blur transition-shadow',
          isDragging && !disabled && 'shadow-[0_35px_120px_-40px_rgba(2,132,199,0.7)]'
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <motion.div
          className="relative flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-300/80 bg-gradient-to-br from-white/70 via-white/60 to-slate-50/60 p-8 text-center"
          animate={borderAnimation}
          style={{ backgroundSize: '200% 200%' }}
        >
          <motion.div
            className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/15 text-4xl"
            animate={{ scale: [1, 1.05, 1], rotate: [0, 3, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          >
            🎧
          </motion.div>
          <div className="space-y-2">
            <p className="text-base font-semibold text-slate-800">{instructions}</p>
            {!disabled && (
              <p className="text-sm text-slate-500">
                Matching filenames will replace the local copy. Drop multiple files at once to speed through setup.
              </p>
            )}
          </div>
          {!disabled && (
            <div className="mt-4 flex w-full max-w-md flex-col gap-2">
              <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                <span>
                  Loaded {loadedCount} / {expectedCount}
                </span>
                <span>{percent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                />
              </div>
            </div>
          )}
        </motion.div>

        <AnimatePresence initial={false}>
          {hasQueue && (
            <motion.div
              key="upload-queue"
              className="space-y-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Upload queue</h3>
                {activeUploads.length > 0 && (
                  <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700">
                    {activeUploads.length} active
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {uploads.map(item => (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.fileName}</p>
                          <p className="text-xs text-slate-500">
                            {formatBytes(item.size)} · {item.status === 'error' ? 'Upload failed' : item.message}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                            item.status === 'success' && 'bg-emerald-500/15 text-emerald-600',
                            item.status === 'processing' && 'bg-sky-500/15 text-sky-700',
                            item.status === 'error' && 'bg-rose-500/15 text-rose-600'
                          )}
                        >
                          {item.status === 'success' && 'Ready'}
                          {item.status === 'processing' && 'Processing'}
                          {item.status === 'error' && 'Error'}
                        </span>
                      </div>
                      {item.status !== 'error' && (
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(item.progress, 100)}%` }}
                            transition={{ type: 'spring', stiffness: 160, damping: 24 }}
                          />
                        </div>
                      )}
                      {item.status === 'error' && (
                        <p className="mt-3 text-sm text-rose-600">{item.message}</p>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {isDragging && (
          <motion.div
            {...dropHandlers}
            className={cn(
              'fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 backdrop-blur-lg',
              disabled && 'cursor-not-allowed'
            )}
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className={cn(
                'pointer-events-none flex w-full max-w-2xl flex-col items-center gap-6 rounded-3xl border-2 border-dashed p-12 text-center shadow-2xl',
                disabled
                  ? 'border-rose-400/70 bg-rose-950/40 text-rose-100'
                  : 'border-sky-400/70 bg-sky-950/40 text-sky-100'
              )}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 140, damping: 18 }}
            >
              <motion.span
                className="text-6xl"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                {disabled ? '⏳' : '✨'}
              </motion.span>
              <div className="space-y-3">
                <p className="text-2xl font-semibold">
                  {disabled ? 'Manifest loading…' : 'Drop to sync your audio assets'}
                </p>
                <p className="text-sm text-sky-100/80">
                  {disabled
                    ? 'Once the manifest arrives you can drag files in to unlock playback.'
                    : draggedFileCount > 0
                      ? `Ready to add ${draggedFileCount} file${draggedFileCount === 1 ? '' : 's'}`
                      : 'We will verify, decode, and generate waveforms instantly.'}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
