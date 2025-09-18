import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { useSessionStore } from '../../state/session';
import { handleDrop } from '../audio/assets';

export default function AssetDropZone() {
  const manifestEntries = useSessionStore(state => Object.values(state.manifest));
  const loaded = useSessionStore(state => state.assets);
  const [dragging, setDragging] = useState(false);
  const expectedCount = manifestEntries.length;
  const loadedCount = useMemo(
    () => manifestEntries.filter(entry => loaded.has(entry.id)).length,
    [loaded, manifestEntries]
  );
  const disabled = expectedCount === 0;
  const instructions = disabled
    ? 'Waiting for asset manifest…'
    : `Drop audio files for ${expectedCount} manifest entr${expectedCount === 1 ? 'y' : 'ies'}`;
  const percent = expectedCount === 0 ? 0 : Math.round((loadedCount / expectedCount) * 100);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      setDragging(false);
      if (disabled) return;
      handleDrop(e.nativeEvent).catch(err => console.error(err));
    },
    [disabled]
  );
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const onDragEnter = () => setDragging(true);
  const onDragLeave = () => setDragging(false);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      className={cn(
        'relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white/80 p-6 text-center shadow-sm transition-all duration-200 ease-out',
        dragging && 'border-sky-400 bg-sky-50 shadow-[0_15px_45px_-25px_rgba(2,132,199,0.55)]',
        disabled && 'cursor-not-allowed opacity-60'
      )}
      aria-disabled={disabled}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-50/50 via-white/40 to-slate-100/50" />
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/15 text-3xl text-sky-600">
          🎧
        </div>
        <p className="text-sm font-semibold text-slate-700">{instructions}</p>
        {!disabled && (
          <>
            <p className="text-xs text-slate-500">
              Drag files directly from your computer. Matching filenames replace existing local assets.
            </p>
            <div className="flex w-full max-w-md flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>
                  Loaded {loadedCount} / {expectedCount}
                </span>
                <span>{percent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-300"
                  style={{ width: `${percent}%` }}
                  aria-hidden
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
