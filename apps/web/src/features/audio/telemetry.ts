import type { ControlChannel } from '../control/channel';
import { getAnalyser, getAudioContext } from './context';

const MIN_DBFS = -100;

function bufferToDb(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i];
    sum += v * v;
  }
  const rms = Math.sqrt(sum / buffer.length);
  const db = 20 * Math.log10(Math.max(rms, 1e-8));
  return Math.max(MIN_DBFS, db);
}

export function startTelemetry(control: ControlChannel, micStream?: MediaStream | null): () => void {
  const analyser = getAnalyser();
  const buffer = new Float32Array(analyser.fftSize);
  const ctx = getAudioContext();
  let micAnalyser: AnalyserNode | null = null;
  let micSource: MediaStreamAudioSourceNode | null = null;
  let micBuffer: Float32Array<ArrayBuffer> | null = null;

  if (micStream) {
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = analyser.fftSize;
    micSource = ctx.createMediaStreamSource(micStream);
    micSource.connect(micAnalyser);
    micBuffer = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;
  }

  let stopped = false;
  let timer: number | null = null;

  function tick() {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buffer);
    const program = bufferToDb(buffer);
    let mic = MIN_DBFS;
    if (micAnalyser && micBuffer) {
      micAnalyser.getFloatTimeDomainData(micBuffer);
      mic = bufferToDb(micBuffer);
    }
    control.send('telemetry.levels', { mic, program }, false).catch(() => {});
    timer = window.setTimeout(tick, 500);
  }

  tick();

  return () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    micSource?.disconnect();
    micAnalyser?.disconnect();
  };
}
