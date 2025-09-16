import { getAudioContext, getDuckingBus, getRemoteFacilitatorBus } from './context';

interface RemoteEntry {
  cleanup: () => void;
}

let remoteEntries = new Map<string, RemoteEntry>();
let fallbackEntry: RemoteEntry | null = null;

export function attachRemoteFacilitatorStream(stream: MediaStream): () => void {
  const existing = remoteEntries.get(stream.id);
  existing?.cleanup();

  const ctx = getAudioContext();
  const source = ctx.createMediaStreamSource(stream);
  source.connect(getRemoteFacilitatorBus());

  let cleaned = false;
  const handleEnded = () => cleanup();
  stream.getTracks().forEach(track => track.addEventListener('ended', handleEnded));

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      source.disconnect();
    } catch {
      // noop
    }
    stream.getTracks().forEach(track => track.removeEventListener('ended', handleEnded));
    remoteEntries.delete(stream.id);
  };

  remoteEntries.set(stream.id, { cleanup });
  return cleanup;
}

export function resetRemoteFacilitatorStreams() {
  remoteEntries.forEach(entry => entry.cleanup());
  remoteEntries.clear();
}

export function setLocalSpeechFallback(stream: MediaStream | null) {
  if (fallbackEntry) {
    fallbackEntry.cleanup();
    fallbackEntry = null;
  }
  if (!stream) return;
  const ctx = getAudioContext();
  const source = ctx.createMediaStreamSource(stream);
  source.connect(getDuckingBus());

  let cleaned = false;
  const handleEnded = () => setLocalSpeechFallback(null);
  stream.getTracks().forEach(track => track.addEventListener('ended', handleEnded));

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      source.disconnect();
    } catch {
      // noop
    }
    stream.getTracks().forEach(track => track.removeEventListener('ended', handleEnded));
  };

  fallbackEntry = { cleanup };
}

export function hasSpeechInput(): boolean {
  return remoteEntries.size > 0 || fallbackEntry !== null;
}
