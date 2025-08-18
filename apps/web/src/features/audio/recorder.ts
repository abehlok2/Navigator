import { getAudioContext } from './context';

export interface RecordingHandle {
  stop: () => Promise<Blob>;
}

export interface RecordingOptions {
  /** Target audio bitrate in bits per second */
  bitrate?: number;
  /** Timeslice in milliseconds for dataavailable events */
  latencyMs?: number;
}

/**
 * Mixes the microphone and program audio into a MediaRecorder for optional
 * local capture. Prompts the user for consent via the provided callback.
 * Bitrate and latency can be provided to adapt to bandwidth constraints.
 */
export async function startMixRecording(
  mic: MediaStream,
  program: MediaStream,
  consent: () => Promise<boolean> | boolean,
  onData: (blob: Blob) => void,
  opts: RecordingOptions = {}
): Promise<RecordingHandle | null> {
  const allowed = await consent();
  if (!allowed) return null;
  const ctx = getAudioContext();
  const dest = ctx.createMediaStreamDestination();
  ctx.createMediaStreamSource(mic).connect(dest);
  ctx.createMediaStreamSource(program).connect(dest);
  const recOpts: MediaRecorderOptions = {};
  if (opts.bitrate) recOpts.audioBitsPerSecond = opts.bitrate;
  const recorder = new MediaRecorder(dest.stream, recOpts);
  recorder.ondataavailable = e => {
    if (e.data.size) onData(e.data);
  };
  recorder.start(opts.latencyMs);
  return {
    stop: () =>
      new Promise<Blob>(resolve => {
        recorder.onstop = () => resolve(new Blob([]));
        recorder.stop();
      }),
  };
}
