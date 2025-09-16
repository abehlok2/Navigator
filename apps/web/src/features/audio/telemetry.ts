import type { ControlChannel } from '../control/channel';
import { getAnalyser, getAudioContext, getDuckingBus } from './context';

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

export function startTelemetry(control: ControlChannel): () => void {
  const analyser = getAnalyser();
  const buffer = new Float32Array(analyser.fftSize);
  const ctx = getAudioContext();
  const speechAnalyser = ctx.createAnalyser();
  speechAnalyser.fftSize = analyser.fftSize;
  const duckingBus = getDuckingBus();
  duckingBus.connect(speechAnalyser);
  const speechBuffer = new Float32Array(speechAnalyser.fftSize);

  let stopped = false;
  let timer: number | null = null;

  function tick() {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buffer);
    const program = bufferToDb(buffer);
    speechAnalyser.getFloatTimeDomainData(speechBuffer);
    const speech = bufferToDb(speechBuffer);
    control.send('telemetry.levels', { mic: speech, program }, false).catch(() => {});
    timer = window.setTimeout(tick, 500);
  }

  tick();

  return () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    try {
      duckingBus.disconnect(speechAnalyser);
    } catch {
      // already disconnected
    }
    speechAnalyser.disconnect();
  };
}
