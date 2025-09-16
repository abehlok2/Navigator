import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class FakeDataChannel {
  public send = vi.fn<[string], void>();
  private listeners = new Map<string, Array<(ev: any) => void>>();

  addEventListener(event: string, handler: (ev: any) => void) {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  emit(event: string, ev: any) {
    for (const handler of this.listeners.get(event) ?? []) {
      handler(ev);
    }
  }
}

describe('ControlChannel message handling', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('acknowledges telemetry updates and stores levels', async () => {
    vi.doMock('../../audio/scheduler', () => ({
      playAt: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
    }));
    vi.doMock('../../audio/context', () => ({ getMasterGain: vi.fn(() => ({})) }));
    vi.doMock('../../audio/ducking', () => ({
      setupSpeechDucking: vi.fn(),
      cleanupSpeechDucking: vi.fn(),
    }));

    const { useSessionStore } = await import('../../../state/session');
    useSessionStore.setState({ telemetry: null, lastHeartbeat: null });
    const state = useSessionStore.getState();
    const telemetrySpy = vi.spyOn(state, 'setTelemetry');
    const heartbeatSpy = vi.spyOn(state, 'setHeartbeat');

    const { ControlChannel } = await import('../channel');

    const dc = new FakeDataChannel();
    const channel = new ControlChannel(dc as unknown as RTCDataChannel, {
      role: 'explorer',
      roomId: 'room',
      version: 'v1',
      onError: vi.fn(),
    });
    expect(channel).toBeTruthy();

    const payload = { mic: -12.5, program: -6.2 };
    dc.emit('message', {
      data: JSON.stringify({ type: 'telemetry.levels', txn: 'txn-1', payload }),
    });

    const ack = JSON.parse(dc.send.mock.calls[0][0] as string);
    expect(dc.send).toHaveBeenCalledTimes(1);
    expect(telemetrySpy).toHaveBeenCalledWith(payload);
    expect(heartbeatSpy).toHaveBeenCalled();
    expect(ack.type).toBe('ack');
    expect(ack.payload).toEqual({ ok: true, forTxn: 'txn-1' });
    expect(typeof ack.sentAt).toBe('number');
  });

  it('applies and clears ducking configuration based on cmd.ducking', async () => {
    const storeState = {
      setTelemetry: vi.fn(),
      setHeartbeat: vi.fn(),
      setManifest: vi.fn(),
      updateRemotePresence: vi.fn(),
      control: null,
      peerClock: null,
    };

    vi.doMock('../../state/session', () => ({
      useSessionStore: {
        getState: () => storeState,
      },
    }));

    vi.doMock('../../audio/scheduler', () => ({
      playAt: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
    }));

    const setupSpeechDucking = vi.fn();
    const cleanupSpeechDucking = vi.fn();

    vi.doMock('../../audio/context', () => ({ getMasterGain: vi.fn(() => 'master-gain') }));
    vi.doMock('../../audio/ducking', () => ({
      setupSpeechDucking,
      cleanupSpeechDucking,
    }));

    const { ControlChannel } = await import('../channel');

    const dc = new FakeDataChannel();
    const errors: string[] = [];
    const channel = new ControlChannel(dc as unknown as RTCDataChannel, {
      role: 'explorer',
      roomId: 'room',
      version: 'v1',
      onError: err => errors.push(err),
    });

    const micStream = { id: 'mic' } as unknown as MediaStream;
    channel.setMicStream(micStream);

    const enableMessage = {
      data: JSON.stringify({
        type: 'cmd.ducking',
        txn: 'txn-enable',
        payload: {
          enabled: true,
          thresholdDb: -42,
          reduceDb: -9,
          attackMs: 20,
          releaseMs: 400,
        },
      }),
    };

    dc.send.mockClear();
    dc.emit('message', enableMessage);

    expect(setupSpeechDucking).toHaveBeenCalledWith(micStream, 'master-gain', {
      thresholdDb: -42,
      reducedDb: -9,
      attack: 0.02,
      release: 0.4,
    });
    expect(errors).toHaveLength(0);
    expect(dc.send).toHaveBeenCalled();

    const disableMessage = {
      data: JSON.stringify({
        type: 'cmd.ducking',
        txn: 'txn-disable',
        payload: {
          enabled: false,
          thresholdDb: -42,
          reduceDb: -9,
          attackMs: 20,
          releaseMs: 400,
        },
      }),
    };

    dc.send.mockClear();
    dc.emit('message', disableMessage);

    expect(cleanupSpeechDucking).toHaveBeenCalled();
    expect(dc.send).toHaveBeenCalled();
  });
});
