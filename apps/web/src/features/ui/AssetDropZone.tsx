import React, { useCallback, useState } from 'react';
import { handleDrop, type Manifest } from '../audio/assets';

const manifest: Manifest = {
  trackA: 'trackA.wav',
  trackB: 'trackB.wav',
};

export default function AssetDropZone() {
  const [dragging, setDragging] = useState(false);
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    setDragging(false);
    handleDrop(e.nativeEvent, manifest).catch(err => console.error(err));
  }, []);
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const onDragEnter = () => setDragging(true);
  const onDragLeave = () => setDragging(false);
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      className={`drop-zone${dragging ? ' dragging' : ''}`}
    >
      Drop audio files here (trackA.wav, trackB.wav)
    </div>
  );
}
