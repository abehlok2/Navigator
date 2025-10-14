import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
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
  passwordHash?: string;
}

const rooms = new Map<string, Room>();

function roleLimit(role: Role): number {
  switch (role) {
    case 'listener':
      return 5;
    case 'facilitator':
    case 'explorer':
    default:
      return 1;
  }
}

function ensureRoleCapacity(room: Room, role: Role, excludeId?: string): void {
  const limit = roleLimit(role);
  const count = Array.from(room.participants.values()).filter(
    participant => participant.role === role && participant.id !== excludeId
  ).length;
  if (count >= limit) {
    if (role === 'listener') {
      throw new Error('listener limit reached');
    }
    throw new Error(`${role} already present`);
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

function passwordsMatch(password: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

const storedRooms = await loadRooms();
let migratedLegacyPasswords = false;
for (const room of Object.values(storedRooms)) {
  let passwordHash = room.passwordHash;
  if (!passwordHash && room.password) {
    passwordHash = hashPassword(room.password);
    room.passwordHash = passwordHash;
    delete room.password;
    migratedLegacyPasswords = true;
  }
  rooms.set(room.id, {
    id: room.id,
    passwordHash,
    participants: new Map<string, Participant>(
      room.participants.map(p => [p.id, { id: p.id, role: p.role as Role, lastActive: Date.now() }])
    ),
  });
}

if (migratedLegacyPasswords) {
  persist();
}

function persist() {
  const data: Record<string, StoredRoom> = {};
  rooms.forEach((room, id) => {
    data[id] = {
      id,
      passwordHash: room.passwordHash,
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
  ensureRoleCapacity(room, role);
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

export function kickParticipant(roomId: string, participantId: string): void {
  const room = rooms.get(roomId);
  const participant = room?.participants.get(participantId);
  if (participant?.ws) {
    participant.ws.close();
  }
  if (room?.participants.delete(participantId)) {
    persist();
  }
}

export function setRole(roomId: string, participantId: string, role: Role): void {
  const room = rooms.get(roomId);
  const participant = room?.participants.get(participantId);
  if (participant && room) {
    ensureRoleCapacity(room, role, participantId);
    participant.role = role;
    persist();
  }
}

export function setPassword(roomId: string, password?: string): void {
  const room = rooms.get(roomId);
  if (room) {
    if (password === undefined) {
      delete room.passwordHash;
    } else {
      room.passwordHash = hashPassword(password);
    }
    persist();
  }
}

export function verifyPassword(roomId: string, password?: string): boolean {
  const room = rooms.get(roomId);
  if (!room?.passwordHash) return !password;
  const candidate = password ?? '';
  return passwordsMatch(candidate, room.passwordHash);
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

