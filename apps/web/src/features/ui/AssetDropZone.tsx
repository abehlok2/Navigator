import React, { useCallback, useMemo, useState } from 'react';
import { handleDrop } from '../audio/assets';
import { useSessionStore } from '../../state/session';

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
    : `Drop audio files matching: ${manifestEntries.map(entry => entry.id).join(', ')}`;
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    setDragging(false);
    if (disabled) return;
    handleDrop(e.nativeEvent).catch(err => console.error(err));
  }, [disabled]);
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const onDragEnter = () => setDragging(true);
  const onDragLeave = () => setDragging(false);
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      className={`drop-zone${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
      aria-disabled={disabled}
    >
      <div>{instructions}</div>
      {!disabled && (
        <div className="text-xs text-gray-600">
          Loaded {loadedCount} / {expectedCount}
        </div>
      )}
    </div>
  );
}
