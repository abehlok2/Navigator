import { describe, it, expect, vi } from 'vitest';

class FakeAudioNode {
  connect = vi.fn((node?: any) => node);
  disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  gain = { value: 1, setTargetAtTime: vi.fn() };
  channelCount = 2;
  channelCountMode = 'max';
  channelInterpretation = 'speakers';
}

class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 32;
  getFloatTimeDomainData = vi.fn((array: Float32Array) => {
    array.fill(0);
  });
}

class FakeSplitterNode extends FakeAudioNode {}

class FakeMediaStreamSource extends FakeAudioNode {}

class FakeMediaStreamDestination extends FakeAudioNode {
  stream = { id: 'dest-stream' } as any;
}

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  ondataavailable: ((e: any) => void) | null = null;
  onstop: ((ev?: Event) => void) | null = null;
  options: any;
  startArgs: any[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  constructor(_stream: any, opts?: any) {
    this.options = opts;
    FakeRecorder.instances.push(this);
  }
  start(...args: any[]) {
    this.startArgs = args;
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

describe('recorder consent', () => {
  it('aborts when consent denied', async () => {
    vi.resetModules();
    (global as any).MediaRecorder = FakeRecorder as any;
    const ctx = {
      createMediaStreamDestination: () => new FakeMediaStreamDestination(),
      createMediaStreamSource: () => new FakeMediaStreamSource(),
      createGain: () => new FakeGainNode(),
      createChannelSplitter: () => new FakeSplitterNode(),
      createAnalyser: () => new FakeAnalyserNode(),
    } as any;
    const ctxMod = await import('../context');
    vi.spyOn(ctxMod, 'getAudioContext').mockReturnValue(ctx as any);
    vi.spyOn(ctxMod, 'getMasterGain').mockReturnValue(new FakeGainNode() as any);
    const { startMixRecording } = await import('../recorder');
    const result = await startMixRecording({} as any, () => false);
    expect(result).toBeNull();
    expect(FakeRecorder.instances.length).toBe(0);
  });

  it('records when consent granted', async () => {
    vi.resetModules();
    FakeRecorder.instances = [];
    (global as any).MediaRecorder = FakeRecorder as any;
    const masterGain = new FakeGainNode();
    const ctx = {
      createMediaStreamDestination: () => new FakeMediaStreamDestination(),
      createMediaStreamSource: () => new FakeMediaStreamSource(),
      createGain: () => new FakeGainNode(),
      createChannelSplitter: () => new FakeSplitterNode(),
      createAnalyser: () => new FakeAnalyserNode(),
    } as any;
    const ctxMod = await import('../context');
    vi.spyOn(ctxMod, 'getAudioContext').mockReturnValue(ctx as any);
    vi.spyOn(ctxMod, 'getMasterGain').mockReturnValue(masterGain as any);
    const { startMixRecording } = await import('../recorder');
    const handle = await startMixRecording({} as any, () => true);
    expect(handle).not.toBeNull();
    const rec = FakeRecorder.instances[0];
    rec.ondataavailable?.({ data: new Blob(['a'], { type: 'audio/webm' }) });
    const levels = handle!.getLevels();
    expect(levels.left).toBeLessThanOrEqual(0);
    expect(levels.left).toBeGreaterThanOrEqual(-120);
    expect(levels.right).toBeLessThanOrEqual(0);
    expect(levels.right).toBeGreaterThanOrEqual(-120);
    expect(masterGain.connect).toHaveBeenCalled();
    const blob = await handle!.stop();
    expect(masterGain.disconnect).toHaveBeenCalled();
    expect(blob.size).toBeGreaterThan(0);
  });

  it('applies bitrate and latency options', async () => {
    vi.resetModules();
    FakeRecorder.instances = [];
    (global as any).MediaRecorder = FakeRecorder as any;
    const ctx = {
      createMediaStreamDestination: () => new FakeMediaStreamDestination(),
      createMediaStreamSource: () => new FakeMediaStreamSource(),
      createGain: () => new FakeGainNode(),
      createChannelSplitter: () => new FakeSplitterNode(),
      createAnalyser: () => new FakeAnalyserNode(),
    } as any;
    const ctxMod = await import('../context');
    vi.spyOn(ctxMod, 'getAudioContext').mockReturnValue(ctx as any);
    vi.spyOn(ctxMod, 'getMasterGain').mockReturnValue(new FakeGainNode() as any);
    const { startMixRecording } = await import('../recorder');
    const handle = await startMixRecording(
      {} as any,
      () => true,
      { bitrate: 32000, latencyMs: 500 }
    );
    expect(handle).not.toBeNull();
    const rec = FakeRecorder.instances[0];
    expect(rec.options).toEqual({ audioBitsPerSecond: 32000 });
    expect(rec.startArgs).toEqual([500]);
    await handle!.stop();
  });
});
