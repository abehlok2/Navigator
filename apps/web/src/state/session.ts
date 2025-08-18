import { create } from 'zustand';
import type { Role } from '../features/session/api';
import type { ControlChannel } from '../features/control/channel';
import type { Telemetry } from '../features/control/protocol';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface SessionState {
  role: Role | null;
  connection: ConnectionStatus;
  assets: Set<string>;
  control: ControlChannel | null;
  telemetry: Telemetry | null;
  setRole: (role: Role) => void;
  setConnection: (status: ConnectionStatus) => void;
  setControl: (control: ControlChannel | null) => void;
  addAsset: (id: string) => void;
  setTelemetry: (t: Telemetry) => void;
}

export const useSessionStore = create<SessionState>(set => ({
  role: null,
  connection: 'disconnected',
  assets: new Set(),
  control: null,
  telemetry: null,
  setRole: role => set({ role }),
  setConnection: status => set({ connection: status }),
  setControl: control => set({ control }),
  addAsset: id =>
    set(state => {
      const next = new Set(state.assets);
      next.add(id);
      state.control
        ?.send('manifest.presence', { have: [id] }, false)
        .catch(() => {});
      return { assets: next };
    }),
  setTelemetry: t => set({ telemetry: t }),
}));
