import { getAudioContext, getMasterGain } from './context';

const MIN_DB = -120;

export interface RecordingLevels {
  left: number;
  right: number;
}

export interface RecordingWaveform {
  left: Float32Array;
  right: Float32Array;
}

export interface RecordingHandle {
  readonly startedAt: number;
  readonly mimeType: string;
  readonly bitrate?: number;
  readonly sampleRate: number;
  stop: () => Promise<Blob>;
  pause: () => void;
  resume: () => void;
  isPaused: () => boolean;
  getLevels: () => RecordingLevels;
  getWaveform: () => RecordingWaveform;
}

export interface RecordingOptions {
  /** Target audio bitrate in bits per second */
  bitrate?: number;
  /** Timeslice in milliseconds for dataavailable events */
  latencyMs?: number;
}

/**
 * Captures the session mix—remote facilitator, local program audio, and the
 * active microphone—into a MediaRecorder for optional local archiving.
 * Consent is requested before recording begins. Bitrate and latency can be
 * provided to adapt to bandwidth constraints.
 */
export async function startMixRecording(
  mic: MediaStream,
  consent: () => Promise<boolean> | boolean,
  opts: RecordingOptions = {},
): Promise<RecordingHandle | null> {
  const allowed = await consent();
  if (!allowed) return null;

  const ctx = getAudioContext();
  const master = getMasterGain();

  const destination = ctx.createMediaStreamDestination();

  const masterTap = ctx.createGain();
  masterTap.channelCount = 2;
  masterTap.channelCountMode = 'explicit';
  masterTap.channelInterpretation = 'speakers';
  master.connect(masterTap);

  const mixBus = ctx.createGain();
  mixBus.channelCount = 2;
  mixBus.channelCountMode = 'explicit';
  mixBus.channelInterpretation = 'speakers';

  masterTap.connect(mixBus);

  const micSource = ctx.createMediaStreamSource(mic);
  micSource.connect(mixBus);

  mixBus.connect(destination);

  const splitter = ctx.createChannelSplitter(2);
  mixBus.connect(splitter);

  const leftAnalyser = ctx.createAnalyser();
  const rightAnalyser = ctx.createAnalyser();
  leftAnalyser.fftSize = 512;
  rightAnalyser.fftSize = 512;
  splitter.connect(leftAnalyser, 0);
  splitter.connect(rightAnalyser, 1);

  const leftBuffer = new Float32Array(leftAnalyser.fftSize);
  const rightBuffer = new Float32Array(rightAnalyser.fftSize);

  const recOpts: MediaRecorderOptions = {};
  if (opts.bitrate) recOpts.audioBitsPerSecond = opts.bitrate;
  const recorder = new MediaRecorder(destination.stream, recOpts);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => {
    if (e.data.size) chunks.push(e.data);
  };

  const startedAt = Date.now();
  let stopping = false;
  let paused = false;
  let resolveStop: ((blob: Blob) => void) | null = null;
  const stopPromise = new Promise<Blob>(resolve => {
    resolveStop = resolve;
  });

  const cleanup = () => {
    try {
      master.disconnect(masterTap);
    } catch (err) {
      /* ignore disconnect errors */
    }
    try {
      masterTap.disconnect();
    } catch (err) {
      /* ignore disconnect errors */
    }
    try {
      mixBus.disconnect();
    } catch (err) {
      /* ignore disconnect errors */
    }
    try {
      splitter.disconnect();
    } catch (err) {
      /* ignore disconnect errors */
    }
    try {
      micSource.disconnect();
    } catch (err) {
      /* ignore disconnect errors */
    }
  };

  recorder.onpause = () => {
    paused = true;
  };

  recorder.onresume = () => {
    paused = false;
  };

  recorder.onstop = () => {
    cleanup();
    paused = false;
    const mimeType =
      chunks.find(chunk => chunk.type)?.type ||
      recorder.mimeType ||
      'audio/webm';
    resolveStop?.(new Blob(chunks, { type: mimeType }));
  };

  recorder.start(opts.latencyMs);

  return {
    startedAt,
    mimeType: recorder.mimeType || 'audio/webm',
    bitrate: opts.bitrate,
    sampleRate: ctx.sampleRate,
    stop: () => {
      if (!stopping) {
        stopping = true;
        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          recorder.onstop?.(new Event('stop'));
        }
      }
      return stopPromise;
    },
    pause: () => {
      if (recorder.state === 'recording' && !paused) {
        try {
          recorder.pause();
        } catch (err) {
          console.warn('Failed to pause recording', err);
        }
      }
    },
    resume: () => {
      if ((recorder.state === 'paused' || paused) && recorder.state !== 'inactive') {
        try {
          recorder.resume();
        } catch (err) {
          console.warn('Failed to resume recording', err);
        }
      }
    },
    isPaused: () => paused || recorder.state === 'paused',
    getLevels: () => ({
      left: analyserToDb(leftAnalyser, leftBuffer),
      right: analyserToDb(rightAnalyser, rightBuffer),
    }),
    getWaveform: () => {
      leftAnalyser.getFloatTimeDomainData(leftBuffer);
      rightAnalyser.getFloatTimeDomainData(rightBuffer);
      return {
        left: new Float32Array(leftBuffer),
        right: new Float32Array(rightBuffer),
      };
    },
  };
}

function analyserToDb(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = buffer[i];
    sum += sample * sample;
  }
  if (sum <= 0) return MIN_DB;
  const rms = Math.sqrt(sum / buffer.length);
  return 20 * Math.log10(Math.max(rms, 1e-8));
}
