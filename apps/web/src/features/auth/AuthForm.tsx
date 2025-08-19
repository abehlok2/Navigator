import React, { useState } from 'react';
import { useAuthStore } from '../../state/auth';

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
        const res = await fetch('http://localhost:8080/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, role }),
        });
        if (!res.ok) throw new Error('register failed');
      }
      const res = await fetch('http://localhost:8080/login', {
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
    <div>
      <h2>{mode === 'login' ? 'Login' : 'Create Account'}</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
        </div>
        <div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>
        {mode === 'register' && (
          <div>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="explorer">Explorer</option>
              <option value="facilitator">Facilitator</option>
              <option value="listener">Listener</option>
            </select>
          </div>
        )}
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button type="submit">
          {mode === 'login' ? 'Login' : 'Register'}
        </button>
      </form>
      <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Login'}
      </button>
    </div>
  );
}
