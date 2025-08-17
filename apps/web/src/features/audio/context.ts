import { useEffect, useRef } from 'react';

let shared: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!shared) {
    shared = new AudioContext();
  }
  return shared;
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
