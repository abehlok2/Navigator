import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { useSessionStore } from '../../state/session';
import { startMixRecording, type RecordingHandle, type RecordingLevels } from '../audio/recorder';
import { formatBytes } from '../../lib/format';
import { useRecordingLibraryStore, type RecordingItem } from '../recording/state';

export default function RecordingControls() {
  const micStream = useSessionStore(state => state.micStream);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recordings = useRecordingLibraryStore(state => state.recordings);
  const addRecording = useRecordingLibraryStore(state => state.addRecording);
  const removeRecording = useRecordingLibraryStore(state => state.removeRecording);
  const handleRef = useRef<RecordingHandle | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const [levels, setLevels] = useState<RecordingLevels>({ left: -120, right: -120 });

  const canRecord = Boolean(micStream);

  const requestConsent = useCallback(() => {
    return Promise.resolve(window.confirm('Record the session mix to your device?'));
  }, []);

  const stopMetering = useCallback(() => {
    if (meterFrameRef.current !== null) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    setLevels({ left: -120, right: -120 });
  }, []);

  const startMetering = useCallback(() => {
    if (meterFrameRef.current !== null) return;
    const tick = () => {
      const handle = handleRef.current;
      if (!handle) return;
      setLevels(handle.getLevels());
      meterFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startRecording = useCallback(async () => {
    if (!micStream) {
      setError('Microphone stream is not available.');
      return;
    }
    setError(null);
    try {
      const handle = await startMixRecording(micStream, requestConsent);
      if (!handle) {
        setError('Recording consent was declined.');
        return;
      }
      handleRef.current = handle;
      setRecording(true);
      startMetering();
    } catch (err) {
      console.error(err);
      setError('Recording is not supported in this browser.');
      handleRef.current = null;
      stopMetering();
    }
  }, [micStream, requestConsent, startMetering, stopMetering]);

  const stopRecording = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;
    const startedAt = handle.startedAt;
    let blob: Blob | null = null;
    try {
      blob = await handle.stop();
    } catch (err) {
      console.error(err);
      setError('Failed to finalise the recording.');
    } finally {
      handleRef.current = null;
      setRecording(false);
      stopMetering();
    }
    if (!blob) return;
    if (!blob.size) {
      setError('Recorded mix was empty.');
      return;
    }
    const createdAt = Date.now();
    const url = URL.createObjectURL(blob);
    const durationSec = Math.max(0, (createdAt - startedAt) / 1000);
    const mimeType = blob.type || handle.mimeType || 'audio/webm';
    const filename = createFilename(createdAt, mimeType);
    const item: RecordingItem = {
      id: `session-mix-${createdAt}`,
      url,
      createdAt,
      size: blob.size,
      durationSec,
      mimeType,
      channels: 2,
      filename,
      tags: [],
      sampleRate: handle.sampleRate,
      bitrate: handle.bitrate,
    };
    addRecording(item);
  }, [addRecording, stopMetering]);

  useEffect(() => {
    if (!canRecord && recording) {
      void stopRecording();
    }
  }, [canRecord, recording, stopRecording]);

  useEffect(() => {
    return () => {
      if (handleRef.current) {
        void handleRef.current.stop();
      }
      stopMetering();
    };
  }, [stopMetering]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-slate-50/70">
        <CardTitle>Session recording</CardTitle>
        <CardDescription>Capture the explorer mix directly in your browser for review or sharing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={startRecording}
            disabled={!canRecord || recording}
            className="bg-emerald-500 px-4 py-2 text-sm font-semibold hover:bg-emerald-600 disabled:bg-emerald-500/60"
          >
            Start recording
          </Button>
          <Button
            type="button"
            onClick={stopRecording}
            disabled={!recording}
            className="bg-rose-500 px-4 py-2 text-sm font-semibold hover:bg-rose-600 disabled:bg-rose-500/60"
          >
            Stop recording
          </Button>
          {!canRecord && (
            <span className="text-sm text-slate-500">
              Connect a microphone-enabled role to enable recording.
            </span>
          )}
          {recording && (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-600">
              Recording…
            </span>
          )}
        </div>
        {recording && <LevelMeters levels={levels} />}
        {error && <div className="text-sm font-medium text-rose-600">{error}</div>}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm">
          {recordings.length === 0 ? (
            <div className="text-sm text-slate-500">No recordings yet. When you stop a capture it will appear here.</div>
          ) : (
            <ul className="space-y-3">
              {recordings.map(item => (
                <li key={item.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500">
                      Session mix · {item.channels === 2 ? 'Stereo' : 'Mono'} · {formatDuration(item.durationSec)} ·{' '}
                      {formatBytes(item.size)} · {item.mimeType || 'audio/webm'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      className="text-sm font-semibold text-sky-600 hover:underline"
                      href={item.url}
                      download={item.filename}
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                      onClick={() => removeRecording(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function createFilename(createdAt: number, mimeType: string): string {
  const subtype = mimeType?.split('/')[1] ?? 'webm';
  const extension = subtype.split(';')[0] || 'webm';
  const timestamp = new Date(createdAt)
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', '');
  return `session-mix-${timestamp}.${extension}`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function LevelMeters({ levels }: { levels: RecordingLevels }) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session mix level</div>
      <Meter label="L" value={levels.left} />
      <Meter label="R" value={levels.right} />
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const clamped = Number.isFinite(value) ? Math.max(-60, Math.min(6, value)) : -60;
  const ratio = (clamped + 60) / 66; // map -60..6 dB to 0..1
  const percent = Math.max(0, Math.min(1, ratio)) * 100;
  const displayDb = value <= -120 ? '−∞' : `${Math.round(value)} dB`;
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>{displayDb}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
