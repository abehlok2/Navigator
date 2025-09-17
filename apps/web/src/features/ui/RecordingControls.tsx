import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { useSessionStore } from '../../state/session';
import { startMixRecording, type RecordingHandle, type RecordingLevels } from '../audio/recorder';
import { formatBytes } from '../../lib/format';

interface RecordingItem {
  id: string;
  url: string;
  createdAt: number;
  size: number;
  durationSec: number;
  mimeType: string;
  channels: number;
  filename: string;
}

export default function RecordingControls() {
  const micStream = useSessionStore(state => state.micStream);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const handleRef = useRef<RecordingHandle | null>(null);
  const urlsRef = useRef<string[]>([]);
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
    const filename = createFilename(createdAt, blob.type);
    urlsRef.current.push(url);
    setRecordings(prev => [
      {
        id: `session-mix-${createdAt}`,
        url,
        createdAt,
        size: blob.size,
        durationSec,
        mimeType: blob.type || 'audio/webm',
        channels: 2,
        filename,
      },
      ...prev,
    ]);
  }, [stopMetering]);

  const removeRecording = useCallback((id: string) => {
    setRecordings(prev => {
      const next = prev.filter(item => item.id !== id);
      const removed = prev.find(item => item.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.url);
        urlsRef.current = urlsRef.current.filter(url => url !== removed.url);
      }
      return next;
    });
  }, []);

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
      urlsRef.current.forEach(url => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, [stopMetering]);

  return (
    <div className="section">
      <h2 className="text-lg font-semibold">Recording</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={startRecording} disabled={!canRecord || recording}>
          Start Recording
        </Button>
        <Button type="button" onClick={stopRecording} disabled={!recording}>
          Stop Recording
        </Button>
        {!canRecord && <span className="text-sm text-gray-600">Connect a microphone-enabled role to enable recording.</span>}
        {recording && <span className="text-sm text-red-600">Recording in progress…</span>}
      </div>
      {recording && (
        <LevelMeters levels={levels} />
      )}
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      <div className="mt-4">
        {recordings.length === 0 ? (
          <div className="text-sm text-gray-600">No recordings yet.</div>
        ) : (
          <ul className="space-y-2">
            {recordings.map(item => (
              <li key={item.id} className="flex items-center justify-between rounded border border-gray-200 p-2">
                <div>
                  <div className="text-sm font-medium">
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-600">
                    Session mix · {item.channels === 2 ? 'Stereo' : 'Mono'} · {formatDuration(item.durationSec)} ·{' '}
                    {formatBytes(item.size)} · {item.mimeType || 'audio/webm'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    className="text-sm text-blue-600 hover:underline"
                    href={item.url}
                    download={item.filename}
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    className="rounded bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300"
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
    </div>
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
    <div className="mt-3 w-full max-w-xs">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-600">Session mix level</div>
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
    <div className="mt-1">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span>{displayDb}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded bg-gray-200">
        <div
          className="h-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
