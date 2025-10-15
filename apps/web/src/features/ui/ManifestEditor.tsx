import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Download,
  FileJson,
  FilePlus2,
  FileText,
  FolderPlus,
  Import,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';

import { Button } from '../../components/ui/button';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../../components/ui/glass-card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useSessionStore } from '../../state/session';
import { cn } from '../../lib/utils';
import { getAudioContext } from '../audio/context';
import { registerRawAsset } from '../audio/assets';
import type { AssetManifest } from '../control/protocol';

interface ManifestDraftEntry {
  key: string;
  id: string;
  title: string;
  notes: string;
  sha256?: string;
  bytes?: number;
  url?: string;
  duration?: number;
  mimeType?: string;
  fileName?: string;
  kind: 'file' | 'manual';
}

type ManifestValidation = {
  globalErrors: string[];
  entryErrors: Record<string, string[]>;
};

type ManifestEntry = AssetManifest['entries'][number];

interface ManifestDiff {
  added: ManifestDraftEntry[];
  removed: AssetManifest['entries'];
  updated: Array<{ id: string; fields: string[] }>;
  reordered: string[];
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.aiff'];

function generateKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

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

function formatBytes(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

async function digestSha256(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toLowerCase();
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
    title: typeof entry.title === 'string' && entry.title.length ? entry.title : entry.id,
    notes: typeof entry.notes === 'string' ? entry.notes : '',
    sha256: entry.sha256,
    bytes: entry.bytes,
    url: entry.url,
    duration: undefined,
    mimeType: undefined,
    fileName: undefined,
    kind: 'manual',
  }));
}

function toManifestEntry(entry: ManifestDraftEntry): AssetManifest['entries'][number] {
  return {
    id: entry.id.trim(),
    sha256: entry.sha256?.trim() ?? '',
    bytes: entry.bytes ?? 0,
    title: entry.title?.trim() || undefined,
    notes: entry.notes?.trim() || undefined,
    url: entry.url?.trim() || undefined,
  };
}

function computeDiff(
  baseline: AssetManifest['entries'],
  drafts: ManifestDraftEntry[],
): ManifestDiff {
  const baselineMap = new Map(baseline.map(entry => [entry.id, entry]));
  const baselineIndex = new Map(baseline.map((entry, index) => [entry.id, index]));
  const draftManifest: ManifestEntry[] = drafts.map(toManifestEntry);
  const draftMap = new Map(draftManifest.map(entry => [entry.id, entry]));
  const diff: ManifestDiff = { added: [], removed: [], updated: [], reordered: [] };

  draftManifest.forEach((entry, index) => {
    const previous = baselineMap.get(entry.id);
    if (!previous) {
      diff.added.push(drafts[index]);
      return;
    }

    const changedFields: string[] = [];
    if ((previous.title ?? '') !== (entry.title ?? '')) changedFields.push('Title');
    if ((previous.notes ?? '') !== (entry.notes ?? '')) changedFields.push('Notes');
    if (previous.sha256 !== entry.sha256) changedFields.push('SHA-256');
    if (previous.bytes !== entry.bytes) changedFields.push('Size');
    if ((previous.url ?? '') !== (entry.url ?? '')) changedFields.push('URL');
    if (changedFields.length) {
      diff.updated.push({ id: entry.id, fields: changedFields });
    }

    const previousIndex = baselineIndex.get(entry.id);
    if (typeof previousIndex === 'number' && previousIndex !== index) {
      diff.reordered.push(entry.id);
    }
  });

  baseline.forEach(entry => {
    if (!draftMap.has(entry.id)) {
      diff.removed.push(entry);
    }
  });

  return diff;
}

