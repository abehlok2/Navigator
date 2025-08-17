import { getAudioContext } from './context';

export interface RecordingHandle {
  stop: () => Promise<Blob>;
}

/**
 * Mixes the microphone and program audio into a MediaRecorder for optional
 * local capture. Prompts the user for consent via the provided callback.
 */
export async function startMixRecording(
  mic: MediaStream,
  program: MediaStream,
  consent: () => Promise<boolean> | boolean,
  onData: (blob: Blob) => void
): Promise<RecordingHandle | null> {
  const allowed = await consent();
  if (!allowed) return null;
  const ctx = getAudioContext();
  const dest = ctx.createMediaStreamDestination();
  ctx.createMediaStreamSource(mic).connect(dest);
  ctx.createMediaStreamSource(program).connect(dest);
  const recorder = new MediaRecorder(dest.stream);
  recorder.ondataavailable = e => {
    if (e.data.size) onData(e.data);
  };
  recorder.start();
  return {
    stop: () =>
      new Promise<Blob>(resolve => {
        recorder.onstop = () => resolve(new Blob([]));
        recorder.stop();
      }),
  };
}
