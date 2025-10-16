import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  Download,
  FileText,
  Pause,
  Play,
  Search,
  Tag,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';

import { Button } from '../../../components/ui/button';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../../../components/ui/glass-card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Select } from '../../../components/ui/select';
import { formatBytes } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import {
  useRecordingLibraryStore,
  type RecordingItem,
} from '../state';

const MotionGlassCard = motion.create(GlassCard);

type SortOption = 'newest' | 'oldest' | 'duration-desc' | 'duration-asc';
type DurationFilter = 'all' | 'short' | 'medium' | 'long';

export default function RecordingLibrary() {
  const recordings = useRecordingLibraryStore(state => state.recordings);
  const removeRecording = useRecordingLibraryStore(state => state.removeRecording);
  const setNotes = useRecordingLibraryStore(state => state.setNotes);
  const addTag = useRecordingLibraryStore(state => state.addTag);
  const removeTag = useRecordingLibraryStore(state => state.removeTag);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [notesDialogId, setNotesDialogId] = useState<string | null>(null);
  const [playbackId, setPlaybackId] = useState<string | null>(null);
  const [inlinePlayingId, setInlinePlayingId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const playbackRecording = useMemo(
    () => recordings.find(item => item.id === playbackId),
    [playbackId, recordings]
  );

  const notesRecording = useMemo(
    () => recordings.find(item => item.id === notesDialogId),
    [notesDialogId, recordings]
  );

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  }, []);

  const handleSortChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSortOption(event.target.value as SortOption);
  }, []);

  const handleDurationChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setDurationFilter(event.target.value as DurationFilter);
  }, []);

  const filteredRecordings = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const matchesDuration = (recording: RecordingItem) => {
      switch (durationFilter) {
        case 'short':
          return recording.durationSec < 300;
        case 'medium':
          return recording.durationSec >= 300 && recording.durationSec < 1800;
        case 'long':
          return recording.durationSec >= 1800;
        default:
          return true;
      }
    };

    const result = recordings.filter(recording => {
      if (!matchesDuration(recording)) return false;
      if (!term) return true;
      const haystack = [
        recording.notes ?? '',
        recording.filename ?? '',
        recording.tags.join(' '),
        new Date(recording.createdAt).toLocaleString(),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      switch (sortOption) {
        case 'oldest':
          return a.createdAt - b.createdAt;
        case 'duration-desc':
          return b.durationSec - a.durationSec;
        case 'duration-asc':
          return a.durationSec - b.durationSec;
        case 'newest':
        default:
          return b.createdAt - a.createdAt;
      }
    });
    return sorted;
  }, [durationFilter, recordings, searchTerm, sortOption]);

  const handleInlineToggle = useCallback(
    (recording: RecordingItem) => {
      const current = inlinePlayingId ? audioRefs.current[inlinePlayingId] : null;
      const next = audioRefs.current[recording.id];

      if (!next) {
        return;
      }

      if (inlinePlayingId && inlinePlayingId !== recording.id && current) {
        current.pause();
        current.currentTime = 0;
      }

      if (inlinePlayingId === recording.id) {
        next.pause();
        setInlinePlayingId(null);
        return;
      }

      next.currentTime = 0;
      void next
        .play()
        .then(() => setInlinePlayingId(recording.id))
        .catch(() => {
          setInlinePlayingId(null);
        });
    },
    [inlinePlayingId]
  );

  useEffect(() => {
    if (!inlinePlayingId) return;
    const audio = audioRefs.current[inlinePlayingId];
    if (!audio) return;

    const handleEnded = () => {
      setInlinePlayingId(prev => (prev === inlinePlayingId ? null : prev));
    };
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [inlinePlayingId]);

  const handleDownload = useCallback((recording: RecordingItem) => {
    const anchor = document.createElement('a');
    anchor.href = recording.url;
    anchor.download = recording.filename || 'recording.webm';
    anchor.rel = 'noopener';
    anchor.click();
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      if (inlinePlayingId === id) {
        const current = audioRefs.current[id];
        current?.pause();
        setInlinePlayingId(null);
      }
      if (playbackId === id) {
        setPlaybackId(null);
      }
      removeRecording(id);
    },
    [inlinePlayingId, playbackId, removeRecording]
  );

  const showEmptyState = filteredRecordings.length === 0;

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Recording library
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-300 sm:text-base">
            Browse, annotate, and export captured sessions from your explorer mix. Sort by date or
            duration, add contextual notes, and revisit moments with the immersive waveform viewer.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <div className="flex-1 sm:min-w-[220px]">
            <Label htmlFor="recording-search" className="mb-1 block text-slate-200">
              Search notes
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="recording-search"
                placeholder="Find recordings by notes or tags"
                className="bg-white/80 pl-9 text-slate-900"
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
          </div>
          <div className="sm:w-40">
            <Label htmlFor="recording-sort" className="mb-1 block text-slate-200">
              Sort by
            </Label>
            <Select
              id="recording-sort"
              value={sortOption}
              onChange={handleSortChange}
              className="bg-white/80 text-slate-900"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="duration-desc">Duration · Long → Short</option>
              <option value="duration-asc">Duration · Short → Long</option>
            </Select>
          </div>
          <div className="sm:w-44">
            <Label htmlFor="recording-duration" className="mb-1 block text-slate-200">
              Duration
            </Label>
            <Select
              id="recording-duration"
              value={durationFilter}
              onChange={handleDurationChange}
              className="bg-white/80 text-slate-900"
            >
              <option value="all">All lengths</option>
              <option value="short">Under 5 minutes</option>
              <option value="medium">5 – 30 minutes</option>
              <option value="long">30+ minutes</option>
            </Select>
          </div>
        </div>
      </div>

      {showEmptyState ? (
        <GlassCard
          variant="elevated"
          glowColor="blue"
          className="flex flex-col items-center justify-center gap-4 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
            <FileText className="h-8 w-8 text-slate-200" />
          </div>
          <GlassCardTitle className="text-2xl text-white">No recordings yet</GlassCardTitle>
          <GlassCardDescription className="text-base text-slate-200/80">
            Capture your first session to see it appear here. Notes, tags, and exports will be ready as
            soon as a recording finishes rendering.
          </GlassCardDescription>
        </GlassCard>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {filteredRecordings.map(recording => {
              const isPlaying = inlinePlayingId === recording.id;
              const glowColor = recording.durationSec > 1800 ? 'purple' : recording.durationSec > 600 ? 'blue' : 'green';
              return (
                <MotionGlassCard
                  key={recording.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.97 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  variant="elevated"
                  glowColor={glowColor}
                  className="flex flex-col overflow-hidden"
                >
                  <button
                    type="button"
                    className="group relative block overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/70 to-slate-900/50"
                    onClick={() => setPlaybackId(recording.id)}
                  >
                    <WaveformThumbnail recording={recording} isPlaying={isPlaying} />
                    <span className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/80 backdrop-blur">
                      <Wand2 className="h-3.5 w-3.5" /> Waveform view
                    </span>
                  </button>

                  <GlassCardContent className="mt-6 flex flex-1 flex-col gap-6 text-sm text-slate-200">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-200">
                        <span className="flex items-center gap-2 font-semibold text-white">
                          <Calendar className="h-4 w-4 text-slate-300" />
                          {new Date(recording.createdAt).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDuration(recording.durationSec)}
                        </span>
                      </div>
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                        {recording.mimeType.toUpperCase()} • {formatBytes(recording.size)} •{' '}
                        {recording.channels === 2 ? 'Stereo' : 'Mono'}
                      </div>
                    </div>

                    {recording.notes && (
                      <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 shadow-inner">
                        “{recording.notes}”
                      </p>
                    )}

                    {recording.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {recording.tags.map(tag => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto flex flex-wrap items-center gap-3">
                      <Button
                        size="sm"
                        variant="primary"
                        leadingIcon={isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        onClick={() => handleInlineToggle(recording)}
                      >
                        {isPlaying ? 'Pause preview' : 'Play preview'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        leadingIcon={<Download className="h-4 w-4" />}
                        onClick={() => handleDownload(recording)}
                      >
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<FileText className="h-4 w-4" />}
                        onClick={() => setNotesDialogId(recording.id)}
                      >
                        {recording.notes ? 'Edit notes' : 'Add notes'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        leadingIcon={<Trash2 className="h-4 w-4" />}
                        onClick={() => handleDelete(recording.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </GlassCardContent>

                  <audio
                    ref={node => {
                      if (node) {
                        audioRefs.current[recording.id] = node;
                      } else {
                        delete audioRefs.current[recording.id];
                      }
                    }}
                    src={recording.url}
                    preload="metadata"
                  />
                </MotionGlassCard>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <NotesDialog
        recording={notesRecording}
        open={Boolean(notesRecording)}
        onClose={() => setNotesDialogId(null)}
        onSave={value => {
          if (notesRecording) {
            setNotes(notesRecording.id, value);
          }
          setNotesDialogId(null);
        }}
      />

      <PlaybackModal
        recording={playbackRecording}
        open={Boolean(playbackRecording)}
        onOpenChange={open => {
          if (!open) {
            setPlaybackId(null);
          }
        }}
        onDownload={handleDownload}
        onDelete={id => handleDelete(id)}
        onAddTag={(id, tag) => addTag(id, tag)}
        onRemoveTag={(id, tag) => removeTag(id, tag)}
        onEditNotes={value => {
          if (playbackRecording) {
            setNotes(playbackRecording.id, value);
          }
        }}
      />
    </div>
  );
}

interface NotesDialogProps {
  recording?: RecordingItem;
  open: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}

function NotesDialog({ recording, open, onClose, onSave }: NotesDialogProps) {
  const [value, setValue] = useState(recording?.notes ?? '');

  useEffect(() => {
    setValue(recording?.notes ?? '');
  }, [recording]);

  return (
    <Dialog.Root open={open} onOpenChange={next => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-xl translate-x-[-50%] translate-y-[-50%] p-4 duration-200 focus:outline-none focus-visible:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <GlassCard variant="elevated" glowColor="purple" className="space-y-6">
            <GlassCardHeader className="mb-2 flex flex-col gap-3 border-b border-white/10 pb-4">
              <Dialog.Title asChild>
                <GlassCardTitle className="text-2xl text-white">Add session notes</GlassCardTitle>
              </Dialog.Title>
              <Dialog.Description asChild>
                <GlassCardDescription>
                  Capture what stood out, identify highlights, or jot down follow-up tasks linked to this
                  recording.
                </GlassCardDescription>
              </Dialog.Description>
            </GlassCardHeader>
            <GlassCardContent className="gap-5">
              <div className="space-y-2">
                <Label htmlFor="recording-notes" className="text-slate-200">
                  Notes
                </Label>
                <textarea
                  id="recording-notes"
                  rows={6}
                  value={value}
                  onChange={event => setValue(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/80 p-4 text-sm text-slate-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="Describe the moment, timestamp highlights, or next steps for collaborators."
                />
              </div>
            </GlassCardContent>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-4">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => onSave(value)}>
                Save notes
              </Button>
            </div>
          </GlassCard>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface PlaybackModalProps {
  recording?: RecordingItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (recording: RecordingItem) => void;
  onDelete: (id: string) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
  onEditNotes: (notes: string) => void;
}

function PlaybackModal({
  recording,
  open,
  onOpenChange,
  onDownload,
  onDelete,
  onAddTag,
  onRemoveTag,
  onEditNotes,
}: PlaybackModalProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [tagInput, setTagInput] = useState('');
  const [notesValue, setNotesValue] = useState(recording?.notes ?? '');

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    setTagInput('');
    setNotesValue(recording?.notes ?? '');
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [recording?.id, recording?.notes]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [recording?.id]);

  if (!recording) {
    return null;
  }

  const duration = Math.max(recording.durationSec, audioRef.current?.duration ?? 0);

  const handleTogglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play().catch(() => {});
    }
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const value = Number(event.target.value);
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    onAddTag(recording.id, tagInput.trim());
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    onRemoveTag(recording.id, tag);
  };

  const handleSaveNotes = () => {
    onEditNotes(notesValue);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-4xl translate-x-[-50%] translate-y-[-50%] p-4 duration-200 focus:outline-none focus-visible:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <GlassCard variant="elevated" glowColor="blue" className="space-y-8">
              <GlassCardHeader className="border-b border-white/10 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title asChild>
                      <GlassCardTitle className="text-3xl text-white">Session playback</GlassCardTitle>
                    </Dialog.Title>
                    <Dialog.Description asChild>
                      <GlassCardDescription className="text-base text-slate-200/80">
                        Dive into the full-resolution waveform, refine notes, and export takes for sharing or
                        archival.
                      </GlassCardDescription>
                    </Dialog.Description>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    leadingIcon={<X className="h-4 w-4" />}
                    onClick={() => onOpenChange(false)}
                  >
                    Close
                  </Button>
                </div>
              </GlassCardHeader>

              <GlassCardContent className="gap-8">
                <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
                  <WaveformDisplay recording={recording} progress={duration ? currentTime / duration : 0} />
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="primary"
                      leadingIcon={isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      onClick={handleTogglePlayback}
                    >
                      {isPlaying ? 'Pause' : 'Play'}
                    </Button>
                    <div className="text-sm text-slate-100">
                      <div className="font-semibold">{recording.filename}</div>
                      <div className="text-xs uppercase tracking-widest text-slate-300">
                        {formatDuration(recording.durationSec)} • {formatBytes(recording.size)} •{' '}
                        {recording.mimeType.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full max-w-md items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      step={0.01}
                      value={Math.min(currentTime, duration)}
                      onChange={handleSeek}
                      className="h-1 flex-1 cursor-pointer rounded-full bg-white/20 accent-sky-400"
                    />
                    <span className="w-20 text-right text-xs font-semibold text-slate-200">
                      {formatDuration(currentTime)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-slate-100">
                    <div className="font-semibold">Export options</div>
                    <p className="text-xs text-slate-300">
                      Download the captured mix or generate a high-resolution WAV for archival workflows.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="secondary" leadingIcon={<Download className="h-4 w-4" />} onClick={() => onDownload(recording)}>
                      Download original
                    </Button>
                    <Button
                      variant="ghost"
                      leadingIcon={<Wand2 className="h-4 w-4" />}
                      onClick={() => {
                        window.setTimeout(() => {
                          console.info('Export as WAV triggered for recording', recording.id);
                        }, 0);
                      }}
                    >
                      Export as WAV
                    </Button>
                    <Button
                      variant="danger"
                      leadingIcon={<Trash2 className="h-4 w-4" />}
                      onClick={() => onDelete(recording.id)}
                    >
                      Delete recording
                    </Button>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-white">Notes</h3>
                      <span className="text-xs uppercase tracking-widest text-slate-400">
                        Last captured {new Date(recording.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={notesValue}
                      onChange={event => setNotesValue(event.target.value)}
                      onBlur={handleSaveNotes}
                      placeholder="Add context, reactions, or cues…"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                    <Button variant="primary" size="sm" onClick={handleSaveNotes}>
                      Save notes
                    </Button>
                  </div>
                  <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-slate-200" />
                      <h3 className="text-base font-semibold text-white">Tags</h3>
                    </div>
                    <p className="text-xs text-slate-300">
                      Organise the recording with tags so you can search for moods, sessions, or follow-up
                      categories.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recording.tags.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="group flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100 transition hover:bg-white/20"
                        >
                          #{tag}
                          <X className="h-3 w-3 text-slate-300 group-hover:text-white" />
                        </button>
                      ))}
                      {recording.tags.length === 0 && (
                        <span className="text-xs uppercase tracking-widest text-slate-400">
                          No tags yet
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={tagInput}
                        onChange={event => setTagInput(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAddTag();
                          }
                        }}
                        placeholder="Add tag and press enter"
                        className="bg-slate-950/60 text-slate-100"
                      />
                      <Button variant="secondary" size="sm" onClick={handleAddTag}>
                        Add tag
                      </Button>
                    </div>
                  </div>
                </div>
              </GlassCardContent>
              <audio ref={audioRef} src={recording.url} preload="metadata" />
            </GlassCard>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WaveformThumbnail({
  recording,
  isPlaying,
}: {
  recording: RecordingItem;
  isPlaying: boolean;
}) {
  const bars = useMemo(() => createWaveformSeries(recording.id, 64), [recording.id]);
  return (
    <div className="relative flex h-36 w-full items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-purple-900/50 to-slate-900/90" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-sky-500/20 via-transparent to-transparent" />
      <div className="relative flex h-24 w-full items-center justify-center gap-[3px] px-6">
        {bars.map((value, index) => (
          <motion.span
            key={`${recording.id}-bar-${index}`}
            className="w-[3px] rounded-full bg-gradient-to-b from-sky-300 via-purple-300 to-emerald-300"
            initial={{ scaleY: 0.1, opacity: 0.4 }}
            animate={{ scaleY: value, opacity: isPlaying ? 1 : 0.8 }}
            transition={{
              duration: 0.6,
              delay: index * 0.01,
              repeat: isPlaying ? Infinity : 0,
              repeatType: 'mirror',
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
    </div>
  );
}

function WaveformDisplay({
  recording,
  progress,
}: {
  recording: RecordingItem;
  progress: number;
}) {
  const bars = useMemo(() => createWaveformSeries(recording.id, 120), [recording.id]);
  return (
    <div className="relative flex h-48 items-center justify-center overflow-hidden rounded-3xl bg-slate-950/60">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.25),_transparent_65%)]" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
      <div className="relative flex h-40 w-full items-end justify-center gap-[4px] px-6">
        {bars.map((value, index) => {
          const active = progress * bars.length >= index;
          return (
            <div
              key={`${recording.id}-full-${index}`}
              className={cn(
                'w-[4px] rounded-full transition-all duration-300 ease-out',
                active
                  ? 'bg-gradient-to-b from-emerald-300 via-sky-300 to-purple-400 shadow-[0_0_25px_rgba(56,189,248,0.35)]'
                  : 'bg-white/10'
              )}
              style={{ height: `${value * 100}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function createWaveformSeries(seedSource: string, length: number) {
  const seed = seedFromString(seedSource);
  const values: number[] = [];
  let current = seed;
  for (let i = 0; i < length; i += 1) {
    current = (current * 1664525 + 1013904223) % 4294967296;
    const normalized = (current & 0xffff) / 0xffff;
    const shaped = 0.2 + 0.8 * Math.pow(normalized, 1.2);
    values.push(Math.max(0.08, Math.min(1, shaped)));
  }
  return values;
}

function seedFromString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
