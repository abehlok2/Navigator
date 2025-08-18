import { create } from 'zustand';
import type { Role } from '../features/session/api';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface SessionState {
  role: Role | null;
  connection: ConnectionStatus;
  assets: Set<string>;
  setRole: (role: Role) => void;
  setConnection: (status: ConnectionStatus) => void;
  addAsset: (id: string) => void;
}

export const useSessionStore = create<SessionState>(set => ({
  role: null,
  connection: 'disconnected',
  assets: new Set(),
  setRole: role => set({ role }),
  setConnection: status => set({ connection: status }),
  addAsset: id =>
    set(state => {
      const next = new Set(state.assets);
      next.add(id);
      return { assets: next };
    }),
}));
