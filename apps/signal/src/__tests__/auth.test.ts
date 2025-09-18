import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  vi.stubEnv('JWT_SECRET', 'testsecret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('auth', () => {
  it('registers and authenticates a user', async () => {
    const { register, login, authenticate } = await import('../auth.ts');
    await register('alice', 'Password1!', 'explorer');
    const token = await login('alice', 'Password1!');
    expect(token).toBeTypeOf('string');
    const payload = authenticate(token!);
    expect(payload?.username).toBe('alice');
  });

  it('rejects invalid credentials', async () => {
    const { register, login } = await import('../auth.ts');
    await register('bob', 'Secret123');
    const token = await login('bob', 'wrong');
    expect(token).toBeNull();
  });

  it('revokes tokens', async () => {
    const { register, login, authenticate, revokeToken } = await import('../auth.ts');
    await register('carol', 'Password1!');
    const token = await login('carol', 'Password1!');
    expect(authenticate(token!)).not.toBeNull();
    revokeToken(token!);
    expect(authenticate(token!)).toBeNull();
  });

  it('normalizes usernames and prevents duplicates', async () => {
    const { register, login, UserExistsError } = await import('../auth.ts');
    await register('  dave  ', 'Password1!');
    await expect(register('dave', 'Password1!')).rejects.toBeInstanceOf(UserExistsError);
    const token = await login('  dave  ', 'Password1!');
    const trimmedToken = await login('dave', 'Password1!');
    expect(token).toBeTypeOf('string');
    expect(trimmedToken).toBeTypeOf('string');
  });
});
