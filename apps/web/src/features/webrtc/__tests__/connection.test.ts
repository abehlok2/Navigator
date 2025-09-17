import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SIGNAL_URL } from '../../../config';

class FakeRTCDataChannel {
  public send = vi.fn<[string], void>();
  private listeners = new Map<string, Array<(...args: any[]) => void>>();

  addEventListener(event: string, handler: (...args: any[]) => void) {
    const items = this.listeners.get(event) ?? [];
    items.push(handler);
    this.listeners.set(event, items);
  }

  emit(event: string, ...args: any[]) {
    for (const handler of this.listeners.get(event) ?? []) {
      handler(...args);
    }
  }
}

class FakeRTCPeerConnection {
  public onicecandidate: ((ev: unknown) => void) | null = null;
  public ontrack: ((ev: unknown) => void) | null = null;
  public ondatachannel: ((ev: { channel: FakeRTCDataChannel }) => void) | null = null;
  public localDescription: unknown = null;
  public connectionState: string = 'new';
  private listeners = new Map<string, Array<(...args: any[]) => void>>();
  public readonly dataChannel = new FakeRTCDataChannel();
  public addTrack = vi.fn();
  public addIceCandidate = vi.fn(async () => {});
  public createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' }));
  public createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'answer-sdp' }));
  public setLocalDescription = vi.fn(async (desc: unknown) => {
    this.localDescription = desc;
  });
  public setRemoteDescription = vi.fn(async () => {});
  public setConfiguration = vi.fn((config: unknown) => {
    this.config = config;
  });
  public close = vi.fn();
  public config: unknown;

  constructor(config: unknown) {
    this.config = config;
    peerInstances.push(this);
  }

  createDataChannel() {
    return this.dataChannel;
  }

  addEventListener(event: string, handler: (...args: any[]) => void) {
    const items = this.listeners.get(event) ?? [];
    items.push(handler);
    this.listeners.set(event, items);
  }

  emit(event: string, ...args: any[]) {
    for (const handler of this.listeners.get(event) ?? []) {
      handler(...args);
    }
  }
}

class FakeWebSocket {
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public sent: string[] = [];
  private listeners = new Map<string, Array<(...args: any[]) => void>>();
  public readyState = 1;
  public close = vi.fn(() => {
    this.readyState = 3;
    this.emit('close');
  });

  constructor(public url: string, public protocol?: string) {
    websocketInstances.push(this);
  }

  addEventListener(event: string, handler: (...args: any[]) => void) {
    const items = this.listeners.get(event) ?? [];
    items.push(handler);
    this.listeners.set(event, items);
  }

  send(data: string) {
    this.sent.push(data);
  }

  emit(event: string, ...args: any[]) {
    if (event === 'message' && this.onmessage) {
      this.onmessage(args[0] as { data: string });
    }
    for (const handler of this.listeners.get(event) ?? []) {
      handler(...args);
    }
  }
}

const peerInstances: FakeRTCPeerConnection[] = [];
const websocketInstances: FakeWebSocket[] = [];

