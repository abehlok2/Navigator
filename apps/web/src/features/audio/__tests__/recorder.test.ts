import { describe, it, expect, vi } from 'vitest';

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  options: any;
  startArgs: any[] = [];
  constructor(_stream: any, opts?: any) {
    this.options = opts;
    FakeRecorder.instances.push(this);
  }
  start(...args: any[]) {
    this.startArgs = args;
  }
  stop() {
    this.onstop?.();
  }
}

describe('recorder consent', () => {
  it('aborts when consent denied', async () => {
    vi.resetModules();
    (global as any).MediaRecorder = FakeRecorder as any;
    const ctx = {
      createMediaStreamDestination: () => ({ stream: {} }),
      createMediaStreamSource: () => ({ connect: () => {} }),
    } as any;
    const ctxMod = await import('../context');
    vi.spyOn(ctxMod, 'getAudioContext').mockReturnValue(ctx as any);
    const { startMixRecording } = await import('../recorder');
    const result = await startMixRecording({} as any, {} as any, () => false, vi.fn());
    expect(result).toBeNull();
    expect(FakeRecorder.instances.length).toBe(0);
  });

  it('records when consent granted', async () => {
    vi.resetModules();
    FakeRecorder.instances = [];
    (global as any).MediaRecorder = FakeRecorder as any;
    const ctx = {
      createMediaStreamDestination: () => ({ stream: {} }),
      createMediaStreamSource: () => ({ connect: () => {} }),
    } as any;
    const ctxMod = await import('../context');
    vi.spyOn(ctxMod, 'getAudioContext').mockReturnValue(ctx as any);
    const onData = vi.fn();
    const { startMixRecording } = await import('../recorder');
    const handle = await startMixRecording({} as any, {} as any, () => true, onData);
    expect(handle).not.toBeNull();
    const rec = FakeRecorder.instances[0];
    rec.ondataavailable?.({ data: new Blob(['a']) });
    expect(onData).toHaveBeenCalled();
    await handle!.stop();
  });

  it('applies bitrate and latency options', async () => {
    vi.resetModules();
    FakeRecorder.instances = [];
    (global as any).MediaRecorder = FakeRecorder as any;
    const ctx = {
      createMediaStreamDestination: () => ({ stream: {} }),
      createMediaStreamSource: () => ({ connect: () => {} }),
    } as any;
    const ctxMod = await import('../context');
    vi.spyOn(ctxMod, 'getAudioContext').mockReturnValue(ctx as any);
    const { startMixRecording } = await import('../recorder');
    const handle = await startMixRecording(
      {} as any,
      {} as any,
      () => true,
      vi.fn(),
      { bitrate: 32000, latencyMs: 500 }
    );
    expect(handle).not.toBeNull();
    const rec = FakeRecorder.instances[0];
    expect(rec.options).toEqual({ audioBitsPerSecond: 32000 });
    expect(rec.startArgs).toEqual([500]);
    await handle!.stop();
  });
});
