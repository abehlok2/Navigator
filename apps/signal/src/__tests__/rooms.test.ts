import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StoredRoom } from '../storage.js';

let roomStore: Record<string, StoredRoom> = {};

vi.mock('../storage.js', () => ({
  loadRooms: async () => roomStore,
  saveRooms: async (r: Record<string, StoredRoom>) => {
    roomStore = r;
  },
}));

beforeEach(() => {
  roomStore = {};
  vi.resetModules();
});

describe('rooms', () => {
  it('adds and lists participants', async () => {
    const { createRoom, addParticipant, listParticipants } = await import('../rooms.ts');
    const room = createRoom('room1');
    addParticipant(room.id, 'explorer');
    expect(listParticipants(room.id)).toHaveLength(2);
  });

  it('enforces single facilitator and explorer per room', async () => {
    const { createRoom, addParticipant } = await import('../rooms.ts');
    const room = createRoom('room-limits');
    expect(() => addParticipant(room.id, 'facilitator')).toThrowError('facilitator already present');
    addParticipant(room.id, 'explorer');
    expect(() => addParticipant(room.id, 'explorer')).toThrowError('explorer already present');
  });

  it('prevents role reassignment when slot is taken', async () => {
    const { createRoom, addParticipant, setRole, getFacilitator } = await import('../rooms.ts');
    const room = createRoom('room-role-change');
    const facilitator = getFacilitator(room.id)!;
    const listener = addParticipant(room.id, 'listener');
    expect(() => setRole(room.id, listener.id, 'facilitator')).toThrowError('facilitator already present');
    expect(() => setRole(room.id, facilitator.id, 'explorer')).not.toThrow();
  });

  it('cleans up inactive participants', async () => {
    const {
      createRoom,
      addParticipant,
      listParticipants,
      getParticipant,
      cleanupInactiveParticipants,
      getFacilitator,
    } = await import('../rooms.ts');
    const room = createRoom('room1');
    const participant = addParticipant(room.id, 'explorer');
    const p = getParticipant(room.id, participant.id)!;
    p.lastActive = Date.now() - 60 * 60 * 1000; // 1 hour ago
    cleanupInactiveParticipants(30 * 60 * 1000); // 30 minutes
    const facilitator = getFacilitator(room.id)!;
    expect(listParticipants(room.id)).toEqual([facilitator]);
  });

  it('sets and verifies password', async () => {
    const { createRoom, setPassword, verifyPassword } = await import('../rooms.ts');
    const room = createRoom('room1');
    setPassword(room.id, 'secret');
    expect(verifyPassword(room.id, 'secret')).toBe(true);
    expect(verifyPassword(room.id, 'wrong')).toBe(false);
    expect(roomStore[room.id].passwordHash).toBeDefined();
    expect(roomStore[room.id].passwordHash).not.toEqual('secret');
    expect(roomStore[room.id]).not.toHaveProperty('password');
  });

  it('migrates legacy plain-text room passwords to hashes', async () => {
    roomStore = {
      legacy: {
        id: 'legacy',
        password: 'secret',
        participants: [],
      },
    };

    const { verifyPassword, getRoom } = await import('../rooms.ts');
    expect(verifyPassword('legacy', 'secret')).toBe(true);
    expect(roomStore.legacy.passwordHash).toBeDefined();
    expect(roomStore.legacy).not.toHaveProperty('password');
    expect(getRoom('legacy')?.passwordHash).toBeDefined();
  });

  it('kicks participant and closes socket', async () => {
    const { createRoom, addParticipant, attachSocket, kickParticipant, getParticipant } = await import('../rooms.ts');
    const room = createRoom('room1');
    const participant = addParticipant(room.id, 'explorer');
    const ws = { close: vi.fn() } as any;
    attachSocket(room.id, participant.id, ws);
    kickParticipant(room.id, participant.id);
    expect(getParticipant(room.id, participant.id)).toBeUndefined();
    expect(ws.close).toHaveBeenCalled();
  });

  it('closes the room when the facilitator leaves', async () => {
    const { createRoom, addParticipant, attachSocket, removeParticipant, getRoom, getFacilitator } = await import('../rooms.ts');
    const room = createRoom('room-close');
    const facilitator = getFacilitator(room.id)!;
    const listener = addParticipant(room.id, 'listener');
    const explorer = addParticipant(room.id, 'explorer');

    const listenerWs = { close: vi.fn() } as any;
    const explorerWs = { close: vi.fn() } as any;
    attachSocket(room.id, listener.id, listenerWs);
    attachSocket(room.id, explorer.id, explorerWs);

    removeParticipant(room.id, listener.id);
    expect(getRoom(room.id)).toBeDefined();
    expect(listenerWs.close).toHaveBeenCalledTimes(1);

    removeParticipant(room.id, facilitator.id);
    expect(getRoom(room.id)).toBeUndefined();
    expect(explorerWs.close).toHaveBeenCalledTimes(1);
  });
});
