import { create } from 'zustand';
import type { Role } from '../features/session/api';
import type { ControlChannel } from '../features/control/channel';
import type { Telemetry } from '../features/control/protocol';
import type { PeerClock } from '../features/audio/peerClock';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface SessionState {
  role: Role | null;
  connection: ConnectionStatus;
  assets: Set<string>;
  control: ControlChannel | null;
  telemetry: Telemetry | null;
  lastHeartbeat: number | null;
  peerClock: PeerClock | null;
  setRole: (role: Role) => void;
  setConnection: (status: ConnectionStatus) => void;
  setControl: (control: ControlChannel | null) => void;
  setPeerClock: (clock: PeerClock | null) => void;
  addAsset: (id: string) => void;
  setTelemetry: (t: Telemetry) => void;
  setHeartbeat: () => void;
}

export const useSessionStore = create<SessionState>(set => ({
  role: null,
  connection: 'disconnected',
  assets: new Set(),
  control: null,
  telemetry: null,
  lastHeartbeat: null,
  peerClock: null,
  setRole: role => set({ role }),
  setConnection: status => set({ connection: status }),
  setControl: control => set({ control }),
  setPeerClock: clock => set({ peerClock: clock }),
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
  setHeartbeat: () => set({ lastHeartbeat: Date.now() }),
}));
