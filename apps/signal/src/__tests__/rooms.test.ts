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
    expect(listParticipants(room.id)).toHaveLength(1);
  });

  it('cleans up inactive participants', async () => {
    const { createRoom, addParticipant, listParticipants, getParticipant, cleanupInactiveParticipants } = await import('../rooms.ts');
    const room = createRoom('room1');
    const participant = addParticipant(room.id, 'explorer');
    const p = getParticipant(room.id, participant.id)!;
    p.lastActive = Date.now() - 60 * 60 * 1000; // 1 hour ago
    cleanupInactiveParticipants(30 * 60 * 1000); // 30 minutes
    expect(listParticipants(room.id)).toHaveLength(0);
  });
});