function validateManifest(entries: ManifestDraftEntry[]): ManifestValidation {
  const entryErrors: Record<string, string[]> = {};
  const globalErrors: string[] = [];
  const ids = new Map<string, number>();

  entries.forEach(entry => {
    const currentErrors: string[] = [];
    const trimmedId = entry.id.trim();
    if (!trimmedId.length) {
      currentErrors.push('Asset ID is required.');
    }
    if (trimmedId.length && ids.has(trimmedId)) {
      currentErrors.push('Asset ID must be unique.');
    }
    if (trimmedId.length) {
      ids.set(trimmedId, (ids.get(trimmedId) ?? 0) + 1);
    }

    if (!entry.sha256?.length) {
      currentErrors.push('SHA-256 hash is required.');
    } else if (!SHA256_PATTERN.test(entry.sha256)) {
      currentErrors.push('SHA-256 hash must be a valid 64-character hexadecimal value.');
    }

    if (typeof entry.bytes !== 'number' || Number.isNaN(entry.bytes) || entry.bytes <= 0) {
      currentErrors.push('File size must be a positive number.');
    }

    if (entry.url && !/^https?:\/\//i.test(entry.url)) {
      currentErrors.push('URLs should start with http:// or https://.');
    }

    if (currentErrors.length) {
      entryErrors[entry.key] = currentErrors;
    }
  });

  const duplicateIds = Array.from(ids.entries()).filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicateIds.length) {
    globalErrors.push(`Duplicate IDs found: ${duplicateIds.join(', ')}`);
  }

  return { entryErrors, globalErrors };
}

