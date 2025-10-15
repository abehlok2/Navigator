import { useEffect, useRef } from 'react';

let shared: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let programDestination: MediaStreamAudioDestinationNode | null = null;
let remoteFacilitatorBus: GainNode | null = null;
let duckingBus: GainNode | null = null;
let programBus: GainNode | null = null;

export function getAudioContext(): AudioContext {
  if (!shared) {
    shared = new AudioContext();
  }
  return shared;
}

export function getMasterGain(): GainNode {
  const ctx = getAudioContext();
  if (!master) {
    master = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    master.connect(analyser);
    analyser.connect(ctx.destination);
  }
  return master;
}

export function getAnalyser(): AnalyserNode {
  if (!analyser) getMasterGain();
  return analyser!;
}

export function getProgramBus(): GainNode {
  if (!programBus) {
    const ctx = getAudioContext();
    programBus = ctx.createGain();
    programBus.gain.value = 1;
    programBus.connect(getMasterGain());
  }
  return programBus;
}

export function getProgramStream(): MediaStream {
  if (!programDestination) {
    const ctx = getAudioContext();
    programDestination = ctx.createMediaStreamDestination();
    getProgramBus().connect(programDestination);
  }
  return programDestination.stream;
}

export function getDuckingBus(): GainNode {
  const ctx = getAudioContext();
  if (!duckingBus) {
    duckingBus = ctx.createGain();
    duckingBus.gain.value = 1;
  }
  return duckingBus;
}

export function getRemoteFacilitatorBus(): GainNode {
  const ctx = getAudioContext();
  if (!remoteFacilitatorBus) {
    remoteFacilitatorBus = ctx.createGain();
    remoteFacilitatorBus.gain.value = 1;
    remoteFacilitatorBus.connect(getMasterGain());
    remoteFacilitatorBus.connect(getDuckingBus());
  }
  return remoteFacilitatorBus;
}

/**
 * Unlocks the shared AudioContext in response to a user gesture.
 * Browsers require audio playback to be triggered from an interaction
 * like a click or touch event. Call this from such a handler to ensure
 * the context is running.
 */
export async function unlockAudioContext(): Promise<AudioContext> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx;
}

/**
 * React hook that resumes the AudioContext on the first user gesture for
 * the provided element. Useful for buttons or the app's root element.
 */
export function useAudioContextUnlock(ref: React.RefObject<HTMLElement>) {
  const unlocked = useRef(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || unlocked.current) return;
    const handler = async () => {
      unlocked.current = true;
      await unlockAudioContext();
    };
    element.addEventListener('click', handler, { once: true });
    element.addEventListener('touchstart', handler, { once: true });
    return () => {
      element.removeEventListener('click', handler);
      element.removeEventListener('touchstart', handler);
    };
  }, [ref]);
}
