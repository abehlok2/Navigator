import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadUsers, saveUsers, StoredUser } from './storage.js';

const DEFAULT_SECRET = 'dev-secret';
let jwtSecret =
  process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'production' ? undefined : DEFAULT_SECRET);
if (!jwtSecret) {
  throw new Error('JWT_SECRET not set');
}
if (jwtSecret === DEFAULT_SECRET) {
  console.warn('JWT_SECRET not set; using default development secret');
}
const JWT_SECRET: string = jwtSecret;

const TOKEN_INACTIVITY_MS = Number(process.env.TOKEN_INACTIVITY_MS ?? 15 * 60 * 1000);
const activeTokens = new Map<string, number>();

let users: Record<string, StoredUser> = await loadUsers();

function normalizeUsername(username: string): string {
  return username.trim();
}

export class UserExistsError extends Error {
  constructor(username: string) {
    super(`User with username "${username}" already exists`);
    this.name = 'UserExistsError';
  }
}

export async function register(username: string, password: string, role: string = 'explorer') {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) throw new Error('username required');
  if (users[normalizedUsername]) throw new UserExistsError(normalizedUsername);
  const passwordHash = await bcrypt.hash(password, 10);
  users[normalizedUsername] = { username: normalizedUsername, passwordHash, role };
  await saveUsers(users);
}

export async function login(username: string, password: string): Promise<string | null> {
  const normalizedUsername = normalizeUsername(username);
  const user = users[normalizedUsername];
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

