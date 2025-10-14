import React, { useState } from 'react';
import { useAuthStore } from '../../state/auth';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select } from '../../components/ui/select';
import { apiUrl } from '../../config';

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

function decodeJwtPayload(token: string): { username?: string; role?: string } | null {
  try {
    const [, payloadSegment] = token.split('.');
    if (!payloadSegment) return null;
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = atob(padded);
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export default function AuthForm() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'explorer' | 'facilitator' | 'listener'>('explorer');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const setAuth = useAuthStore(s => s.setAuth);

  const validateInputs = () => {
    const trimmedUsername = username.trim();
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      return 'Usernames must be 3-32 characters and can include letters, numbers, underscores, or hyphens.';
    }
    if (password.length < 8 || password.length > 128) {
      return 'Passwords must be between 8 and 128 characters.';
    }
    if (mode === 'register' && password !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateInputs();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSubmitting(true);
    const trimmedUsername = username.trim();

    try {
      let token: string | null = null;
      if (mode === 'register') {
        const res = await fetch(apiUrl('/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmedUsername, password, role }),
        });
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (!res.ok) {
          const issues = Array.isArray(data?.issues) ? data.issues.join('\n') : null;
          throw new Error(data?.error || issues || 'Registration failed');
        }
        if (data?.token && typeof data.token === 'string') {
          token = data.token;
        }
      }

      if (!token) {
        const res = await fetch(apiUrl('/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmedUsername, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          const issues = Array.isArray(data?.issues) ? data.issues.join('\n') : null;
          throw new Error(data?.error || issues || 'Login failed');
        }
        token = data.token;
      }

      if (!token || typeof token !== 'string') {
        throw new Error('Authentication token was not returned by the server.');
      }

      const payload = decodeJwtPayload(token);
      if (!payload?.username || !payload?.role) {
        throw new Error('Received an invalid authentication token.');
      }

      setAuth(token, payload.username, payload.role);
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Authentication failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <h2 className="mb-6 text-center text-2xl font-semibold">
          {mode === 'login' ? 'Login' : 'Create Account'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full rounded border border-gray-300 p-3"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded border border-gray-300 p-3"
          />
          {mode === 'register' && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full rounded border border-gray-300 p-3"
            />
          )}
          {mode === 'register' && (
            <select
              value={role}
              onChange={e => setRole(e.target.value as 'explorer' | 'facilitator' | 'listener')}
              className="w-full rounded border border-gray-300 p-3"
            >
              <option value="explorer">Explorer</option>
              <option value="facilitator">Facilitator</option>
              <option value="listener">Listener</option>
            </select>
          )}
          <p className="text-sm text-gray-500">Passwords must be between 8 and 128 characters.</p>
          {error && <div className="whitespace-pre-wrap text-sm text-red-500">{error}</div>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting
              ? mode === 'login'
                ? 'Logging in…'
                : 'Registering…'
              : mode === 'login'
                ? 'Login'
                : 'Register'}
          </Button>
        </form>
        <Button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
            setConfirmPassword('');
          }}
          className="mt-4 w-full bg-transparent text-blue-600 hover:bg-blue-50"
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Login'}
        </Button>
      </div>
    </div>
  );
}
