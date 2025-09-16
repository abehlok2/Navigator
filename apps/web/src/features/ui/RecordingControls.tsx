import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { useSessionStore } from '../../state/session';
import { startMixRecording, type RecordingHandle } from '../audio/recorder';
import { getProgramStream } from '../audio/context';
import { formatBytes } from '../../lib/format';

interface RecordingItem {
  id: string;
  url: string;
  createdAt: number;
  size: number;
}

export default function RecordingControls() {
  const micStream = useSessionStore(state => state.micStream);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const handleRef = useRef<RecordingHandle | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const urlsRef = useRef<string[]>([]);
  const programStreamRef = useRef<MediaStream | null>(null);

  const canRecord = Boolean(micStream);

  const requestConsent = useCallback(() => {
    return Promise.resolve(window.confirm('Record the session mix to your device?'));
  }, []);

  const startRecording = useCallback(async () => {
    if (!micStream) {
      setError('Microphone stream is not available.');
      return;
    }
    setError(null);
    chunksRef.current = [];
    try {
      const programStream = programStreamRef.current ?? getProgramStream();
      programStreamRef.current = programStream;
      const handle = await startMixRecording(
        micStream,
        programStream,
        requestConsent,
        blob => {
          if (blob.size) {
            chunksRef.current.push(blob);
          }
        }
      );
      if (!handle) {
        setError('Recording consent was declined.');
        chunksRef.current = [];
        return;
      }
      handleRef.current = handle;
      setRecording(true);
    } catch (err) {
      console.error(err);
      setError('Recording is not supported in this browser.');
      chunksRef.current = [];
      handleRef.current = null;
    }
  }, [micStream, requestConsent]);

  const stopRecording = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;
    try {
      await handle.stop();
    } catch (err) {
      console.error(err);
    }
    handleRef.current = null;
    setRecording(false);
    if (chunksRef.current.length) {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const id = `recording-${Date.now()}`;
      urlsRef.current.push(url);
      setRecordings(prev => [
        { id, url, createdAt: Date.now(), size: blob.size },
        ...prev,
      ]);
    }
    chunksRef.current = [];
  }, []);

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
      urlsRef.current.forEach(url => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, []);

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
                  <div className="text-xs text-gray-600">{formatBytes(item.size)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    className="text-sm text-blue-600 hover:underline"
                    href={item.url}
                    download={`${item.id}.webm`}
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
