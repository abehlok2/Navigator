import { getAudioContext } from './context';

export type Manifest = Record<string, string>; // id -> filename
const buffers = new Map<string, AudioBuffer>();

/**
 * Handles a drag/drop event, preloading any files that match the manifest.
 * The manifest maps logical IDs to expected file names.
 */
export async function handleDrop(e: DragEvent, manifest: Manifest): Promise<void> {
  e.preventDefault();
  const list = e.dataTransfer?.files;
  if (!list) return;
  const ctx = getAudioContext();
  await Promise.all(
    Array.from(list).map(async file => {
      const id = Object.keys(manifest).find(key => manifest[key] === file.name);
      if (!id) return;
      const array = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(array);
      buffers.set(id, buffer);
    })
  );
}

export function getBuffer(id: string): AudioBuffer | undefined {
  return buffers.get(id);
}
