import { describe, it, expect, vi } from 'vitest';

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    FakeRecorder.instances.push(this);
  }
  start() {}
  stop() { this.onstop?.(); }
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
});
