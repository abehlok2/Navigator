import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadUsers, saveUsers, StoredUser } from './storage.js';

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET not set');
}

const TOKEN_INACTIVITY_MS = Number(process.env.TOKEN_INACTIVITY_MS ?? 15 * 60 * 1000);
const activeTokens = new Map<string, number>();

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
  const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
  activeTokens.set(token, Date.now());
  return token;
}

export interface AuthPayload {
  username: string;
  role: string;
}

export function authenticate(token: string): AuthPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload as AuthPayload;
    const lastActive = activeTokens.get(token);
    if (!lastActive) return null;
    if (Date.now() - lastActive > TOKEN_INACTIVITY_MS) {
      activeTokens.delete(token);
      return null;
    }
    activeTokens.set(token, Date.now());
    return payload;
  } catch {
    return null;
  }
}

export function revokeToken(token: string): void {
  activeTokens.delete(token);
}

export function cleanupExpiredTokens(timeoutMs: number = TOKEN_INACTIVITY_MS): void {
  const now = Date.now();
  for (const [token, lastActive] of activeTokens) {
    if (now - lastActive > timeoutMs) {
      activeTokens.delete(token);
    }
  }
}

