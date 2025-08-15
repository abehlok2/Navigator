import { randomUUID } from 'crypto';
import type { Role } from './types.js';
import type { WebSocket } from 'ws';

export interface Participant {
  id: string;
  role: Role;
  ws?: WebSocket;
}

export interface Room {
  id: string;
  participants: Map<string, Participant>;
}

const rooms = new Map<string, Room>();

export function createRoom(id: string = randomUUID()): Room {
  const room: Room = { id, participants: new Map() };
  rooms.set(id, room);
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function addParticipant(roomId: string, role: Role): Participant {
  const room = rooms.get(roomId);
  if (!room) throw new Error('room not found');
  const participant: Participant = { id: randomUUID(), role };
  room.participants.set(participant.id, participant);
  return participant;
}

export function removeParticipant(roomId: string, participantId: string): void {
  const room = rooms.get(roomId);
  room?.participants.delete(participantId);
}

export function setRole(roomId: string, participantId: string, role: Role): void {
  const room = rooms.get(roomId);
  const participant = room?.participants.get(participantId);
  if (participant) participant.role = role;
}

export function attachSocket(roomId: string, participantId: string, ws?: WebSocket): void {
  const room = rooms.get(roomId);
  const participant = room?.participants.get(participantId);
  if (participant) participant.ws = ws;
}

export function getParticipant(roomId: string, participantId: string): Participant | undefined {
  const room = rooms.get(roomId);
  return room?.participants.get(participantId);
}

export function listParticipants(roomId: string): Participant[] {
  const room = rooms.get(roomId);
  return room ? Array.from(room.participants.values()) : [];
}

