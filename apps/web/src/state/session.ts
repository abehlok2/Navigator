import { create } from 'zustand';
import type { Role } from '../features/session/api';
import type { ControlChannel } from '../features/control/channel';
import type { TelemetryLevels, AssetManifest, AssetPresence } from '../features/control/protocol';
import type { PeerClock } from '../features/audio/peerClock';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type ManifestEntry = AssetManifest['entries'][number];

interface AssetProgress {
  loaded: number;
  total: number;
}

interface SessionState {
  role: Role | null;
  connection: ConnectionStatus;
  manifest: Record<string, ManifestEntry>;
  assets: Set<string>;
  remoteAssets: Set<string>;
  remoteMissing: Set<string>;
  assetProgress: Record<string, AssetProgress>;
  control: ControlChannel | null;
  telemetry: TelemetryLevels | null;
  lastHeartbeat: number | null;
  peerClock: PeerClock | null;
  micStream: MediaStream | null;
  setRole: (role: Role | null) => void;
  setConnection: (status: ConnectionStatus) => void;
  setControl: (control: ControlChannel | null) => void;
  setPeerClock: (clock: PeerClock | null) => void;
  setManifest: (entries: AssetManifest['entries']) => void;
  setAssetProgress: (id: string, loaded: number, total?: number) => void;
  addAsset: (id: string, opts?: { broadcast?: boolean }) => void;
  removeAsset: (id: string, opts?: { broadcast?: boolean }) => void;
  updateRemotePresence: (presence: AssetPresence) => void;
  resetRemotePresence: () => void;
  setTelemetry: (t: TelemetryLevels | null) => void;
  setHeartbeat: () => void;
  setMicStream: (stream: MediaStream | null) => void;
}

const computePresence = (manifest: Record<string, ManifestEntry>, assets: Set<string>) => {
  const ids = Object.keys(manifest);
  if (!ids.length) return null;
  const have = ids.filter(id => assets.has(id));
  const missing = ids.filter(id => !assets.has(id));
  return { have, missing };
};

export const useSessionStore = create<SessionState>(set => ({
  role: null,
  connection: 'disconnected',
  manifest: {},
  assets: new Set(),
  remoteAssets: new Set(),
  remoteMissing: new Set(),
  assetProgress: {},
  control: null,
  telemetry: null,
  lastHeartbeat: null,
  peerClock: null,
  micStream: null,
  setRole: role => set({ role }),
  setConnection: status => set({ connection: status }),
  setControl: control => set({ control }),
  setPeerClock: clock => set({ peerClock: clock }),
  setManifest: entries =>
    set(state => {
      const manifest: Record<string, ManifestEntry> = {};
      entries.forEach(entry => {
        manifest[entry.id] = entry;
      });
      const validIds = new Set(entries.map(entry => entry.id));
      const assets = new Set(Array.from(state.assets).filter(id => validIds.has(id)));
      const remoteAssets = new Set(Array.from(state.remoteAssets).filter(id => validIds.has(id)));
      const remoteMissing = new Set(Array.from(state.remoteMissing).filter(id => validIds.has(id)));
      const assetProgress: Record<string, AssetProgress> = {};
      entries.forEach(entry => {
        assetProgress[entry.id] = {
          loaded: assets.has(entry.id) ? entry.bytes : 0,
          total: entry.bytes,
        };
      });
      const presence = computePresence(manifest, assets);
      if (presence && state.control && state.role === 'explorer') {
        state.control.send('asset.presence', presence, false).catch(() => {});
      }
      return { manifest, assets, remoteAssets, remoteMissing, assetProgress };
    }),
  setAssetProgress: (id, loaded, total) =>
    set(state => {
      const next = { ...state.assetProgress };
      const entry = state.manifest[id];
      const finalTotal = total ?? entry?.bytes ?? next[id]?.total ?? loaded;
      next[id] = {
        loaded: Math.min(loaded, finalTotal),
        total: finalTotal,
      };
      return { assetProgress: next };
    }),
  addAsset: (id, opts) =>
    set(state => {
      const assets = new Set(state.assets);
      assets.add(id);
      const assetProgress = { ...state.assetProgress };
      const entry = state.manifest[id];
      if (entry) {
        assetProgress[id] = { loaded: entry.bytes, total: entry.bytes };
      }
      const shouldBroadcast = opts?.broadcast ?? true;
      if (shouldBroadcast) {
        const presence = computePresence(state.manifest, assets);
        if (presence && state.control) {
          state.control.send('asset.presence', presence, false).catch(() => {});
        }
      }
      return { assets, assetProgress };
    }),
  removeAsset: (id, opts) =>
    set(state => {
      const assets = new Set(state.assets);
      assets.delete(id);
      const assetProgress = { ...state.assetProgress };
      const entry = state.manifest[id];
      if (entry) {
        assetProgress[id] = { loaded: 0, total: entry.bytes };
      } else {
        delete assetProgress[id];
      }
      const shouldBroadcast = opts?.broadcast ?? true;
      if (shouldBroadcast) {
        const presence = computePresence(state.manifest, assets);
        if (presence && state.control) {
          state.control.send('asset.presence', presence, false).catch(() => {});
        }
      }
      return { assets, assetProgress };
    }),
  updateRemotePresence: presence =>
    set(state => {
      const ids = new Set(Object.keys(state.manifest));
      const remoteAssets = new Set(state.remoteAssets);
      const remoteMissing = new Set(state.remoteMissing);
      presence.have
        .filter(id => ids.has(id))
        .forEach(id => {
          remoteAssets.add(id);
          remoteMissing.delete(id);
        });
      presence.missing
        .filter(id => ids.has(id))
        .forEach(id => {
          remoteAssets.delete(id);
          remoteMissing.add(id);
        });
      return { remoteAssets, remoteMissing };
    }),
  resetRemotePresence: () =>
    set(state => {
      const ids = Object.keys(state.manifest);
      return {
        remoteAssets: new Set(),
        remoteMissing: new Set(ids),
      };
    }),
  setTelemetry: t => set({ telemetry: t }),
  setHeartbeat: () => set({ lastHeartbeat: Date.now() }),
  setMicStream: stream => set({ micStream: stream }),
}));
