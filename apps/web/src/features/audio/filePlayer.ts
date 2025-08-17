import { getAudioContext } from './context';

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export class FilePlayer {
  private ctx: AudioContext;
  private buffer: AudioBuffer;
  private gainNode: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private offset = 0;

  constructor(buffer: AudioBuffer) {
    this.ctx = getAudioContext();
    this.buffer = buffer;
    this.gainNode = this.ctx.createGain();
    this.gainNode.connect(this.ctx.destination);
  }

  start(when = 0, offset = 0) {
    this.stop();
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.gainNode);
    this.source.start(this.ctx.currentTime + when, offset);
    this.offset = offset;
  }

  stop(when = 0) {
    if (this.source) {
      this.source.stop(this.ctx.currentTime + when);
      this.source.disconnect();
      this.source = null;
    }
  }

  seek(offset: number) {
    if (this.source) {
      this.start(0, offset);
    } else {
      this.offset = offset;
    }
  }

  setGain(db: number) {
    this.gainNode.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.01);
  }

  getGainNode() {
    return this.gainNode;
  }
}

/**
 * Performs an equal-power crossfade between two FilePlayers.
 */
export function crossfade(a: FilePlayer, b: FilePlayer, duration: number) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const ga = a.getGainNode().gain;
  const gb = b.getGainNode().gain;
  ga.setValueAtTime(1, now);
  gb.setValueAtTime(0, now);
  ga.linearRampToValueAtTime(0, now + duration);
  gb.linearRampToValueAtTime(1, now + duration);
}
