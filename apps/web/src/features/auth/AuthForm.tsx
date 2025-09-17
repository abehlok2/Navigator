import React, { useState } from 'react';
import { useAuthStore } from '../../state/auth';
import { Button } from '../../components/ui/button';
import { apiUrl } from '../../config';

export default function AuthForm() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('explorer');
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore(s => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'register') {
        const res = await fetch(apiUrl('/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, role }),
        });
        if (!res.ok) throw new Error('register failed');
      }
      const res = await fetch(apiUrl('/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error('login failed');
      const data = await res.json();
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      setAuth(data.token, payload.username, payload.role);
      setUsername('');
      setPassword('');
    } catch {
      setError('Authentication failed');
    }
  };

  return (
    <div className="mx-auto max-w-sm p-4">
      <h2 className="mb-4 text-xl font-semibold">
        {mode === 'login' ? 'Login' : 'Create Account'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full rounded border border-gray-300 p-2"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full rounded border border-gray-300 p-2"
        />
        {mode === 'register' && (
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full rounded border border-gray-300 p-2"
          >
            <option value="explorer">Explorer</option>
            <option value="facilitator">Facilitator</option>
            <option value="listener">Listener</option>
          </select>
        )}
        {error && <div className="text-red-500">{error}</div>}
        <Button type="submit" className="w-full">
          {mode === 'login' ? 'Login' : 'Register'}
        </Button>
      </form>
      <Button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        className="mt-2 w-full bg-transparent text-blue-600 hover:bg-blue-50"
      >
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Login'}
      </Button>
    </div>
  );
}
