import { promises as fs } from 'fs';

const roomsFile = new URL('../data/rooms.json', import.meta.url);
const usersFile = new URL('../data/users.json', import.meta.url);

interface StoredParticipant {
  id: string;
  role: string;
}

export interface StoredRoom {
  id: string;
  participants: StoredParticipant[];
}

export interface StoredUser {
  username: string;
  passwordHash: string;
  role: string;
}

async function readJSON<T>(file: URL, def: T): Promise<T> {
  try {
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return def;
  }
}

async function writeJSON<T>(file: URL, data: T): Promise<void> {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export async function loadRooms(): Promise<Record<string, StoredRoom>> {
  return readJSON<Record<string, StoredRoom>>(roomsFile, {});
}

export async function saveRooms(rooms: Record<string, StoredRoom>): Promise<void> {
  await writeJSON(roomsFile, rooms);
}

export async function loadUsers(): Promise<Record<string, StoredUser>> {
  return readJSON<Record<string, StoredUser>>(usersFile, {});
}

export async function saveUsers(users: Record<string, StoredUser>): Promise<void> {
  await writeJSON(usersFile, users);
}

