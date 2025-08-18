import React, { useCallback } from 'react';
import { handleDrop, type Manifest } from '../audio/assets';

const manifest: Manifest = {
  trackA: 'trackA.wav',
  trackB: 'trackB.wav',
};

export default function AssetDropZone() {
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    handleDrop(e.nativeEvent, manifest).catch(err => console.error(err));
  }, []);
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      style={{ border: '2px dashed #ccc', padding: '1rem', marginBottom: '1rem' }}
    >
      Drop audio files here (trackA.wav, trackB.wav)
    </div>
  );
}
