import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '../../../components/ui/button';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardFooter,
  GlassCardHeader,
  GlassCardTitle,
} from '../../../components/ui/glass-card';
import { Label } from '../../../components/ui/label';
import { Select } from '../../../components/ui/select';
import { formatBytes } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import { useSessionStore } from '../../../state/session';
import VUMeter from '../../audio/components/VUMeter';
import {
  startMixRecording,
  type RecordingHandle,
  type RecordingLevels,
  type RecordingWaveform,
} from '../../audio/recorder';
import { getAudioContext } from '../../audio/context';
import Waveform from './Waveform';

interface RecordingItem {
  id: string;
  url: string;
  createdAt: number;
  size: number;
  durationSec: number;
  mimeType: string;
  filename: string;
  bitrate?: number;
  sampleRate: number;
}

type StudioState = 'idle' | 'recording' | 'paused';

const MIN_DB = -120;

const STATE_BADGES: Record<StudioState, { label: string; accent: string; ring: string }> = {
  idle: {
    label: 'Stopped',
    accent: 'bg-slate-500/60 text-slate-200',
    ring: 'shadow-[0_0_40px_-18px_rgba(148,163,184,0.6)]',
  },
  recording: {
    label: 'Recording',
    accent: 'bg-rose-500/80 text-rose-50',
    ring: 'shadow-[0_0_55px_-16px_rgba(248,113,113,0.95)]',
  },
  paused: {
    label: 'Paused',
    accent: 'bg-amber-400/80 text-amber-950',
    ring: 'shadow-[0_0_45px_-16px_rgba(251,191,36,0.75)]',
  },
};

const BITRATE_OPTIONS = [
  { value: '128000', label: '128 kbps' },
  { value: '192000', label: '192 kbps' },
  { value: '256000', label: '256 kbps' },
  { value: '320000', label: '320 kbps' },
];

const formatTimestamp = (value: number) =>
  new Date(value).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const hrs = Math.floor(mins / 60);
  const minsPart = mins % 60;
  if (hrs > 0) {
    return `${hrs}:${minsPart.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatElapsed = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00.0';
  const totalMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((totalMs % 1000) / 100);
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${tenths}`;
};

const describeMime = (mime: string) => {
  if (mime.includes('webm')) return 'WEBM / Opus';
  if (mime.includes('ogg')) return 'Ogg / Opus';
  if (mime.includes('wav')) return 'WAV / Linear PCM';
  return mime.toUpperCase();
};

const triggerDownload = (item: RecordingItem) => {
  const link = document.createElement('a');
  link.href = item.url;
  link.download = item.filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const calculateDb = (buffer: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = buffer[i];
    sum += sample * sample;
  }
  if (sum <= 0) return MIN_DB;
  const rms = Math.sqrt(sum / buffer.length);
  return 20 * Math.log10(Math.max(rms, 1e-8));
};

