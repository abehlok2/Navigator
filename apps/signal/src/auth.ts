import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadUsers, saveUsers, StoredUser } from './storage.js';

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET not set');
}

let users: Record<string, StoredUser> = await loadUsers();

export async function register(username: string, password: string, role: string = 'explorer') {
  if (users[username]) throw new Error('user exists');
  const passwordHash = await bcrypt.hash(password, 10);
  users[username] = { username, passwordHash, role };
  await saveUsers(users);
}

export async function login(username: string, password: string): Promise<string | null> {
  const user = users[username];
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
}

export interface AuthPayload {
  username: string;
  role: string;
}

export function authenticate(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as jwt.JwtPayload as AuthPayload;
  } catch {
    return null;
  }
}