beforeEach(() => {
  vi.resetModules();
  peerInstances.length = 0;
  websocketInstances.length = 0;
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connectWithReconnection', () => {
  it('authenticates with token and applies TURN configuration', async () => {
    const sessionState = {
      manifest: {},
      assets: new Set<string>(),
      setRole: vi.fn(),
      setConnection: vi.fn(),
      setControl: vi.fn(),
      setPeerClock: vi.fn(),
      setTelemetry: vi.fn(),
      setHeartbeat: vi.fn(),
      setMicStream: vi.fn(),
      resetRemotePresence: vi.fn(),
    };

    vi.doMock('../../state/session', () => ({
      useSessionStore: {
        getState: () => sessionState,
      },
    }));

    const controlCtor = vi.fn().mockImplementation(() => ({
      send: vi.fn(),
      setMicStream: vi.fn(),
      ducking: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
    }));

    vi.doMock('../control/channel', () => ({ ControlChannel: controlCtor }));
    vi.doMock('../audio/telemetry', () => ({ startTelemetry: vi.fn(() => vi.fn()) }));
    vi.doMock('../audio/peerClock', () => ({ PeerClock: vi.fn(function (this: any) { this.stop = vi.fn(); }) }));
    vi.doMock('../audio/scheduler', () => ({ watchClock: vi.fn() }));

    vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection as unknown as typeof RTCPeerConnection);
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);

    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    (globalThis as any).navigator = { mediaDevices: { getUserMedia } };

    const { connectWithReconnection } = await import('../connection');

    const stop = connectWithReconnection({
      roomId: 'room1',
      participantId: 'p1',
      targetId: 'p2',
      token: 'secret-token',
      turn: [{ urls: ['stun:example.org'] }],
      role: 'facilitator',
      targetRole: 'explorer',
      version: '1.0.0',
      onTrack: vi.fn(),
    });

    await Promise.resolve();

    expect(websocketInstances).toHaveLength(1);
    expect(websocketInstances[0].url).toBe(
      `${SIGNAL_URL}?roomId=room1&participantId=p1`
    );
    expect(websocketInstances[0].protocol).toBe('secret-token');

    expect(peerInstances).toHaveLength(1);
    expect(peerInstances[0].config).toEqual({ iceServers: [{ urls: ['stun:example.org'] }] });

    stop();
    expect(websocketInstances[0].close).toHaveBeenCalled();
  });

  it('refreshes ICE servers when credentials message is received', async () => {
    const sessionState = {
      manifest: {},
      assets: new Set<string>(),
      setRole: vi.fn(),
      setConnection: vi.fn(),
      setControl: vi.fn(),
      setPeerClock: vi.fn(),
      setTelemetry: vi.fn(),
      setHeartbeat: vi.fn(),
      setMicStream: vi.fn(),
      resetRemotePresence: vi.fn(),
    };

    vi.doMock('../../state/session', () => ({
      useSessionStore: {
        getState: () => sessionState,
      },
    }));

    const controlCtor = vi.fn().mockImplementation(() => ({
      send: vi.fn(),
      setMicStream: vi.fn(),
      ducking: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      crossfade: vi.fn(),
      setGain: vi.fn(),
    }));

    vi.doMock('../control/channel', () => ({ ControlChannel: controlCtor }));
    vi.doMock('../audio/telemetry', () => ({ startTelemetry: vi.fn(() => vi.fn()) }));
    vi.doMock('../audio/peerClock', () => ({ PeerClock: vi.fn(function (this: any) { this.stop = vi.fn(); }) }));
    vi.doMock('../audio/scheduler', () => ({ watchClock: vi.fn() }));

    vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection as unknown as typeof RTCPeerConnection);
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);

    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    (globalThis as any).navigator = { mediaDevices: { getUserMedia } };

    const { connect } = await import('../connection');

    const { pc } = await connect({
      roomId: 'room1',
      participantId: 'p1',
      targetId: 'p2',
      token: 'secret-token',
      turn: [{ urls: ['stun:initial.example.org'] }],
      role: 'listener',
      targetRole: 'facilitator',
      version: '1.0.0',
      onTrack: vi.fn(),
    });

    expect(peerInstances).toHaveLength(1);
    expect(websocketInstances).toHaveLength(1);

    const peer = peerInstances[0];
    const ws = websocketInstances[0];

    expect(typeof ws.onmessage).toBe('function');

    await ws.onmessage?.({
      data: JSON.stringify({
        type: 'credentials',
        payload: {
          urls: ['turn:relay.example.org?transport=udp'],
          username: 'relay-user',
          credential: 'relay-pass',
        },
      }),
    } as any);

    expect(peer.setConfiguration).toHaveBeenCalledWith({
      iceServers: [
        {
          urls: ['turn:relay.example.org?transport=udp'],
          username: 'relay-user',
          credential: 'relay-pass',
        },
      ],
    });
    expect(peer.config).toEqual({
      iceServers: [
        {
          urls: ['turn:relay.example.org?transport=udp'],
          username: 'relay-user',
          credential: 'relay-pass',
        },
      ],
    });

    pc.close();
  });

  it('propagates remote track events to the provided handler', async () => {
    const sessionState = {
      manifest: {},
      assets: new Set<string>(),
      setRole: vi.fn(),
      setConnection: vi.fn(),
      setControl: vi.fn(),
      setPeerClock: vi.fn(),
      setTelemetry: vi.fn(),
      setHeartbeat: vi.fn(),
      setMicStream: vi.fn(),
      resetRemotePresence: vi.fn(),
    };

    vi.doMock('../../state/session', () => ({
      useSessionStore: {
        getState: () => sessionState,
      },
    }));

    vi.doMock('../control/channel', () => ({
      ControlChannel: vi.fn().mockImplementation(() => ({
        send: vi.fn(),
        setMicStream: vi.fn(),
        ducking: vi.fn(),
        play: vi.fn(),
        stop: vi.fn(),
        crossfade: vi.fn(),
        setGain: vi.fn(),
      })),
    }));
    vi.doMock('../audio/telemetry', () => ({ startTelemetry: vi.fn(() => vi.fn()) }));
    vi.doMock('../audio/peerClock', () => ({ PeerClock: vi.fn(function (this: any) { this.stop = vi.fn(); }) }));
    vi.doMock('../audio/scheduler', () => ({ watchClock: vi.fn() }));

    vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection as unknown as typeof RTCPeerConnection);
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);

    const { connectWithReconnection } = await import('../connection');

    const trackHandler = vi.fn();

    const stop = connectWithReconnection({
      roomId: 'room2',
      participantId: 'listener',
      targetId: 'peer',
      token: 'listener-token',
      turn: [],
      role: 'listener',
      targetRole: 'facilitator',
      version: '1.0.0',
      onTrack: trackHandler,
    });

    await Promise.resolve();

    expect(peerInstances).toHaveLength(1);
    const peer = peerInstances[0];
    expect(peer.ontrack).toBe(trackHandler);

    const event = { streams: [] };
    peer.ontrack?.(event);
    expect(trackHandler).toHaveBeenCalledWith(event);

    stop();
  });
});
