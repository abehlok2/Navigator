import { getAudioContext } from './context';

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export interface DuckingOptions {
  thresholdDb?: number; // level above which ducking engages
  reducedDb?: number; // gain reduction applied when speaking
  attack?: number; // seconds
  release?: number; // seconds
}

/**
 * Monitors a microphone stream and ducks the target gain node when speech is
 * detected. This is a lightweight RMS detector implemented with the Web Audio
 * API's AnalyserNode.
 */
export function setupSpeechDucking(
  mic: MediaStream,
  target: GainNode,
  opts: DuckingOptions = {}
) {
  const { thresholdDb = -50, reducedDb = -9, attack = 0.05, release = 0.3 } = opts;
  const ctx = getAudioContext();
  const src = ctx.createMediaStreamSource(mic);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const normalGain = target.gain.value;
  function tick() {
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const db = 20 * Math.log10(rms);
    const desired = db > thresholdDb ? dbToGain(reducedDb) : normalGain;
    const tc = db > thresholdDb ? attack : release;
    target.gain.setTargetAtTime(desired, ctx.currentTime, tc);
    requestAnimationFrame(tick);
  }
  tick();
}
