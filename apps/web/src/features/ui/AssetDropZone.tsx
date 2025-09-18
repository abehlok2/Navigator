import React, { useCallback, useMemo, useRef, useState } from 'react';
import { handleDrop, handleFiles } from '../audio/assets';
import { useSessionStore } from '../../state/session';

export default function AssetDropZone() {
  const manifestEntries = useSessionStore(state => Object.values(state.manifest));
  const loaded = useSessionStore(state => state.assets);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const expectedCount = manifestEntries.length;
  const loadedCount = useMemo(
    () => manifestEntries.filter(entry => loaded.has(entry.id)).length,
    [loaded, manifestEntries]
  );
  const disabled = expectedCount === 0;
  const instructions = disabled
    ? 'Waiting for asset manifest…'
    : `Drop or select audio files matching: ${manifestEntries.map(entry => entry.id).join(', ')}`;
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    setDragging(false);
    if (disabled) return;
    handleDrop(e.nativeEvent).catch(err => console.error(err));
  }, [disabled]);
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const onDragEnter = () => setDragging(true);
  const onDragLeave = () => setDragging(false);
  const handleBrowse = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);
  const handleFileSelection = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const files = event.target.files;
      if (files && files.length > 0) {
        handleFiles(files).catch(err => console.error(err));
      }
      event.target.value = '';
    },
    [disabled]
  );
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      className={`drop-zone${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
      aria-disabled={disabled}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div>{instructions}</div>
          {!disabled && (
            <div className="text-xs text-gray-600">
              Loaded {loadedCount} / {expectedCount}
            </div>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              multiple
              onChange={handleFileSelection}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleBrowse}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              Browse files…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
