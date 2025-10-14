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
    : 'Drop audio files to match your manifest.';
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
        <>
          <div className="text-xs text-gray-600">
            Loaded {loadedCount} / {expectedCount}
          </div>
          <ul className="mt-2 space-y-2 text-left text-xs">
            {manifestEntries.map(entry => {
              const title = entry.title?.trim() || entry.id;
              const notes = entry.notes?.trim();
              const url = entry.url?.trim();
              return (
                <li key={entry.id} className="rounded border border-dashed border-gray-300 p-2">
                  <div className="font-medium text-sm">{title}</div>
                  <div className="text-gray-500">ID: {entry.id}</div>
                  {notes && <div className="whitespace-pre-wrap text-gray-600">{notes}</div>}
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Source
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