async function processFile(file: File): Promise<ManifestDraftEntry> {
  if (!isAudioFile(file)) {
    throw new Error(`${file.name} is not a recognised audio file.`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const [sha256, duration] = await Promise.all([
    digestSha256(arrayBuffer),
    estimateDuration(arrayBuffer),
  ]);

  registerRawAsset(sha256, arrayBuffer, file.type || undefined);

  return {
    key: generateKey(),
    id: file.name,
    title: file.name,
    notes: '',
    sha256,
    bytes: file.size,
    url: undefined,
    duration,
    mimeType: file.type || undefined,
    fileName: file.name,
    kind: 'file',
  };
}

interface SortableAssetCardProps {
  entry: ManifestDraftEntry;
  onChange: (next: ManifestDraftEntry) => void;
  onRemove: () => void;
  errors: string[];
}

const SortableAssetCard: React.FC<SortableAssetCardProps> = ({ entry, onChange, onRemove, errors }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.key });

  return (
    <motion.div
      ref={setNodeRef}
      layout
      style={{ transform: CSS.Transform.toString(transform), transition }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
    >
      <GlassCard
        variant="interactive"
        glowColor={errors.length ? 'purple' : 'blue'}
        className={cn(
          'group border border-white/5 bg-slate-950/40 backdrop-blur transition-all',
          isDragging && 'scale-[1.02] border-white/30 shadow-2xl',
          errors.length && 'border-red-500/40 shadow-red-500/20',
        )}
      >
        <GlassCardHeader className="flex flex-col gap-3 border-b border-white/5 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
                {...attributes}
                {...listeners}
                aria-label="Drag asset"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
              <GlassCardTitle className="text-xl text-white">
                <Input
                  value={entry.title}
                  onChange={event => onChange({ ...entry, title: event.target.value })}
                  className="h-10 w-full border-white/10 bg-white/5 text-lg font-semibold text-white"
                  aria-label="Asset title"
                />
              </GlassCardTitle>
            </div>
            <p className="text-sm text-slate-300">
              {entry.kind === 'file' ? entry.fileName ?? entry.id : 'Manual entry'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<Trash2 className="h-4 w-4" />}
              onClick={onRemove}
            >
              Remove
            </Button>
          </div>
        </GlassCardHeader>
        <GlassCardContent className="gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Asset ID"
              value={entry.id}
              onChange={value => onChange({ ...entry, id: value })}
              placeholder="unique-id"
              required
            />
            <Field
              label="SHA-256"
              value={entry.sha256 ?? ''}
              onChange={value => onChange({ ...entry, sha256: value })}
              placeholder="64 character hash"
              required
            />
            <NumberField
              label="File size (bytes)"
              value={entry.bytes}
              onChange={value => onChange({ ...entry, bytes: value })}
              placeholder="e.g. 1048576"
              min={1}
            />
            <NumberField
              label="Duration (seconds)"
              value={entry.duration}
              onChange={value => onChange({ ...entry, duration: value })}
              placeholder="auto-calculated"
            />
            <Field
              label="MIME type"
              value={entry.mimeType ?? ''}
              onChange={value => onChange({ ...entry, mimeType: value })}
              placeholder="audio/mpeg"
            />
            <Field
              label="Source URL"
              value={entry.url ?? ''}
              onChange={value => onChange({ ...entry, url: value })}
              placeholder="https://..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm text-slate-200">Notes</Label>
            <motion.textarea
              value={entry.notes}
              onChange={event => onChange({ ...entry, notes: event.target.value })}
              className="min-h-[80px] rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {formatBytes(entry.bytes)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {formatDuration(entry.duration)}
            </span>
            {entry.mimeType && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{entry.mimeType}</span>
            )}
          </div>

          <AnimatePresence>
            {errors.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              >
                <p className="font-semibold">Please address the following:</p>
                <ul className="list-disc space-y-1 pl-4">
                  {errors.map(error => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCardContent>
      </GlassCard>
    </motion.div>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, placeholder, required }) => (
  <label className="flex flex-col gap-2">
    <span className="text-sm text-slate-200">
      {label}
      {required && <span className="ml-1 text-red-300">*</span>}
    </span>
    <Input
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-10 border-white/10 bg-white/5 text-sm text-slate-100"
    />
  </label>
);

interface NumberFieldProps {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  min?: number;
}

const NumberField: React.FC<NumberFieldProps> = ({ label, value, onChange, placeholder, min }) => (
  <label className="flex flex-col gap-2">
    <span className="text-sm text-slate-200">{label}</span>
    <Input
      type="number"
      value={value ?? ''}
      onChange={event => {
        const nextValue = event.target.value;
        if (!nextValue.length) {
          onChange(undefined);
          return;
        }
        const numeric = Number(nextValue);
        if (Number.isNaN(numeric)) {
          onChange(undefined);
          return;
        }
        if (typeof min === 'number' && numeric < min) {
          onChange(min);
          return;
        }
        onChange(numeric);
      }}
      placeholder={placeholder}
      className="h-10 border-white/10 bg-white/5 text-sm text-slate-100"
    />
  </label>
);

const AddAssetModal: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssets: (entries: ManifestDraftEntry[]) => void;
}> = ({ open, onOpenChange, onAssets }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [manualForm, setManualForm] = useState({
    id: '',
    title: '',
    notes: '',
    sha256: '',
    bytes: '',
    url: '',
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    setIsProcessing(true);
    setErrors([]);
    const additions: ManifestDraftEntry[] = [];
    const failure: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const entry = await processFile(file);
        additions.push(entry);
      } catch (err) {
        failure.push((err as Error).message ?? 'Unknown error');
      }
    }

    setIsProcessing(false);
    setErrors(failure);
    if (additions.length) {
      onAssets(additions);
      onOpenChange(false);
    }
  };

  const handleManualSubmit = () => {
    const { id, title, notes, sha256, bytes, url } = manualForm;
    const numericBytes = Number(bytes);
    const newEntry: ManifestDraftEntry = {
      key: generateKey(),
      id: id.trim(),
      title: title.trim() || id.trim(),
      notes: notes,
      sha256: sha256.trim() || undefined,
      bytes: Number.isFinite(numericBytes) && numericBytes > 0 ? numericBytes : undefined,
      url: url.trim() || undefined,
      duration: undefined,
      mimeType: undefined,
      fileName: undefined,
      kind: 'manual',
    };

    onAssets([newEntry]);
    setManualForm({ id: '', title: '', notes: '', sha256: '', bytes: '', url: '' });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            className="w-full max-w-2xl"
          >
            <GlassCard variant="elevated" glowColor="blue" className="overflow-hidden">
              <GlassCardHeader className="border-b border-white/10 pb-4">
                <Dialog.Title asChild>
                  <GlassCardTitle className="text-2xl text-white">Add assets</GlassCardTitle>
                </Dialog.Title>
                <Dialog.Description asChild>
                  <GlassCardDescription>
                    Upload audio files for automatic metadata or manually create an entry.
                  </GlassCardDescription>
                </Dialog.Description>
              </GlassCardHeader>
              <GlassCardContent className="gap-6">
                <div className="flex flex-col gap-3 rounded-xl border border-dashed border-white/15 bg-white/5 p-6 text-center">
                  <FolderPlus className="mx-auto h-10 w-10 text-purple-300" />
                  <p className="text-sm text-slate-200">
                    Drag files into this window or choose files from your computer.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant="primary"
                      leadingIcon={<Plus className="h-4 w-4" />}
                      onClick={() => fileInputRef.current?.click()}
                      loading={isProcessing}
                    >
                      Select audio files
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      multiple
                      hidden
                      onChange={handleFileSelect}
                    />
                  </div>
                  {isProcessing && (
                    <p className="flex items-center justify-center gap-2 text-sm text-slate-300">
                      <Loader2 className="h-4 w-4 animate-spin" /> Processing files…
                    </p>
                  )}
                </div>

                <div className="relative flex items-center">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="px-3 text-xs uppercase tracking-[0.3em] text-slate-400">or</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/40 p-5">
                  <h3 className="text-lg font-semibold text-white">Manual entry</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Asset ID"
                      value={manualForm.id}
                      onChange={value => setManualForm(prev => ({ ...prev, id: value }))}
                      placeholder="unique-id"
                    />
                    <Field
                      label="Title"
                      value={manualForm.title}
                      onChange={value => setManualForm(prev => ({ ...prev, title: value }))}
                      placeholder="Display title"
                    />
                    <Field
                      label="SHA-256"
                      value={manualForm.sha256}
                      onChange={value => setManualForm(prev => ({ ...prev, sha256: value }))}
                      placeholder="64 character hash"
                    />
                    <Field
                      label="Bytes"
                      value={manualForm.bytes}
                      onChange={value => setManualForm(prev => ({ ...prev, bytes: value }))}
                      placeholder="e.g. 1048576"
                    />
                    <Field
                      label="Source URL"
                      value={manualForm.url}
                      onChange={value => setManualForm(prev => ({ ...prev, url: value }))}
                      placeholder="https://..."
                    />
                  </div>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-slate-200">Notes</span>
                    <textarea
                      value={manualForm.notes}
                      onChange={event => setManualForm(prev => ({ ...prev, notes: event.target.value }))}
                      className="min-h-[80px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                    />
                  </label>
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      leadingIcon={<FilePlus2 className="h-4 w-4" />}
                      onClick={handleManualSubmit}
                    >
                      Create asset
                    </Button>
                  </div>
                </div>

                {errors.length > 0 && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    <p className="font-semibold">We couldn&apos;t process all files:</p>
                    <ul className="list-disc space-y-1 pl-4">
                      {errors.map(error => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </GlassCardContent>
            </GlassCard>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const ConfirmationDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  confirming: boolean;
}> = ({ open, onOpenChange, onConfirm, confirming }) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur" />
      <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94 }}
          className="w-full max-w-lg"
        >
          <GlassCard variant="elevated" glowColor="purple">
            <GlassCardHeader className="border-b border-white/10 pb-4">
              <Dialog.Title asChild>
                <GlassCardTitle className="text-2xl text-white">Send manifest?</GlassCardTitle>
              </Dialog.Title>
              <Dialog.Description asChild>
                <GlassCardDescription>
                  This will broadcast the updated manifest to everyone connected. Are you sure you want to continue?
                </GlassCardDescription>
              </Dialog.Description>
            </GlassCardHeader>
            <GlassCardContent>
              <div className="flex flex-col gap-4 text-sm text-slate-200">
                <p>
                  Changes will overwrite the previous manifest. Double-check any warnings before confirming.
                </p>
                <div className="flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    leadingIcon={<Send className="h-4 w-4" />}
                    onClick={onConfirm}
                    loading={confirming}
                  >
                    Send manifest
                  </Button>
                </div>
              </div>
            </GlassCardContent>
          </GlassCard>
        </motion.div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

function downloadManifest(entries: ManifestDraftEntry[]) {
  const manifest = { entries: entries.map(toManifestEntry) };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `manifest-${new Date().toISOString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function readJsonFile(file: File): Promise<AssetManifest> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return { entries: parsed } as AssetManifest;
  }
  if ('entries' in parsed && Array.isArray(parsed.entries)) {
    return parsed as AssetManifest;
  }
  throw new Error('Invalid manifest format');
}

function mergeValidation(
  entries: ManifestDraftEntry[],
  hasValidated: boolean,
  setEntryErrors: (errors: Record<string, string[]>) => void,
  setGlobalErrors: (errors: string[]) => void,
) {
  if (!hasValidated) return;
  const result = validateManifest(entries);
  setEntryErrors(result.entryErrors);
  setGlobalErrors(result.globalErrors);
}

export default function ManifestEditor() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const { control, manifestEntries, setManifest } = useSessionStore(state => ({
    control: state.control,
    manifestEntries: Object.values(state.manifest),
    setManifest: state.setManifest,
  }));

  const [draftEntries, setDraftEntries] = useState<ManifestDraftEntry[]>(() =>
    createDraftFromManifest(manifestEntries),
  );
  const [lastSentManifest, setLastSentManifest] = useState<AssetManifest['entries']>(manifestEntries);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [entryErrors, setEntryErrors] = useState<Record<string, string[]>>({});
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [hasValidated, setHasValidated] = useState(false);

  useEffect(() => {
    setLastSentManifest(manifestEntries);
    if (!draftEntries.length) {
      setDraftEntries(createDraftFromManifest(manifestEntries));
    }
  }, [manifestEntries]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const totalBytes = useMemo(
    () => draftEntries.reduce((acc, entry) => acc + (entry.bytes ?? 0), 0),
    [draftEntries],
  );

  const diff = useMemo(() => computeDiff(lastSentManifest, draftEntries), [lastSentManifest, draftEntries]);

  const updateEntries = useCallback(
    (updater: (entries: ManifestDraftEntry[]) => ManifestDraftEntry[] | void) => {
      setDraftEntries(prev => {
        const next = updater(prev) ?? prev;
        mergeValidation(next, hasValidated, setEntryErrors, setGlobalErrors);
        return Array.isArray(next) ? next : prev;
      });
    },
    [hasValidated, setEntryErrors, setGlobalErrors],
  );

  const handleAssetsAdded = (entries: ManifestDraftEntry[]) => {
    setFeedback(null);
    setHasValidated(false);
    setEntryErrors({});
    setGlobalErrors([]);
    setDraftEntries(prev => [...prev, ...entries]);
  };

  const handleRemove = (key: string) => {
    setFeedback(null);
    updateEntries(entries => entries.filter(entry => entry.key !== key));
  };

  const handleEntryChange = (key: string, next: ManifestDraftEntry) => {
    setFeedback(null);
    updateEntries(entries => entries.map(entry => (entry.key === key ? next : entry)));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setFeedback(null);
    setDraftEntries(prev => {
      const oldIndex = prev.findIndex(entry => entry.key === active.id);
      const newIndex = prev.findIndex(entry => entry.key === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const reordered = arrayMove(prev, oldIndex, newIndex);
      mergeValidation(reordered, hasValidated, setEntryErrors, setGlobalErrors);
      return reordered;
    });
  };

  const handleExport = () => {
    downloadManifest(draftEntries);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const manifest = await readJsonFile(file);
      const entries = createDraftFromManifest(manifest.entries);
      setDraftEntries(entries);
      setHasValidated(false);
      setEntryErrors({});
      setGlobalErrors([]);
      setFeedback({ type: 'success', message: `Imported ${entries.length} assets from manifest.` });
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message ?? 'Failed to import manifest.' });
    } finally {
      event.target.value = '';
    }
  };

  const handleSend = async () => {
    setHasValidated(true);
    const validation = validateManifest(draftEntries);
    setEntryErrors(validation.entryErrors);
    setGlobalErrors(validation.globalErrors);
    if (Object.keys(validation.entryErrors).length || validation.globalErrors.length) {
      setFeedback({ type: 'error', message: 'Resolve validation issues before sending the manifest.' });
      return;
    }

    if (!control) {
      setFeedback({ type: 'error', message: 'Control channel is not ready yet.' });
      return;
    }

    setSending(true);
    try {
      const manifestPayload = draftEntries.map(toManifestEntry);
      await control.setManifest(manifestPayload);
      setManifest(manifestPayload);
      setLastSentManifest(manifestPayload);
      setFeedback({ type: 'success', message: 'Manifest sent successfully.' });
      setConfirmOpen(false);
    } catch (err) {
      console.error('Failed to send manifest', err);
      setFeedback({ type: 'error', message: 'Failed to send manifest. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    const reset = createDraftFromManifest(lastSentManifest);
    setDraftEntries(reset);
    setHasValidated(false);
    setEntryErrors({});
    setGlobalErrors([]);
    setFeedback({ type: 'success', message: 'Reverted to the last sent manifest.' });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold text-white">Manifest editor</h1>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="ghost"
            leadingIcon={<Import className="h-4 w-4" />}
            onClick={() => importInputRef.current?.click()}
          >
            Import JSON
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={handleImport}
          />
          <Button variant="ghost" leadingIcon={<Download className="h-4 w-4" />} onClick={handleExport}>
            Export JSON
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<RefreshCw className="h-4 w-4" />}
            onClick={handleReset}
          >
            Reset to last sent
          </Button>
          <Button
            variant="primary"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={() => setAddModalOpen(true)}
          >
            Add asset
          </Button>
        </div>
      </div>

      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className={cn(
            'rounded-lg border px-4 py-3 text-sm shadow',
            feedback.type === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200',
          )}
        >
          {feedback.message}
        </motion.div>
      )}

      {globalErrors.length > 0 && (
        <GlassCard variant="default" glowColor="purple" className="border border-red-500/30 bg-red-500/10">
          <GlassCardHeader>
            <GlassCardTitle className="text-lg text-red-200">Manifest warnings</GlassCardTitle>
          </GlassCardHeader>
          <GlassCardContent>
            <ul className="list-disc space-y-1 pl-4 text-sm text-red-100">
              {globalErrors.map(error => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </GlassCardContent>
        </GlassCard>
      )}

      <GlassCard variant="elevated" glowColor="blue" className="overflow-hidden">
        <GlassCardHeader className="flex flex-col gap-3 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <GlassCardTitle className="text-2xl text-white">Assets</GlassCardTitle>
            <p className="text-sm text-slate-300">Drag cards to reorder. Edit metadata inline.</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <FileText className="h-4 w-4" />
            <span>
              {draftEntries.length} asset{draftEntries.length === 1 ? '' : 's'} · Total size {formatBytes(totalBytes)}
            </span>
          </div>
        </GlassCardHeader>
        <GlassCardContent className="gap-5">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={draftEntries.map(entry => entry.key)} strategy={verticalListSortingStrategy}>
              <AnimatePresence initial={false}>
                {draftEntries.map(entry => (
                  <SortableAssetCard
                    key={entry.key}
                    entry={entry}
                    onChange={next => handleEntryChange(entry.key, next)}
                    onRemove={() => handleRemove(entry.key)}
                    errors={entryErrors[entry.key] ?? []}
                  />
                ))}
              </AnimatePresence>
            </SortableContext>
          </DndContext>
          {draftEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/5 p-12 text-center text-slate-300">
              <FileJson className="h-10 w-10" />
              <p>No assets yet. Start by importing or adding a new asset.</p>
            </div>
          )}
        </GlassCardContent>
      </GlassCard>

      <GlassCard variant="default" glowColor="green">
        <GlassCardHeader>
          <GlassCardTitle className="text-xl text-white">Changes since last send</GlassCardTitle>
        </GlassCardHeader>
        <GlassCardContent className="gap-4 text-sm text-slate-200">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DiffPill label="Added" count={diff.added.length} />
            <DiffPill label="Removed" count={diff.removed.length} />
            <DiffPill label="Updated" count={diff.updated.length} />
            <DiffPill label="Reordered" count={diff.reordered.length} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <DiffSection
              title="Added"
              icon={<Plus className="h-4 w-4" />}
              empty="No new assets."
              items={diff.added.map(entry => ({
                id: entry.id,
                description: entry.title,
              }))}
            />
            <DiffSection
              title="Removed"
              icon={<Trash2 className="h-4 w-4" />}
              empty="No removals."
              items={diff.removed.map(entry => ({
                id: entry.id,
                description: entry.title ?? entry.id,
              }))}
            />
            <DiffSection
              title="Updated"
              icon={<FileText className="h-4 w-4" />}
              empty="No metadata changes."
              items={diff.updated.map(entry => ({
                id: entry.id,
                description: entry.fields.join(', '),
              }))}
            />
            <DiffSection
              title="Reordered"
              icon={<RefreshCw className="h-4 w-4" />}
              empty="No reordering."
              items={diff.reordered.map(id => ({ id, description: 'Order changed' }))}
            />
          </div>
        </GlassCardContent>
      </GlassCard>

      <GlassCard variant="default" glowColor="purple">
        <GlassCardHeader className="flex flex-col gap-3 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <GlassCardTitle className="text-xl text-white">Send manifest</GlassCardTitle>
            <p className="text-sm text-slate-300">
              Review your changes, then send with confidence. Confirmation keeps everyone in sync.
            </p>
          </div>
          <Button
            variant="primary"
            leadingIcon={<Send className="h-4 w-4" />}
            onClick={() => setConfirmOpen(true)}
            loading={sending}
          >
            Send manifest
          </Button>
        </GlassCardHeader>
        <GlassCardContent className="gap-4 text-sm text-slate-200">
          <p>
            Validation runs automatically before sending. Resolve any highlighted issues to keep the team moving
            smoothly.
          </p>
        </GlassCardContent>
      </GlassCard>

      <AddAssetModal open={addModalOpen} onOpenChange={setAddModalOpen} onAssets={handleAssetsAdded} />
      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleSend}
        confirming={sending}
      />
    </div>
  );
}

const DiffPill: React.FC<{ label: string; count: number }> = ({ label, count }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-center">
    <span className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</span>
    <span className="text-3xl font-semibold text-white">{count}</span>
  </div>
);

const DiffSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: Array<{ id: string; description: string }>;
  empty: string;
}> = ({ title, icon, items, empty }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
    <div className="mb-3 flex items-center gap-2 text-sm text-slate-200">
      {icon}
      <span className="font-semibold uppercase tracking-[0.2em]">{title}</span>
    </div>
    {items.length ? (
      <ul className="space-y-2 text-sm text-slate-100">
        {items.map(item => (
          <li key={`${title}-${item.id}`} className="rounded-lg border border-white/5 bg-slate-950/40 px-3 py-2">
            <p className="font-semibold text-white">{item.id}</p>
            <p className="text-xs text-slate-300">{item.description}</p>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-xs text-slate-400">{empty}</p>
    )}
  </div>
);

