import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StoredUser } from '../storage.js';

let userStore: Record<string, StoredUser> = {};

vi.mock('../storage.js', () => ({
  loadUsers: async () => userStore,
  saveUsers: async (u: Record<string, StoredUser>) => {
    userStore = u;
  },
}));

beforeEach(() => {
  userStore = {};
  vi.resetModules();
  process.env.JWT_SECRET = 'testsecret';
});

describe('auth', () => {
  it('registers and authenticates a user', async () => {
    const { register, login, authenticate } = await import('../auth.ts');
    await register('alice', 'password', 'explorer');
    const token = await login('alice', 'password');
    expect(token).toBeTypeOf('string');
    const payload = authenticate(token!);
    expect(payload?.username).toBe('alice');
  });

  it('rejects invalid credentials', async () => {
    const { register, login } = await import('../auth.ts');
    await register('bob', 'secret');
    const token = await login('bob', 'wrong');
    expect(token).toBeNull();
  });
});
