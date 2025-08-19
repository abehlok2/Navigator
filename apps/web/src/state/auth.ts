import { create } from 'zustand';

interface AuthState {
  token: string | null;
  username: string | null;
  role: string | null;
  setAuth: (token: string, username: string, role: string) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  username: null,
  role: null,
  setAuth: (token, username, role) => set({ token, username, role }),
  logout: async () => {
    const token = get().token;
    if (token) {
      try {
        await fetch('http://localhost:8080/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore network errors
      }
    }
    set({ token: null, username: null, role: null });
  },
}));
