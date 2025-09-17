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

function ack(dc: FakeDataChannel, txn?: string) {
  if (!txn) return;
  dc.emit('message', {
    data: JSON.stringify({ type: 'ack', payload: { ok: true, forTxn: txn } }),
  });
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
      __esModule: true,
      playAt: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
      seek: vi.fn(),
      unload: vi.fn(),
      invalidate: vi.fn(),
      getPlayer: vi.fn(),
    }));
    vi.doMock('../../audio/context', () => ({ __esModule: true, getMasterGain: vi.fn(() => ({})) }));
    vi.doMock('../../audio/ducking', () => ({
      __esModule: true,
      setupSpeechDucking: vi.fn(),
      cleanupSpeechDucking: vi.fn(),
    }));
    vi.doMock('../../audio/speech', () => ({
      __esModule: true,
      setLocalSpeechFallback: vi.fn(),
      hasSpeechInput: vi.fn(() => false),
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
      __esModule: true,
      useSessionStore: {
        getState: () => storeState,
      },
    }));

    vi.doMock('../../audio/scheduler', () => ({
      __esModule: true,
      playAt: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
      seek: vi.fn(),
      unload: vi.fn(),
      invalidate: vi.fn(),
      getPlayer: vi.fn(),
    }));

    const setupSpeechDucking = vi.fn();
    const cleanupSpeechDucking = vi.fn();
    const setLocalSpeechFallback = vi.fn();
    const hasSpeechInput = vi.fn(() => true);

    vi.doMock('../../audio/context', () => ({ __esModule: true, getMasterGain: vi.fn(() => 'master-gain') }));
    vi.doMock('../../audio/ducking', () => ({
      __esModule: true,
      setupSpeechDucking,
      cleanupSpeechDucking,
    }));
    vi.doMock('../../audio/speech', () => ({
      __esModule: true,
      setLocalSpeechFallback,
      hasSpeechInput,
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
    expect(setLocalSpeechFallback).toHaveBeenCalledWith(micStream);

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

    expect(setupSpeechDucking).toHaveBeenCalledWith('master-gain', {
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

  it('crossfades without restarting an active source', async () => {
    const existingFrom = { isPlaying: vi.fn(() => true) };
    const toPlayer = {};
    const playAt = vi.fn<[string, unknown, number | undefined, number | undefined], typeof toPlayer>(
      () => toPlayer
    );
    const crossfade = vi.fn();
    const getPlayer = vi.fn(() => existingFrom as any);

    vi.doMock('../../audio/scheduler', () => ({
      __esModule: true,
      playAt,
      stop: vi.fn(),
      crossfade,
      setGain: vi.fn(),
      seek: vi.fn(),
      unload: vi.fn(),
      invalidate: vi.fn(),
      getPlayer,
    }));
    vi.doMock('../../audio/context', () => ({ __esModule: true, getMasterGain: vi.fn(() => ({})) }));
    vi.doMock('../../audio/ducking', () => ({
      __esModule: true,
      setupSpeechDucking: vi.fn(),
      cleanupSpeechDucking: vi.fn(),
    }));
    vi.doMock('../../audio/speech', () => ({
      __esModule: true,
      setLocalSpeechFallback: vi.fn(),
      hasSpeechInput: vi.fn(() => false),
    }));

    const { useSessionStore } = await import('../../../state/session');
    useSessionStore.setState({ peerClock: { now: () => 0 } as any });

    const { ControlChannel } = await import('../channel');

    const dc = new FakeDataChannel();
    new ControlChannel(dc as unknown as RTCDataChannel, {
      role: 'explorer',
      roomId: 'room',
      version: 'v1',
      onError: vi.fn(),
    });

    const payload = { fromId: 'a', toId: 'b', duration: 3, toOffset: 1.25 };
    dc.emit('message', {
      data: JSON.stringify({ type: 'cmd.crossfade', txn: 'txn-cross', payload }),
    });

    expect(getPlayer).toHaveBeenCalledWith('a');
    expect(existingFrom.isPlaying).toHaveBeenCalled();
    expect(playAt).toHaveBeenCalledTimes(1);
    const [idArg, clockArg, atArg, offsetArg] = playAt.mock.calls[0]!;
    expect(idArg).toBe('b');
    expect(clockArg).toBe(useSessionStore.getState().peerClock);
    expect(atArg).toBeUndefined();
    expect(offsetArg).toBe(1.25);
    expect(crossfade).toHaveBeenCalledWith(existingFrom, toPlayer, 3);
    const ack = JSON.parse(dc.send.mock.calls.at(-1)?.[0] as string);
    expect(ack.payload).toEqual({ ok: true, forTxn: 'txn-cross' });
  });

  it('loads assets on cmd.load and acknowledges success', async () => {
    const invalidate = vi.fn();
    const unload = vi.fn();
    const seek = vi.fn();
    const removeBuffer = vi.fn();
    const hasBuffer = vi.fn(() => true);

    vi.doMock('../../audio/scheduler', () => ({
      __esModule: true,
      playAt: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
      seek,
      unload,
      invalidate,
      getPlayer: vi.fn(),
    }));
    vi.doMock('../../audio/assets', () => ({ __esModule: true, hasBuffer, removeBuffer }));
    vi.doMock('../../audio/context', () => ({ __esModule: true, getMasterGain: vi.fn(() => ({})) }));
    vi.doMock('../../audio/ducking', () => ({
      __esModule: true,
      setupSpeechDucking: vi.fn(),
      cleanupSpeechDucking: vi.fn(),
    }));
    vi.doMock('../../audio/speech', () => ({
      __esModule: true,
      setLocalSpeechFallback: vi.fn(),
      hasSpeechInput: vi.fn(() => false),
    }));

    const { useSessionStore } = await import('../../../state/session');
    useSessionStore.setState({
      manifest: { tone: { id: 'tone', sha256: 'abc', bytes: 1024 } },
      assets: new Set(),
      assetProgress: {},
    });
    const state = useSessionStore.getState();
    const setAssetProgressSpy = vi.spyOn(state, 'setAssetProgress');

    const { ControlChannel } = await import('../channel');

    const dc = new FakeDataChannel();
    const errors: string[] = [];
    new ControlChannel(dc as unknown as RTCDataChannel, {
      role: 'explorer',
      roomId: 'room',
      version: 'v1',
      onError: err => errors.push(err),
    });

    dc.emit('message', {
      data: JSON.stringify({
        type: 'cmd.load',
        txn: 'txn-load',
        payload: { id: 'tone', bytes: 1024 },
      }),
    });

    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(errors).toHaveLength(0);
    const ack = JSON.parse(dc.send.mock.calls.at(-1)?.[0] as string);
    expect(ack.payload).toEqual({ ok: true, forTxn: 'txn-load' });
    const firstProgress = setAssetProgressSpy.mock.calls[0];
    const finalProgress = setAssetProgressSpy.mock.calls.at(-1);
    expect(firstProgress).toBeDefined();
    expect(finalProgress).toBeDefined();
    expect(firstProgress?.[1]).toBeGreaterThan(0);
    expect(finalProgress?.[1]).toBeGreaterThanOrEqual(finalProgress?.[2] ?? 0);
    const finalState = useSessionStore.getState();
    expect(finalState.assets.has('tone')).toBe(true);
    expect(finalState.assetProgress.tone?.loaded).toBeGreaterThan(0);
  });

  it('reports errors when cmd.load fails', async () => {
    const invalidate = vi.fn();
    const unload = vi.fn();
    const seek = vi.fn();
    const removeBuffer = vi.fn();
    const hasBuffer = vi.fn(() => false);

    vi.doMock('../../audio/scheduler', () => ({
      __esModule: true,
      playAt: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
      seek,
      unload,
      invalidate,
      getPlayer: vi.fn(),
    }));
    vi.doMock('../../audio/assets', () => ({ __esModule: true, hasBuffer, removeBuffer }));
    vi.doMock('../../audio/context', () => ({ __esModule: true, getMasterGain: vi.fn(() => ({})) }));
    vi.doMock('../../audio/ducking', () => ({
      __esModule: true,
      setupSpeechDucking: vi.fn(),
      cleanupSpeechDucking: vi.fn(),
    }));
    vi.doMock('../../audio/speech', () => ({
      __esModule: true,
      setLocalSpeechFallback: vi.fn(),
      hasSpeechInput: vi.fn(() => false),
    }));

    const { useSessionStore } = await import('../../../state/session');
    useSessionStore.setState({
      manifest: { tone: { id: 'tone', sha256: 'abc', bytes: 1024 } },
      assets: new Set(),
      assetProgress: {},
    });
    const state = useSessionStore.getState();
    const setAssetProgressSpy = vi.spyOn(state, 'setAssetProgress');

    const { ControlChannel } = await import('../channel');

    const dc = new FakeDataChannel();
    const errors: string[] = [];
    new ControlChannel(dc as unknown as RTCDataChannel, {
      role: 'explorer',
      roomId: 'room',
      version: 'v1',
      onError: err => errors.push(err),
    });

    dc.emit('message', {
      data: JSON.stringify({
        type: 'cmd.load',
        txn: 'txn-load',
        payload: { id: 'tone', bytes: 1024 },
      }),
    });

    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(errors).toContain(
      'Asset is not available locally. Provide facilitator-supplied files before issuing load commands.',
    );
    const ack = JSON.parse(dc.send.mock.calls.at(-1)?.[0] as string);
    expect(ack.payload).toEqual({
      ok: false,
      forTxn: 'txn-load',
      error: 'Asset is not available locally. Provide facilitator-supplied files before issuing load commands.',
    });
    const finalProgress = setAssetProgressSpy.mock.calls.at(-1);
    expect(finalProgress?.[1]).toBe(0);
    const finalState = useSessionStore.getState();
    expect(finalState.assets.has('tone')).toBe(false);
    expect(finalState.assetProgress.tone?.loaded ?? 0).toBe(0);
  });

  it('handles cmd.unload by removing local assets', async () => {
    const invalidate = vi.fn();
    const unload = vi.fn();
    const seek = vi.fn();
    const removeBuffer = vi.fn();
    const hasBuffer = vi.fn(() => true);

    vi.doMock('../../audio/scheduler', () => ({
      __esModule: true,
      playAt: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
      seek,
      unload,
      invalidate,
      getPlayer: vi.fn(),
    }));
    vi.doMock('../../audio/assets', () => ({ __esModule: true, hasBuffer, removeBuffer }));
    vi.doMock('../../audio/context', () => ({ __esModule: true, getMasterGain: vi.fn(() => ({})) }));
    vi.doMock('../../audio/ducking', () => ({
      __esModule: true,
      setupSpeechDucking: vi.fn(),
      cleanupSpeechDucking: vi.fn(),
    }));
    vi.doMock('../../audio/speech', () => ({
      __esModule: true,
      setLocalSpeechFallback: vi.fn(),
      hasSpeechInput: vi.fn(() => false),
    }));

    const { useSessionStore } = await import('../../../state/session');
    useSessionStore.setState({
      manifest: { tone: { id: 'tone', sha256: 'abc', bytes: 1024 } },
      assets: new Set(['tone']),
      assetProgress: { tone: { loaded: 1024, total: 1024 } },
    });
    const state = useSessionStore.getState();
    const removeAssetSpy = vi.spyOn(state, 'removeAsset');

    const { ControlChannel } = await import('../channel');

    const dc = new FakeDataChannel();
    new ControlChannel(dc as unknown as RTCDataChannel, {
      role: 'explorer',
      roomId: 'room',
      version: 'v1',
      onError: vi.fn(),
    });

    dc.emit('message', {
      data: JSON.stringify({ type: 'cmd.unload', txn: 'txn-unload', payload: { id: 'tone' } }),
    });

    expect(unload).toHaveBeenCalledWith('tone');
    expect(removeBuffer).toHaveBeenCalledWith('tone');
    expect(removeAssetSpy).toHaveBeenCalledWith('tone', { broadcast: true });
    const ack = JSON.parse(dc.send.mock.calls.at(-1)?.[0] as string);
    expect(ack.payload).toEqual({ ok: true, forTxn: 'txn-unload' });
  });

  it('seeks playback when cmd.seek is received', async () => {
    const seek = vi.fn();

    vi.doMock('../../audio/scheduler', () => ({
      __esModule: true,
      playAt: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
      seek,
      unload: vi.fn(),
      invalidate: vi.fn(),
      getPlayer: vi.fn(),
    }));
    vi.doMock('../../audio/assets', () => ({
      __esModule: true,
      hasBuffer: vi.fn(() => true),
      removeBuffer: vi.fn(),
    }));
    vi.doMock('../../audio/context', () => ({ __esModule: true, getMasterGain: vi.fn(() => ({})) }));
    vi.doMock('../../audio/ducking', () => ({
      __esModule: true,
      setupSpeechDucking: vi.fn(),
      cleanupSpeechDucking: vi.fn(),
    }));

    const { ControlChannel } = await import('../channel');

    const dc = new FakeDataChannel();
    new ControlChannel(dc as unknown as RTCDataChannel, {
      role: 'explorer',
      roomId: 'room',
      version: 'v1',
      onError: vi.fn(),
    });

    dc.emit('message', {
      data: JSON.stringify({ type: 'cmd.seek', txn: 'txn-seek', payload: { id: 'tone', offset: 1.5 } }),
    });

    expect(seek).toHaveBeenCalledWith('tone', 1.5);
    const ack = JSON.parse(dc.send.mock.calls.at(-1)?.[0] as string);
    expect(ack.payload).toEqual({ ok: true, forTxn: 'txn-seek' });
  });

  it('resends cached manifest when data channel reopens', async () => {
    vi.doMock('../../audio/scheduler', () => ({
      __esModule: true,
      playAt: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
      seek: vi.fn(),
      unload: vi.fn(),
      invalidate: vi.fn(),
      getPlayer: vi.fn(),
    }));
    vi.doMock('../../audio/context', () => ({ __esModule: true, getMasterGain: vi.fn(() => ({})) }));
    vi.doMock('../../audio/ducking', () => ({
      __esModule: true,
      setupSpeechDucking: vi.fn(),
      cleanupSpeechDucking: vi.fn(),
    }));
    vi.doMock('../../audio/speech', () => ({
      __esModule: true,
      setLocalSpeechFallback: vi.fn(),
      hasSpeechInput: vi.fn(() => false),
    }));

    const { ControlChannel } = await import('../channel');

    const dc = new FakeDataChannel();
    const errors: string[] = [];
    const channel = new ControlChannel(dc as unknown as RTCDataChannel, {
      role: 'facilitator',
      roomId: 'room-1',
      version: 'v1',
      onError: err => errors.push(err),
    });

    dc.emit('open', {});
    const firstHello = JSON.parse(dc.send.mock.calls.at(-1)?.[0] as string);
    expect(firstHello.type).toBe('hello');
    expect(firstHello.txn).toBeDefined();
    ack(dc, firstHello.txn);

    const entries = [{ id: 'tone', sha256: 'abc', bytes: 1024 }];
    const manifestPromise = channel.setManifest(entries);
    const firstManifest = JSON.parse(dc.send.mock.calls.at(-1)?.[0] as string);
    expect(firstManifest.type).toBe('asset.manifest');
    expect(firstManifest.payload).toEqual({ entries });
    ack(dc, firstManifest.txn);
    await manifestPromise;

    expect(errors).toHaveLength(0);

    dc.send.mockClear();
    dc.emit('open', {});
    const secondHello = JSON.parse(dc.send.mock.calls.at(0)?.[0] as string);
    expect(secondHello.type).toBe('hello');
    expect(secondHello.txn).toBeDefined();
    ack(dc, secondHello.txn);
    await Promise.resolve();

    expect(dc.send).toHaveBeenCalledTimes(2);
    const resentManifest = JSON.parse(dc.send.mock.calls.at(-1)?.[0] as string);
    expect(resentManifest.type).toBe('asset.manifest');
    expect(resentManifest.payload).toEqual({ entries });
    ack(dc, resentManifest.txn);

    expect(errors).toHaveLength(0);
  });
});
