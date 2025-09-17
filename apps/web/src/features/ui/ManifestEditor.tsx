import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAudioContext } from '../audio/context';
import { useSessionStore } from '../../state/session';
import type { AssetManifest } from '../control/protocol';

function generateKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

type EntryKind = 'file' | 'manual';

interface ManifestDraftEntry {
  key: string;
  id: string;
  title: string;
  notes: string;
  kind: EntryKind;
  fileName?: string;
  mimeType?: string;
  sha256?: string;
  bytes?: number;
  duration?: number;
  legacyUrl?: string;
}

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.aiff'];

function hasAudioExtension(name: string) {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function isAudioFile(file: File) {
  return (file.type && file.type.startsWith('audio/')) || hasAudioExtension(file.name);
}

function formatDuration(duration?: number) {
  if (!duration || Number.isNaN(duration)) return 'Unknown';
  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function digestSha256(buffer: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest('SHA-256', buffer).then(hash =>
    Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase()
  );
}

async function estimateDuration(buffer: ArrayBuffer): Promise<number | undefined> {
  try {
    const ctx = getAudioContext();
    const copy = buffer.slice(0);
    const audioBuffer = await ctx.decodeAudioData(copy);
    return audioBuffer.duration;
  } catch (err) {
    console.warn('Failed to decode audio for duration estimate', err);
    return undefined;
  }
}

function createDraftFromManifest(entries: AssetManifest['entries']): ManifestDraftEntry[] {
  return entries.map(entry => ({
    key: generateKey(),
    id: entry.id,
    title: typeof entry.title === 'string' ? entry.title : entry.id,
    notes: typeof entry.notes === 'string' ? entry.notes : '',
    kind: 'manual',
    sha256: entry.sha256,
    bytes: entry.bytes,
    duration: undefined,
    legacyUrl: entry.url,
  }));
}

const shaPattern = /^[a-f0-9]{64}$/;

export default function ManifestEditor() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { control, manifestEntries, setManifest } = useSessionStore(state => ({
    control: state.control,
    manifestEntries: Object.values(state.manifest),
    setManifest: state.setManifest,
  }));

  const [draftEntries, setDraftEntries] = useState<ManifestDraftEntry[]>(() =>
    createDraftFromManifest(manifestEntries)
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const hasDraft = draftEntries.length > 0;

  useEffect(() => {
    setDraftEntries(prev => (prev.length === 0 ? createDraftFromManifest(manifestEntries) : prev));
  }, [manifestEntries]);

  const totalBytes = useMemo(
    () =>
      draftEntries.reduce((acc, entry) => {
        if (typeof entry.bytes === 'number' && !Number.isNaN(entry.bytes)) {
          return acc + entry.bytes;
        }
        return acc;
      }, 0),
    [draftEntries]
  );

  const handleAddFiles = () => {
    setErrors([]);
    setSendError(null);
    setSendSuccess(null);
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const additions: ManifestDraftEntry[] = [];
    const nextErrors: string[] = [];
    for (const file of Array.from(files)) {
      if (!isAudioFile(file)) {
        nextErrors.push(`${file.name} is not a recognised audio file.`);
        continue;
      }
      try {
        const arrayBuffer = await file.arrayBuffer();
        const [sha256, duration] = await Promise.all([
          digestSha256(arrayBuffer),
          estimateDuration(arrayBuffer),
        ]);
        const entry: ManifestDraftEntry = {
          key: generateKey(),
          id: file.name,
          title: file.name,
          notes: '',
          kind: 'file',
          fileName: file.name,
          mimeType: file.type || undefined,
          sha256,
          bytes: file.size,
          duration,
        };
        additions.push(entry);
      } catch (err) {
        console.error('Failed to process file', file.name, err);
        nextErrors.push(`Failed to read ${file.name}: ${(err as Error).message ?? 'unknown error'}`);
      }
    }
    setDraftEntries(current => [...current, ...additions]);
    if (nextErrors.length) {
      setErrors(nextErrors);
    } else {
      setErrors([]);
    }
    event.target.value = '';
  };

  const updateEntry = (key: string, update: Partial<ManifestDraftEntry>) => {
    setDraftEntries(current => current.map(entry => (entry.key === key ? { ...entry, ...update } : entry)));
  };

  const removeEntry = (key: string) => {
    setDraftEntries(current => current.filter(entry => entry.key !== key));
  };

  const moveEntry = (key: string, direction: -1 | 1) => {
    setDraftEntries(current => {
      const index = current.findIndex(entry => entry.key === key);
      if (index === -1) return current;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [removed] = next.splice(index, 1);
      next.splice(targetIndex, 0, removed);
      return next;
    });
  };

  const handleResetToSession = () => {
    setDraftEntries(createDraftFromManifest(manifestEntries));
    setErrors([]);
    setSendError(null);
    setSendSuccess(null);
  };

  const handleClear = () => {
    setDraftEntries([]);
    setErrors([]);
    setSendError(null);
    setSendSuccess(null);
  };

  const handleSend = async () => {
    setErrors([]);
    setSendError(null);
    setSendSuccess(null);

    const problems: string[] = [];
    const seenIds = new Set<string>();
    const entries: AssetManifest['entries'] = [];

    if (!draftEntries.length) {
      problems.push('Add at least one entry to send a manifest.');
    }

    draftEntries.forEach((entry, index) => {
      const label = `Entry ${index + 1}`;
      const trimmedId = entry.id.trim();
      if (!trimmedId) {
        problems.push(`${label}: Track ID is required.`);
      } else {
        if (seenIds.has(trimmedId)) {
          problems.push(`${label}: Track ID "${trimmedId}" is duplicated.`);
        }
        seenIds.add(trimmedId);
      }

      if (!entry.sha256 || !shaPattern.test(entry.sha256)) {
        problems.push(`${label}: SHA-256 must be a 64 character hex value.`);
      }
      if (typeof entry.bytes !== 'number' || entry.bytes <= 0) {
        problems.push(`${label}: File size (bytes) must be provided.`);
      }
      if (typeof entry.duration === 'number' && entry.duration <= 0) {
        problems.push(`${label}: Duration must be a positive number if provided.`);
      }

      if (trimmedId && entry.sha256 && shaPattern.test(entry.sha256) && typeof entry.bytes === 'number' && entry.bytes > 0) {
        const normalizedTitle = entry.title.trim();
        const normalizedNotes = entry.notes.trim();
        entries.push({
          id: trimmedId,
          sha256: entry.sha256.toLowerCase(),
          bytes: entry.bytes,
          ...(normalizedTitle ? { title: normalizedTitle } : {}),
          ...(normalizedNotes ? { notes: normalizedNotes } : {}),
        });
      }
    });

    if (!control) {
      problems.push('Control channel is not connected.');
    }

    if (problems.length) {
      setErrors(problems);
      return;
    }

    try {
      setSending(true);
      await control!.setManifest(entries);
      setManifest(entries);
      setSendSuccess('Manifest sent successfully.');
    } catch (err) {
      console.error('Failed to send manifest', err);
      setSendError((err as Error).message || 'Failed to send manifest.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-4 rounded border border-gray-300 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Asset Manifest</h3>
        <div className="flex gap-2">
          <button type="button" onClick={handleAddFiles} className="rounded border border-gray-300 px-2 py-1">
            Add Files
          </button>
          <button type="button" onClick={handleResetToSession} className="rounded border border-gray-300 px-2 py-1">
            Load Current
          </button>
          <button type="button" onClick={handleClear} className="rounded border border-gray-300 px-2 py-1">
            Clear
          </button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        onChange={handleFilesSelected}
        className="hidden"
      />
      {hasDraft ? (
        <ul className="mt-4 flex flex-col gap-4">
          {draftEntries.map((entry, index) => (
            <li key={entry.key} className="rounded border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{index + 1}. {entry.title || entry.id || 'Untitled Asset'}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => moveEntry(entry.key, -1)} disabled={index === 0} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50">
                    ↑
                  </button>
                  <button type="button" onClick={() => moveEntry(entry.key, 1)} disabled={index === draftEntries.length - 1} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50">
                    ↓
                  </button>
                  <button type="button" onClick={() => removeEntry(entry.key)} className="rounded border border-red-300 px-2 py-1 text-red-600">
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium">Track ID</span>
                  <input
                    type="text"
                    value={entry.id}
                    onChange={e => updateEntry(entry.key, { id: e.target.value })}
                    className="rounded border border-gray-300 p-2"
                  />
                </label>
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium">Title</span>
                  <input
                    type="text"
                    value={entry.title}
                    onChange={e => updateEntry(entry.key, { title: e.target.value })}
                    className="rounded border border-gray-300 p-2"
                  />
                </label>
                <label className="flex flex-col text-sm md:col-span-2">
                  <span className="mb-1 font-medium">Notes</span>
                  <textarea
                    value={entry.notes}
                    onChange={e => updateEntry(entry.key, { notes: e.target.value })}
                    className="h-20 rounded border border-gray-300 p-2"
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {entry.kind === 'file' ? (
                  <div className="text-sm text-gray-700">
                    <div><span className="font-medium">File:</span> {entry.fileName}</div>
                    <div><span className="font-medium">Type:</span> {entry.mimeType || 'unknown'}</div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-700 md:col-span-2">
                    <div className="rounded border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-800">
                      Attach facilitator-provided local audio files using the Add Files button. Remote URLs are no longer
                      supported.
                    </div>
                    {entry.legacyUrl && (
                      <div className="mt-2 break-all text-xs text-gray-600">
                        Legacy reference: {entry.legacyUrl}
                      </div>
                    )}
                  </div>
                )}
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium">SHA-256</span>
                  <input
                    type="text"
                    value={entry.sha256 || ''}
                    onChange={e => updateEntry(entry.key, { sha256: e.target.value.trim().toLowerCase() })}
                    className="rounded border border-gray-300 p-2"
                    readOnly={entry.kind === 'file'}
                  />
                </label>
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium">File Size (bytes)</span>
                  <input
                    type="number"
                    value={entry.bytes ?? ''}
                    onChange={e => updateEntry(entry.key, { bytes: e.target.value ? Number(e.target.value) : undefined })}
                    className="rounded border border-gray-300 p-2"
                    readOnly={entry.kind === 'file'}
                  />
                </label>
                {entry.kind === 'manual' ? (
                  <label className="flex flex-col text-sm">
                    <span className="mb-1 font-medium">Estimated Duration (seconds)</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={entry.duration ?? ''}
                      onChange={e =>
                        updateEntry(entry.key, {
                          duration: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="rounded border border-gray-300 p-2"
                    />
                  </label>
                ) : (
                  <div className="text-sm text-gray-700">
                    <div>
                      <span className="font-medium">Duration:</span> {formatDuration(entry.duration)}
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 text-sm text-gray-600">No manifest entries yet. Add files to begin.</div>
      )}
      {errors.length > 0 && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <ul className="list-disc pl-5">
            {errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {sendError && <div className="mt-4 text-sm text-red-600">{sendError}</div>}
      {sendSuccess && <div className="mt-4 text-sm text-green-600">{sendSuccess}</div>}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-700">
          <div>Total entries: {draftEntries.length}</div>
          <div>Total size: {totalBytes.toLocaleString()} bytes</div>
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !draftEntries.length}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send Manifest'}
        </button>
      </div>
    </div>
  );
}