const RecordingStudio: React.FC = () => {
  const micStream = useSessionStore(state => state.micStream);
  const canRecord = Boolean(micStream);

  const [studioState, setStudioState] = useState<StudioState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [bitrate, setBitrate] = useState<string>('256000');
  const [activeFormat, setActiveFormat] = useState('audio/webm');
  const [sampleRate, setSampleRate] = useState<number>(48000);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [outputLevels, setOutputLevels] = useState<RecordingLevels>({ left: MIN_DB, right: MIN_DB });
  const [inputLevels, setInputLevels] = useState<RecordingLevels>({ left: MIN_DB, right: MIN_DB });
  const [waveform, setWaveform] = useState<RecordingWaveform | null>(null);
  const [autoSaveTake, setAutoSaveTake] = useState<RecordingItem | null>(null);

  const handleRef = useRef<RecordingHandle | null>(null);
  const urlsRef = useRef<string[]>([]);
  const meterRafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const pauseStartedAtRef = useRef<number | null>(null);
  const accumulatedPauseRef = useRef(0);
  const waveformIntervalRef = useRef<number | null>(null);

  const requestConsent = useCallback(() => {
    return Promise.resolve(window.confirm('Record the session mix to your device?'));
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      const handle = handleRef.current;
      if (!handle) {
        setElapsedMs(0);
        return;
      }
      const now = Date.now();
      const pausedDuration =
        accumulatedPauseRef.current +
        (pauseStartedAtRef.current ? now - pauseStartedAtRef.current : 0);
      setElapsedMs(Math.max(0, now - handle.startedAt - pausedDuration));
    }, 120);
  }, [stopTimer]);

  const stopOutputMonitoring = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    setOutputLevels({ left: MIN_DB, right: MIN_DB });
  }, []);

  const startOutputMonitoring = useCallback(() => {
    if (meterRafRef.current !== null) return;
    const tick = () => {
      const handle = handleRef.current;
      if (!handle) return;
      setOutputLevels(handle.getLevels());
      meterRafRef.current = requestAnimationFrame(tick);
    };
    meterRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopWaveformMonitoring = useCallback(() => {
    if (waveformIntervalRef.current !== null) {
      clearInterval(waveformIntervalRef.current);
      waveformIntervalRef.current = null;
    }
    setWaveform(null);
  }, []);

  const startWaveformMonitoring = useCallback(() => {
    if (waveformIntervalRef.current !== null) return;
    const tick = () => {
      const handle = handleRef.current;
      if (!handle) return;
      setWaveform(handle.getWaveform());
    };
    tick();
    waveformIntervalRef.current = window.setInterval(tick, 120);
  }, []);

  const resetTimers = useCallback(() => {
    accumulatedPauseRef.current = 0;
    pauseStartedAtRef.current = null;
    setElapsedMs(0);
  }, []);

  const startRecording = useCallback(async () => {
    if (!micStream) {
      setError('Microphone stream is not available.');
      return;
    }
    if (studioState === 'recording') return;
    setError(null);
    try {
      const bitrateValue = Number.parseInt(bitrate, 10);
      const handle = await startMixRecording(
        micStream,
        requestConsent,
        Number.isFinite(bitrateValue) ? { bitrate: bitrateValue } : undefined
      );
      if (!handle) {
        setError('Recording consent was declined.');
        return;
      }
      handleRef.current = handle;
      setStudioState('recording');
      setActiveFormat(handle.mimeType);
      setSampleRate(handle.sampleRate);
      resetTimers();
      startTimer();
      startOutputMonitoring();
      startWaveformMonitoring();
    } catch (err) {
      console.error(err);
      setError('Recording is not supported in this browser.');
      handleRef.current = null;
      stopOutputMonitoring();
      stopWaveformMonitoring();
      stopTimer();
    }
  }, [bitrate, micStream, requestConsent, resetTimers, startOutputMonitoring, startTimer, startWaveformMonitoring, stopOutputMonitoring, stopTimer, stopWaveformMonitoring, studioState]);

  const pauseRecording = useCallback(() => {
    const handle = handleRef.current;
    if (!handle || studioState !== 'recording') return;
    handle.pause();
    pauseStartedAtRef.current = Date.now();
    setStudioState('paused');
    stopOutputMonitoring();
    stopWaveformMonitoring();
  }, [studioState, stopOutputMonitoring, stopWaveformMonitoring]);

  const resumeRecording = useCallback(() => {
    const handle = handleRef.current;
    if (!handle || studioState !== 'paused') return;
    handle.resume();
    if (pauseStartedAtRef.current) {
      accumulatedPauseRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
    setStudioState('recording');
    startOutputMonitoring();
    startWaveformMonitoring();
  }, [startOutputMonitoring, startWaveformMonitoring, studioState]);

  const finalizeRecording = useCallback(
    async (handle: RecordingHandle) => {
      let blob: Blob | null = null;
      try {
        blob = await handle.stop();
      } catch (err) {
        console.error(err);
        setError('Failed to finalise the recording.');
      }
      handleRef.current = null;
      if (!blob) return;
      if (!blob.size) {
        setError('Recorded mix was empty.');
        return;
      }
      const createdAt = Date.now();
      const url = URL.createObjectURL(blob);
      urlsRef.current.push(url);
      const totalPaused =
        accumulatedPauseRef.current +
        (pauseStartedAtRef.current ? Date.now() - pauseStartedAtRef.current : 0);
      const durationSec = Math.max(0, (createdAt - handle.startedAt - totalPaused) / 1000);
      const filename = createFilename(createdAt, blob.type || handle.mimeType);
      const item: RecordingItem = {
        id: `session-mix-${createdAt}`,
        url,
        createdAt,
        size: blob.size,
        durationSec,
        mimeType: blob.type || handle.mimeType,
        filename,
        bitrate: handle.bitrate,
        sampleRate: handle.sampleRate,
      };
      setRecordings(prev => [item, ...prev]);
      setAutoSaveTake(item);
      setActiveFormat(item.mimeType);
    },
    []
  );

  const stopRecording = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;
    setStudioState('idle');
    stopOutputMonitoring();
    stopWaveformMonitoring();
    stopTimer();
    await finalizeRecording(handle);
    resetTimers();
  }, [finalizeRecording, resetTimers, stopOutputMonitoring, stopTimer, stopWaveformMonitoring]);

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
    if (!canRecord && handleRef.current) {
      void stopRecording();
    }
  }, [canRecord, stopRecording]);

  useEffect(() => {
    if (!micStream) {
      setInputLevels({ left: MIN_DB, right: MIN_DB });
      return;
    }
    let raf: number | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      const ctx = getAudioContext();
      setSampleRate(ctx.sampleRate || sampleRate);
      source = ctx.createMediaStreamSource(micStream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser!.getFloatTimeDomainData(buffer);
        const db = calculateDb(buffer);
        setInputLevels({ left: db, right: db });
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.warn('Failed to initialise input metering', err);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      try {
        source?.disconnect();
      } catch (err) {
        console.warn('Failed to disconnect input analyser', err);
      }
      try {
        analyser?.disconnect();
      } catch (err) {
        console.warn('Failed to clean analyser node', err);
      }
    };
  }, [micStream, sampleRate]);

  useEffect(() => {
    return () => {
      if (handleRef.current) {
        void handleRef.current.stop();
      }
      stopOutputMonitoring();
      stopWaveformMonitoring();
      stopTimer();
      urlsRef.current.forEach(url => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, [stopOutputMonitoring, stopTimer, stopWaveformMonitoring]);

  const stateBadge = STATE_BADGES[studioState];
  const formattedElapsed = useMemo(() => formatElapsed(elapsedMs), [elapsedMs]);

  return (
    <div className="space-y-6">
      <GlassCard variant="elevated" glowColor="purple" className="backdrop-saturate-150">
        <GlassCardHeader className="flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <GlassCardTitle className="text-2xl">Recording studio</GlassCardTitle>
            <GlassCardDescription>
              Capture the explorer mix with synchronized waveform monitoring, level metering, and instant download prompts.
            </GlassCardDescription>
          </div>
          <motion.div
            key={studioState}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn(
              'flex items-center gap-3 rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em]',
              stateBadge.accent,
              stateBadge.ring
            )}
          >
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inset-0 rounded-full bg-white/90" />
              <motion.span
                className="absolute inset-0 rounded-full bg-white/90"
                animate={{ scale: studioState === 'recording' ? [1, 1.3, 1] : 1, opacity: studioState === 'recording' ? [0.8, 0.2, 0.8] : 1 }}
                transition={{ duration: studioState === 'recording' ? 1.8 : 0.4, repeat: studioState === 'recording' ? Infinity : 0 }}
              />
            </span>
            {stateBadge.label}
          </motion.div>
        </GlassCardHeader>
        <GlassCardContent className="gap-8">
          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-6">
              <Waveform
                left={waveform?.left}
                right={waveform?.right}
                highlight={studioState === 'recording' ? 'rose' : 'sky'}
                className="border-white/5"
              />
              <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_90px_-60px_rgba(14,165,233,0.65)]">
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="danger"
                      size="lg"
                      onClick={startRecording}
                      disabled={!canRecord || studioState === 'recording'}
                      className={cn(
                        'group relative h-16 w-16 rounded-full p-0 shadow-[0_0_45px_-15px_rgba(244,63,94,0.95)] transition-all',
                        !canRecord || studioState === 'recording'
                          ? 'opacity-60'
                          : 'hover:scale-105 hover:shadow-[0_0_55px_-14px_rgba(248,113,113,1)]'
                      )}
                      animate={
                        studioState === 'recording'
                          ? { scale: [1, 1.08, 1], boxShadow: [
                              '0 0 45px -15px rgba(244,63,94,0.95)',
                              '0 0 70px -18px rgba(248,113,113,1)',
                              '0 0 45px -15px rgba(244,63,94,0.95)',
                            ] }
                          : { scale: 1 }
                      }
                      transition={{ duration: 1.6, repeat: studioState === 'recording' ? Infinity : 0, ease: 'easeInOut' }}
                    >
                      <span className="sr-only">Start Recording</span>
                      <span className="absolute inset-2 rounded-full bg-rose-400/90 blur-sm" />
                      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-xs font-semibold uppercase text-rose-500">
                        Rec
                      </span>
                    </Button>
                    <div className="text-left">
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Timer</div>
                      <div className="font-mono text-3xl text-white sm:text-4xl">{formattedElapsed}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={studioState === 'paused' ? resumeRecording : pauseRecording}
                      disabled={!canRecord || studioState === 'idle'}
                      className="min-w-[7rem]"
                    >
                      {studioState === 'paused' ? 'Resume' : 'Pause'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={stopRecording}
                      disabled={studioState === 'idle'}
                      className="min-w-[6.5rem]"
                    >
                      Stop
                    </Button>
                  </div>
                </div>
                {!canRecord && (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Connect a microphone-enabled role to enable recording.
                  </div>
                )}
                {error && (
                  <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-100">
                    {error}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-5">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_70px_-55px_rgba(59,130,246,0.65)]">
                <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Recording settings</h4>
                <div className="mt-4 space-y-4 text-sm text-slate-200">
                  <div>
                    <Label htmlFor="bitrate" className="text-xs uppercase tracking-[0.25em] text-slate-400">
                      Bitrate
                    </Label>
                    <Select
                      id="bitrate"
                      value={bitrate}
                      onChange={event => setBitrate(event.target.value)}
                      className="mt-2 rounded-2xl border-white/10 bg-white/[0.08] text-slate-100"
                    >
                      {BITRATE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
                      <div className="text-[0.65rem]">Sample rate</div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {(sampleRate / 1000).toFixed(1)} kHz
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
                      <div className="text-[0.65rem]">Format</div>
                      <div className="mt-2 text-base font-semibold text-white">{describeMime(activeFormat)}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Input levels</h4>
                <div className="mt-4 flex items-end gap-4">
                  <VUMeter
                    level={inputLevels.left}
                    peak={inputLevels.left}
                    channel="L"
                    orientation="vertical"
                    ariaLabel="Input level left"
                  />
                  <VUMeter
                    level={inputLevels.right}
                    peak={inputLevels.right}
                    channel="R"
                    orientation="vertical"
                    ariaLabel="Input level right"
                  />
                </div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Output mix levels</h4>
                <div className="mt-4 flex items-end gap-4">
                  <VUMeter
                    level={outputLevels.left}
                    peak={outputLevels.left}
                    channel="L"
                    orientation="vertical"
                    ariaLabel="Output level left"
                  />
                  <VUMeter
                    level={outputLevels.right}
                    peak={outputLevels.right}
                    channel="R"
                    orientation="vertical"
                    ariaLabel="Output level right"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-lg font-semibold text-white">Takes</h4>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                {recordings.length === 0 ? 'No recordings yet' : `${recordings.length} captured`}
              </span>
            </div>
            {recordings.length === 0 ? (
              <p className="mt-4 text-sm text-slate-300">
                When you stop a capture it will appear here with duration, format, and download options.
              </p>
            ) : (
              <motion.ul layout className="mt-4 space-y-3">
                <AnimatePresence initial={false}>
                  {recordings.map(item => (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{formatTimestamp(item.createdAt)}</div>
                        <div className="text-xs text-slate-300">
                          {formatDuration(item.durationSec)} • {formatBytes(item.size)} • {describeMime(item.mimeType)} •{' '}
                          {(item.sampleRate / 1000).toFixed(1)} kHz
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => triggerDownload(item)}
                          leadingIcon={
                            <svg
                              aria-hidden="true"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M10 3v10" />
                              <path d="M6.5 9.5 10 13l3.5-3.5" />
                              <path d="M4 15.5h12" />
                            </svg>
                          }
                        >
                          Download
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRecording(item.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </div>
        </GlassCardContent>
        <GlassCardFooter className="flex-col gap-3 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Recordings are stored locally. Download your take after each capture to archive or share.
          </span>
          <span className="uppercase tracking-[0.3em] text-slate-400">Auto-save reminders on stop</span>
        </GlassCardFooter>
      </GlassCard>

      <AnimatePresence>
        {autoSaveTake && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md rounded-[28px] border border-white/10 bg-slate-950/95 p-6 text-slate-100 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.95)]"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <h3 className="text-lg font-semibold text-white">Save your latest mix?</h3>
              <p className="mt-2 text-sm text-slate-300">
                We captured <strong>{formatDuration(autoSaveTake.durationSec)}</strong> of mix audio ({' '}
                {describeMime(autoSaveTake.mimeType)}) at {(autoSaveTake.sampleRate / 1000).toFixed(1)} kHz.
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-500">
                {formatBytes(autoSaveTake.size)}
                {autoSaveTake.bitrate ? ` • ${(autoSaveTake.bitrate / 1000).toFixed(0)} kbps` : ''}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => {
                    triggerDownload(autoSaveTake);
                    setAutoSaveTake(null);
                  }}
                >
                  Save recording
                </Button>
                <Button type="button" variant="ghost" size="md" onClick={() => setAutoSaveTake(null)}>
                  Maybe later
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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

export default RecordingStudio;
