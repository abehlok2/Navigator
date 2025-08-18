import { randomUUID } from 'crypto';
import type { Role } from './types.js';
import type { WebSocket } from 'ws';
import { loadRooms, saveRooms, type StoredRoom } from './storage.js';

export interface Participant {
  id: string;
  role: Role;
  ws?: WebSocket;
  lastActive: number;
}

export interface Room {
  id: string;
  participants: Map<string, Participant>;
}

const rooms = new Map<string, Room>();

const storedRooms = await loadRooms();
for (const room of Object.values(storedRooms)) {
  rooms.set(room.id, {
    id: room.id,
    participants: new Map<string, Participant>(
      room.participants.map(p => [p.id, { id: p.id, role: p.role as Role, lastActive: Date.now() }])
    ),
  });
}

function persist() {
  const data: Record<string, StoredRoom> = {};
  rooms.forEach((room, id) => {
    data[id] = {
      id,
      participants: Array.from(room.participants.values()).map(p => ({ id: p.id, role: p.role })),
    };
  });
  void saveRooms(data);
}

export function createRoom(id: string = randomUUID()): Room {
  const room: Room = { id, participants: new Map() };
  rooms.set(id, room);
  persist();
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function addParticipant(roomId: string, role: Role): Participant {
  const room = rooms.get(roomId);
  if (!room) throw new Error('room not found');
  const participant: Participant = { id: randomUUID(), role, lastActive: Date.now() };
  room.participants.set(participant.id, participant);
  persist();
  return participant;
}

export function removeParticipant(roomId: string, participantId: string): void {
  const room = rooms.get(roomId);
  if (room?.participants.delete(participantId)) {
    persist();
  }
}

export function setRole(roomId: string, participantId: string, role: Role): void {
  const room = rooms.get(roomId);
  const participant = room?.participants.get(participantId);
  if (participant) {
    participant.role = role;
    persist();
  }
}

export function attachSocket(roomId: string, participantId: string, ws?: WebSocket): void {
  const room = rooms.get(roomId);
  const participant = room?.participants.get(participantId);
  if (participant) {
    participant.ws = ws;
    participant.lastActive = Date.now();
  }
}

export function getParticipant(roomId: string, participantId: string): Participant | undefined {
  const room = rooms.get(roomId);
  return room?.participants.get(participantId);
}

export function listParticipants(roomId: string): Participant[] {
  const room = rooms.get(roomId);
  return room ? Array.from(room.participants.values()) : [];
}

export function touchParticipant(roomId: string, participantId: string): void {
  const room = rooms.get(roomId);
  const participant = room?.participants.get(participantId);
  if (participant) participant.lastActive = Date.now();
}

export function cleanupInactiveParticipants(timeoutMs: number): void {
  const now = Date.now();
  let changed = false;
  rooms.forEach(room => {
    for (const [id, participant] of room.participants) {
      if (now - participant.lastActive > timeoutMs) {
        room.participants.delete(id);
        changed = true;
      }
    }
  });
  if (changed) persist();
}

