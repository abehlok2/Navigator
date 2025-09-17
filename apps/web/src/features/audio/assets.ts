import { getAudioContext } from './context';
import { useSessionStore } from '../../state/session';

const buffers = new Map<string, AudioBuffer>();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function digestSha256(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return toHex(hash).toLowerCase();
}

/**
 * Handles a drag/drop event, preloading any files that match the manifest.
 * The manifest is sourced from session state via asset.manifest messages.
 */
export async function handleDrop(e: DragEvent): Promise<void> {
  e.preventDefault();
  const list = e.dataTransfer?.files;
  if (!list || list.length === 0) return;

  const state = useSessionStore.getState();
  const manifestEntries = Object.values(state.manifest);
  if (manifestEntries.length === 0) {
    console.warn('No manifest available to map dropped assets.');
    return;
  }

  const ctx = getAudioContext();
  const { setAssetProgress, addAsset } = state;

  await Promise.all(
    Array.from(list).map(async file => {
      try {
        const array = await file.arrayBuffer();
        const hash = await digestSha256(array);
        const entry =
          manifestEntries.find(item => item.sha256.toLowerCase() === hash) ??
          manifestEntries.find(item => item.id === file.name);
        if (!entry) return;

        setAssetProgress(entry.id, 0, entry.bytes);
        const buffer = await ctx.decodeAudioData(array.slice(0));
        setBuffer(entry.id, buffer);
        setAssetProgress(entry.id, entry.bytes, entry.bytes);
        addAsset(entry.id, { broadcast: true });
      } catch (err) {
        console.error('Failed to process dropped asset', err);
      }
    })
  );
}

export function getBuffer(id: string): AudioBuffer | undefined {
  return buffers.get(id);
}

export function setBuffer(id: string, buffer: AudioBuffer) {
  buffers.set(id, buffer);
}

export function removeBuffer(id: string) {
  buffers.delete(id);
}

export function hasBuffer(id: string): boolean {
  return buffers.has(id);
}
