import { getAudioContext, getMasterGain } from './context';

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export class BinauralGenerator {
  private ctx = getAudioContext();
  private gain = this.ctx.createGain();
  private left?: OscillatorNode;
  private right?: OscillatorNode;

  constructor() {
    this.gain.connect(getMasterGain());
  }

  start(baseFreq = 220, beatFreq = 4) {
    this.stop();
    this.left = this.ctx.createOscillator();
    this.right = this.ctx.createOscillator();
    this.left.frequency.value = baseFreq - beatFreq / 2;
    this.right.frequency.value = baseFreq + beatFreq / 2;
    const merger = this.ctx.createChannelMerger(2);
    this.left.connect(merger, 0, 0);
    this.right.connect(merger, 0, 1);
    merger.connect(this.gain);
    this.left.start();
    this.right.start();
  }

  stop() {
    this.left?.stop();
    this.right?.stop();
    this.left = undefined;
    this.right = undefined;
  }

  setGain(db: number) {
    this.gain.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.01);
  }

  connect(node: AudioNode) {
    this.gain.disconnect();
    this.gain.connect(node);
  }
}

export class NoiseGenerator {
  private ctx = getAudioContext();
  private gain = this.ctx.createGain();
  private buffer: AudioBuffer;
  private source?: AudioBufferSourceNode;

  constructor(type: 'white' | 'pink' | 'brown' = 'white') {
    this.buffer = createNoiseBuffer(this.ctx, type);
    this.gain.connect(getMasterGain());
  }

  start() {
    this.stop();
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this.source.connect(this.gain);
    this.source.start();
  }

  stop() {
    this.source?.stop();
    this.source = undefined;
  }

  setGain(db: number) {
    this.gain.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.01);
  }

  connect(node: AudioNode) {
    this.gain.disconnect();
    this.gain.connect(node);
  }
}

function createNoiseBuffer(ctx: AudioContext, type: 'white' | 'pink' | 'brown'): AudioBuffer {
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (type === 'white') {
      data[i] = white;
    } else if (type === 'pink') {
      lastOut = 0.98 * lastOut + 0.02 * white;
      data[i] = lastOut * 3.5;
    } else {
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 5;
    }
  }
  return buffer;
}
