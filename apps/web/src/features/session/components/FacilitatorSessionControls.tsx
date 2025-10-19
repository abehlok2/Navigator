import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardFooter,
  GlassCardHeader,
  GlassCardTitle,
} from '../../../components/ui/glass-card';
import { Button } from '../../../components/ui/button';
import { useSessionStore } from '../../../state/session';
import { getAudioContext, getMasterGain, unlockAudioContext } from '../../audio/context';
import { startMixRecording, type RecordingHandle } from '../../audio/recorder';
import { formatBytes } from '../../../lib/format';

interface SavedRecording {
  id: string;
  url: string;
  filename: string;
  createdAt: number;
  durationSec: number;
  size: number;
  mimeType: string;
}

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const createFilename = (createdAt: number, mimeType: string): string => {
  const subtype = mimeType?.split('/')[1] ?? 'webm';
  const extension = subtype.split(';')[0] || 'webm';
  const timestamp = new Date(createdAt)
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '');
  return `session-mix-${timestamp}.${extension}`;
};

export const FacilitatorSessionControls: React.FC = () => {
  const micStream = useSessionStore(state => state.micStream);
  const connection = useSessionStore(state => state.connection);
  const [audioState, setAudioState] = useState<AudioContextState | null>(null);
  const [volume, setVolume] = useState(1);
  const [recordingHandle, setRecordingHandle] = useState<RecordingHandle | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [savedRecordings, setSavedRecordings] = useState<SavedRecording[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const meterRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const savedRecordingsRef = useRef<SavedRecording[]>([]);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ctx = getAudioContext();
    setAudioState(ctx.state);
    const handleStateChange = () => setAudioState(ctx.state);
    ctx.addEventListener('statechange', handleStateChange);

    const gain = getMasterGain();
    setVolume(gain.gain.value);

    return () => {
      ctx.removeEventListener('statechange', handleStateChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (meterRef.current !== null) {
        cancelAnimationFrame(meterRef.current);
      }
      savedRecordingsRef.current.forEach(item => URL.revokeObjectURL(item.url));
    };
  }, []);

  const beginMetering = useCallback(() => {
    if (typeof window === 'undefined') return;
    const ctx = getAudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const gain = getMasterGain();
    gain.connect(analyser);
    analyserRef.current = analyser;
    gainRef.current = gain;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const max = data.reduce((acc, value) => Math.max(acc, value), 0);
      setLevel(max / 255);
      meterRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stopMetering = useCallback(() => {
    if (meterRef.current !== null) {
      cancelAnimationFrame(meterRef.current);
      meterRef.current = null;
    }
    setLevel(0);
    const analyser = analyserRef.current;
    const gain = gainRef.current;
    if (analyser && gain) {
      try {
        gain.disconnect(analyser);
      } catch {
        // ignore disconnect errors if already disconnected
      }
    }
    analyserRef.current = null;
    gainRef.current = null;
  }, []);

  const handleStartAudio = useCallback(async () => {
    if (typeof window === 'undefined') return;
    await unlockAudioContext();
    const ctx = getAudioContext();
    setAudioState(ctx.state);
  }, []);

  const handleStopAudio = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const ctx = getAudioContext();
    if (ctx.state !== 'closed') {
      await ctx.suspend();
      setAudioState(ctx.state);
    }
  }, []);

  const handleVolumeChange = useCallback((next: number) => {
    if (typeof window === 'undefined') return;
    const gain = getMasterGain();
    gain.gain.value = next;
    setVolume(next);
  }, []);

  const startRecording = useCallback(async () => {
    if (!micStream) {
      setRecordingError('Microphone stream is not available.');
      return;
    }
    if (recordingHandle) return;
    setRecordingError(null);
    try {
      const handle = await startMixRecording(micStream, () => Promise.resolve(true));
      if (!handle) {
        setRecordingError('Recording consent was declined.');
        return;
      }
      setRecordingHandle(handle);
      beginMetering();
    } catch (err) {
      setRecordingError((err as Error).message || 'Recording is not supported in this browser.');
      setRecordingHandle(null);
      stopMetering();
    }
  }, [beginMetering, micStream, recordingHandle, stopMetering]);

  const stopRecording = useCallback(async () => {
    const handle = recordingHandle;
    if (!handle) return;
    setIsSaving(true);
    try {
      const blob = await handle.stop();
      stopMetering();
      setRecordingHandle(null);
      if (!blob || !blob.size) {
        setRecordingError('Recorded mix was empty.');
        return;
      }
      const createdAt = Date.now();
      const url = URL.createObjectURL(blob);
      const durationSec = Math.max(0, (createdAt - handle.startedAt) / 1000);
      const mimeType = blob.type || handle.mimeType || 'audio/webm';
      const filename = createFilename(createdAt, mimeType);
      setSavedRecordings(prev => {
        const next = [
          {
            id: `mix-${createdAt}`,
            url,
            filename,
            createdAt,
            durationSec,
            size: blob.size,
            mimeType,
          },
          ...prev,
        ];
        savedRecordingsRef.current = next;
        return next;
      });
    } catch (err) {
      setRecordingError((err as Error).message || 'Failed to finalise the recording.');
    } finally {
      setIsSaving(false);
    }
  }, [recordingHandle, stopMetering]);

  const removeRecording = useCallback((id: string) => {
    setSavedRecordings(prev => {
      const next = prev.filter(item => item.id !== id);
      const removed = prev.find(item => item.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      savedRecordingsRef.current = next;
      return next;
    });
  }, []);

  const audioStateLabel = useMemo(() => {
    switch (audioState) {
      case 'running':
        return 'Audio running';
      case 'suspended':
        return 'Audio suspended';
      case 'closed':
        return 'Audio closed';
      default:
        return 'Audio idle';
    }
  }, [audioState]);

  const volumePercent = Math.round(volume * 100);
  const canRecord = Boolean(micStream);
  const recording = Boolean(recordingHandle);

  return (
    <GlassCard variant="elevated" glowColor="purple" className="h-full">
      <GlassCardHeader className="gap-3 border-white/10 pb-4">
        <GlassCardTitle className="text-xl">Session controls</GlassCardTitle>
        <GlassCardDescription>
          Start the shared audio graph, capture the program mix, and balance facilitator monitoring levels.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent className="gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleStartAudio} className="bg-emerald-500 hover:bg-emerald-600">
            Start audio
          </Button>
          <Button
            type="button"
            onClick={handleStopAudio}
            variant="secondary"
            className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10"
          >
            Stop audio
          </Button>
          <span className="text-xs uppercase tracking-[0.3em] text-slate-400">{audioStateLabel}</span>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
            <span>Master level</span>
            <span className="font-semibold text-slate-100">{volumePercent}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={150}
            value={Math.round(volume * 100)}
            onChange={event => handleVolumeChange(Number(event.target.value) / 100)}
            className="h-2 w-full appearance-none rounded-full bg-white/10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={startRecording}
            disabled={!canRecord || recording}
            className="bg-rose-500 hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-rose-500/60"
          >
            Start recording
          </Button>
          <Button
            type="button"
            onClick={stopRecording}
            disabled={!recording}
            className="border-white/20 bg-white/5 text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Stop recording
          </Button>
          {!canRecord && (
            <span className="text-xs text-slate-300">
              Connect a microphone-enabled explorer to enable recording.
            </span>
          )}
          {recording && <span className="text-xs font-semibold uppercase tracking-[0.35em] text-rose-300">Recording…</span>}
          {recordingError && <span className="text-xs font-medium text-rose-300">{recordingError}</span>}
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Live level</span>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400/60 via-blue-400/70 to-indigo-500/70 transition-[width] duration-150"
              style={{ width: `${Math.min(100, Math.round(level * 100))}%` }}
            />
          </div>
        </div>
        {savedRecordings.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Recent recordings</span>
              {isSaving && <span className="text-xs text-slate-300">Saving…</span>}
            </div>
            <ul className="flex flex-col gap-3">
              {savedRecordings.map(item => (
                <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-sm font-semibold text-white">
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-300/80">
                    {item.filename} • {formatDuration(item.durationSec)} • {formatBytes(item.size)}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={item.url}
                      download={item.filename}
                      className="text-xs font-semibold text-sky-300 hover:underline"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      className="text-xs text-slate-300 hover:text-white"
                      onClick={() => removeRecording(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </GlassCardContent>
      <GlassCardFooter className="text-xs uppercase tracking-[0.3em] text-slate-400">
        Connection: {connection}
      </GlassCardFooter>
    </GlassCard>
  );
};

export default FacilitatorSessionControls;
