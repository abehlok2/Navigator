import { getAudioContext, getDuckingBus } from './context';

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export interface DuckingOptions {
  thresholdDb?: number; // level above which ducking engages
  reducedDb?: number; // gain reduction applied when speaking
  attack?: number; // seconds
  release?: number; // seconds
}

let activeCleanup: (() => void) | null = null;

export function cleanupSpeechDucking() {
  activeCleanup?.();
  activeCleanup = null;
}

/**
 * Monitors the shared ducking bus—which includes remote facilitator speech and
 * local microphone fallback—and ducks the target gain node when speech is
 * detected. This is a lightweight RMS detector implemented with the Web Audio
 * API's AnalyserNode.
 */
export function setupSpeechDucking(target: GainNode, opts: DuckingOptions = {}): () => void {
  cleanupSpeechDucking();
  const { thresholdDb = -50, reducedDb = -9, attack = 0.05, release = 0.3 } = opts;
  const ctx = getAudioContext();
  const bus = getDuckingBus();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  bus.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const normalGain = target.gain.value;
  const reductionGain = dbToGain(reducedDb);
  let rafId: number | null = null;
  let stopped = false;

  function tick() {
    if (stopped) return;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const levelDb = 20 * Math.log10(Math.max(rms, 1e-8));
    const desired = levelDb > thresholdDb ? normalGain * reductionGain : normalGain;
    const tc = levelDb > thresholdDb ? attack : release;
    target.gain.setTargetAtTime(desired, ctx.currentTime, tc);
    rafId = requestAnimationFrame(tick);
  }

  tick();

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
    try {
      bus.disconnect(analyser);
    } catch {
      // analyser may already be disconnected
    }
    analyser.disconnect();
    target.gain.setTargetAtTime(normalGain, ctx.currentTime, release);
  };

  activeCleanup = cleanup;
  return cleanup;
}
