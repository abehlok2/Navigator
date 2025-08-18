import { describe, it, expect, vi } from 'vitest';

class FakeClock {
  private nowVal = 0;
  private offset = 0;
  private listeners: Array<(o: number) => void> = [];
  now() {
    return this.nowVal;
  }
  setNow(n: number) {
    this.nowVal = n;
  }
  getOffset() {
    return this.offset;
  }
  onUpdate(cb: (o: number) => void) {
    this.listeners.push(cb);
    return () => (this.listeners = this.listeners.filter(l => l !== cb));
  }
  trigger(offset: number) {
    this.offset = offset;
    this.listeners.forEach(l => l(offset));
  }
}

describe('scheduler', () => {
  it('schedules playback at peer time', async () => {
    vi.resetModules();
    const startFn = vi.fn();
    const ctx = { currentTime: 0 } as any;
    vi.doMock('../context', () => ({ getAudioContext: () => ctx }));
    vi.doMock('../assets', () => ({ getBuffer: () => ({}) }));
    vi.doMock('../filePlayer', () => ({
      FilePlayer: class {
        start(when: number, offset: number) { startFn(when, offset); }
        setGain() {}
        isPlaying() { return false; }
        getPosition() { return 0; }
        seek() {}
      },
      crossfade: vi.fn(),
    }));
    const { playAt } = await import('../scheduler');
    const clock = new FakeClock();
    clock.setNow(1000);
    playAt('a', clock as any, 1500);
    expect(startFn).toHaveBeenCalled();
    const args = (startFn as any).mock.calls[0];
    expect(args[0]).toBeCloseTo(0.5);
  });

  it('resyncs on clock drift', async () => {
    vi.resetModules();
    const seek = vi.fn();
    const ctx: any = { currentTime: 0 };
    vi.doMock('../context', () => ({ getAudioContext: () => ctx }));
    vi.doMock('../assets', () => ({ getBuffer: () => ({}) }));
    vi.doMock('../filePlayer', () => ({
      FilePlayer: class {
        private playing = false;
        private pos = 0;
        start() { this.playing = true; this.pos = 0; }
        setGain() {}
        isPlaying() { return this.playing; }
        getPosition() { return this.pos; }
        seek(p: number) { seek(p); this.pos = p; }
      },
      crossfade: vi.fn(),
    }));
    const { playAt, watchClock } = await import('../scheduler');
    const clock = new FakeClock();
    clock.setNow(0);
    playAt('a', clock as any, 0);
    watchClock(clock as any, 10);
    ctx.currentTime = 1;
    clock.trigger(50);
    expect(seek).toHaveBeenCalled();
  });
});
