import type { ControlChannel } from '../control/channel';
import { getAnalyser } from './context';
import { getPlaying } from './scheduler';

export function startTelemetry(control: ControlChannel): () => void {
  const analyser = getAnalyser();
  const buffer = new Float32Array(analyser.fftSize);
  let stopped = false;

  function tick() {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i];
      sum += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sum / buffer.length);
    const playing = getPlaying();
    control
      .send('telemetry', { rms, peak, playing }, false)
      .catch(() => {});
    setTimeout(tick, 500);
  }
  tick();
  return () => {
    stopped = true;
  };
}
