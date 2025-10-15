import { create } from 'zustand';

export interface RecordingItem {
  id: string;
  url: string;
  createdAt: number;
  size: number;
  durationSec: number;
  mimeType: string;
  channels: number;
  filename: string;
  notes?: string;
  tags: string[];
  sampleRate?: number;
  bitrate?: number;
}

interface RecordingLibraryState {
  recordings: RecordingItem[];
  addRecording: (recording: RecordingItem) => void;
  removeRecording: (id: string) => void;
  setNotes: (id: string, notes: string) => void;
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;
  clearRecordings: () => void;
}

export const useRecordingLibraryStore = create<RecordingLibraryState>((set, get) => ({
  recordings: [],
  addRecording: recording =>
    set(state => {
      const nextRecording: RecordingItem = {
        ...recording,
        tags: Array.from(new Set(recording.tags ?? [])),
        notes: recording.notes?.trim() || undefined,
      };

      const existing = state.recordings.find(item => item.id === nextRecording.id);
      if (existing && existing.url !== nextRecording.url) {
        URL.revokeObjectURL(existing.url);
      }

      const filtered = state.recordings.filter(item => item.id !== nextRecording.id);
      return { recordings: [nextRecording, ...filtered] };
    }),
  removeRecording: id =>
    set(state => {
      const target = state.recordings.find(item => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return {
        recordings: state.recordings.filter(item => item.id !== id),
      };
    }),
  setNotes: (id, notes) =>
    set(state => ({
      recordings: state.recordings.map(item =>
        item.id === id
          ? {
              ...item,
              notes: notes.trim() ? notes.trim() : undefined,
            }
          : item
      ),
    })),
  addTag: (id, tag) =>
    set(state => {
      const normalized = tag.trim();
      if (!normalized) return state;
      return {
        recordings: state.recordings.map(item =>
          item.id === id && !item.tags.includes(normalized)
            ? { ...item, tags: [...item.tags, normalized] }
            : item
        ),
      };
    }),
  removeTag: (id, tag) =>
    set(state => ({
      recordings: state.recordings.map(item =>
        item.id === id
          ? { ...item, tags: item.tags.filter(existing => existing !== tag) }
          : item
      ),
    })),
  clearRecordings: () => {
    const { recordings } = get();
    recordings.forEach(item => URL.revokeObjectURL(item.url));
    set({ recordings: [] });
  },
}));
