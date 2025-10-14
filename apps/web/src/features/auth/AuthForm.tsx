import React, { useState } from 'react';
import { useAuthStore } from '../../state/auth';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select } from '../../components/ui/select';
import { apiUrl } from '../../config';

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,128}$/;

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
    if (!PASSWORD_PATTERN.test(password)) {
      return 'Passwords must be 8-128 characters and include at least one uppercase letter, one lowercase letter, and one number.';
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[320px] bg-gradient-to-t from-slate-900 to-transparent" />

      <Card className="relative w-full max-w-md border-slate-800/60 bg-white/95 text-slate-900 shadow-2xl shadow-sky-900/40">
        <CardHeader className="border-none pb-0">
          <CardTitle className="text-2xl font-semibold">
            {mode === 'login' ? 'Welcome back' : 'Create an account'}
          </CardTitle>
          <CardDescription className="text-sm text-slate-600">
            {mode === 'login'
              ? 'Sign in to coordinate your next exploration session.'
              : 'Register to access explorer, facilitator, or listener controls.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-slate-600">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Your username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-600">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {mode === 'register' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium text-slate-600">
                    Confirm password
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role" className="text-sm font-medium text-slate-600">
                    Session role
                  </Label>
                  <Select
                    id="role"
                    value={role}
                    onChange={e => setRole(e.target.value as 'explorer' | 'facilitator' | 'listener')}
                  >
                    <option value="explorer">Explorer</option>
                    <option value="facilitator">Facilitator</option>
                    <option value="listener">Listener</option>
                  </Select>
                </div>
              </>
            )}

            <p className="text-sm text-slate-500">
              Passwords must include upper- and lower-case letters and at least one number.
            </p>
            {error && <div className="whitespace-pre-wrap text-sm font-medium text-rose-600">{error}</div>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (mode === 'login' ? 'Logging in…' : 'Registering…') : mode === 'login' ? 'Login' : 'Register'}
            </Button>
          </form>

          <Button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
              setConfirmPassword('');
            }}
            className="w-full bg-transparent text-slate-700 transition hover:bg-slate-100"
          >
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Login'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
