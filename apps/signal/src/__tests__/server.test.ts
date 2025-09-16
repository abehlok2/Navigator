import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type StoredRoom = {
  id: string;
  password?: string;
  participants: { id: string; role: string }[];
};

class FakeWebSocket {
  public send = vi.fn<(data: string) => void>();
  public close = vi.fn();
  private listeners = new Map<string, Array<(data: unknown) => void>>();

  on(event: string, handler: (data: unknown) => void) {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
    return this;
  }

  emit(event: string, data: unknown) {
    for (const handler of this.listeners.get(event) ?? []) {
      handler(data);
    }
  }
}

let roomStore: Record<string, StoredRoom> = {};
const authenticateMock = vi.fn();
const cleanupTokensMock = vi.fn();
const connectionHandlers: Array<(ws: FakeWebSocket, req: any) => void> = [];

vi.mock('express', () => {
  const app = {
    use: vi.fn(),
    post: vi.fn(),
  };
  const express = () => app;
  (express as any).json = () => () => undefined;
  return { __esModule: true, default: express };
});

vi.mock('express-rate-limit', () => ({
  __esModule: true,
  default: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('http', () => ({
  __esModule: true,
  createServer: vi.fn(() => ({
    listen: (_port: number, cb?: () => void) => {
      cb?.();
      return undefined;
    },
  })),
}));

vi.mock('ws', () => ({
  __esModule: true,
  WebSocketServer: class {
    constructor(_opts: unknown) {}
    on(event: string, handler: (ws: FakeWebSocket, req: any) => void) {
      if (event === 'connection') {
        connectionHandlers.push(handler);
      }
    }
  },
}));

vi.mock('../auth.js', () => ({
  authenticate: authenticateMock,
  login: vi.fn(),
  register: vi.fn(),
  revokeToken: vi.fn(),
  cleanupExpiredTokens: cleanupTokensMock,
}));

vi.mock('../storage.js', () => ({
  loadRooms: async () => roomStore,
  saveRooms: async (rooms: Record<string, StoredRoom>) => {
    roomStore = rooms;
  },
  loadUsers: async () => ({}),
  saveUsers: async () => {},
}));

describe('signal server websocket forwarding', () => {
  let createRoom: typeof import('../rooms.ts').createRoom;
  let addParticipant: typeof import('../rooms.ts').addParticipant;

  beforeEach(async () => {
    vi.resetModules();
    roomStore = {};
    connectionHandlers.length = 0;
    authenticateMock.mockReset();
    vi.useFakeTimers();
    await import('../server.ts');
    const rooms = await import('../rooms.ts');
    createRoom = rooms.createRoom;
    addParticipant = rooms.addParticipant;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('forwards control messages between participants', () => {
    const handler = connectionHandlers.at(-1);
    expect(handler).toBeTruthy();
    if (!handler) return;

    const room = createRoom('room-forward');
    const sender = addParticipant(room.id, 'facilitator');
    const receiver = addParticipant(room.id, 'explorer');

    const tokenMap = new Map<string, { username: string; role: string }>([
      ['token-sender', { username: 'sender', role: 'facilitator' }],
      ['token-receiver', { username: 'receiver', role: 'explorer' }],
    ]);
    authenticateMock.mockImplementation(token => tokenMap.get(token) ?? null);

    const connect = (participantId: string, token: string) => {
      const ws = new FakeWebSocket();
      const req = {
        url: `/ws?roomId=${room.id}&participantId=${participantId}`,
        headers: { 'sec-websocket-protocol': token },
      } as any;
      handler(ws, req);
      return ws;
    };

    const receiverSocket = connect(receiver.id, 'token-receiver');
    const senderSocket = connect(sender.id, 'token-sender');

    const messages = [
      {
        type: 'asset.manifest' as const,
        payload: { entries: [{ id: 'asset1', sha256: 'abc', bytes: 512 }] },
      },
      {
        type: 'telemetry.levels' as const,
        payload: { mic: -12.3, program: -6.1 },
      },
      {
        type: 'cmd.ducking' as const,
        payload: { enabled: true, thresholdDb: -40, reduceDb: -12, attackMs: 25, releaseMs: 200 },
      },
    ];

    for (const msg of messages) {
      receiverSocket.send.mockClear();
      const wire = {
        type: msg.type,
        roomId: room.id,
        target: receiver.id,
        payload: msg.payload,
      };
      senderSocket.emit('message', Buffer.from(JSON.stringify(wire)));
      expect(receiverSocket.send).toHaveBeenCalledTimes(1);
      const forwarded = JSON.parse(receiverSocket.send.mock.calls[0][0] as string);
      expect(forwarded).toEqual({ ...wire, from: sender.id });
    }
  });
});
