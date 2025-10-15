import React, { useCallback, useMemo, useState } from 'react';

import { useSessionStore } from '../../state/session';
import AssetCard, { type AssetActionState } from '../assets/components/AssetCard';
import { getRawAssetById } from '../audio/assets';

export default function AssetAvailability() {
  const { role, manifestEntries, assetProgress, localAssets, remoteAssets, remoteMissing, control } =
    useSessionStore(state => ({
      role: state.role,
      manifestEntries: Object.values(state.manifest),
      assetProgress: state.assetProgress,
      localAssets: state.assets,
      remoteAssets: state.remoteAssets,
      remoteMissing: state.remoteMissing,
      control: state.control,
    }));

  const total = manifestEntries.length;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionState, setActionState] = useState<Record<string, AssetActionState>>({});

  const loadedCounts = useMemo(() => {
    const local = manifestEntries.reduce((count, entry) => (localAssets.has(entry.id) ? count + 1 : count), 0);
    const remote = manifestEntries.reduce((count, entry) => (remoteAssets.has(entry.id) ? count + 1 : count), 0);
    return { local, remote };
  }, [localAssets, manifestEntries, remoteAssets]);

  const updateActionState = useCallback((id: string, next: AssetActionState) => {
    setActionState(prev => ({ ...prev, [id]: next }));
  }, []);

  const toDataUrl = useCallback((data: ArrayBuffer, mimeType?: string) => {
    const bytes = new Uint8Array(data);
    let base64: string;
    if (typeof globalThis.btoa === 'function') {
      let binary = '';
      bytes.forEach(b => {
        binary += String.fromCharCode(b);
      });
      base64 = globalThis.btoa(binary);
    } else {
      const bufferCtor = (globalThis as any).Buffer as
        | { from(data: Uint8Array): { toString(encoding: string): string } }
        | undefined;
      if (!bufferCtor) {
        throw new Error('No base64 encoder available in this environment.');
      }
      base64 = bufferCtor.from(bytes).toString('base64');
    }
    const type = mimeType && mimeType.trim() ? mimeType : 'application/octet-stream';
    return `data:${type};base64,${base64}`;
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => (prev === id ? null : id));
  }, []);

  const handleLoad = useCallback(
    async (entryId: string) => {
      const entry = manifestEntries.find(item => item.id === entryId);
      if (!entry) return;
      if (!control) {
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'error',
          message: 'Control channel is not connected.',
        });
        return;
      }

      updateActionState(entryId, {
        phase: 'loading',
        tone: 'info',
        message: 'Sending load command…',
      });

      try {
        const stored = getRawAssetById(entryId);
        const source = stored ? toDataUrl(stored.data, stored.mimeType) : undefined;
        await control.load({ id: entryId, sha256: entry.sha256, bytes: entry.bytes, ...(source ? { source } : {}) });
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'success',
          message: 'Load command acknowledged.',
        });
      } catch (err) {
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'error',
          message: (err as Error).message || 'Failed to load asset.',
        });
      }
    },
    [control, manifestEntries, toDataUrl, updateActionState],
  );

  const handleUnload = useCallback(
    async (entryId: string) => {
      if (!control) {
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'error',
          message: 'Control channel is not connected.',
        });
        return;
      }

      updateActionState(entryId, {
        phase: 'unloading',
        tone: 'info',
        message: 'Sending unload command…',
      });

      try {
        await control.unload({ id: entryId });
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'success',
          message: 'Unload command acknowledged.',
        });
      } catch (err) {
        updateActionState(entryId, {
          phase: 'idle',
          tone: 'error',
          message: (err as Error).message || 'Failed to unload asset.',
        });
      }
    },
    [control, updateActionState],
  );

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-sm text-slate-500">
        <span className="text-base font-semibold text-slate-700">Waiting for asset manifest…</span>
        <span>Assets shared by the facilitator will appear here for quick verification.</span>
      </div>
    );
  }

  const localPercent = total ? Math.round((loadedCounts.local / total) * 100) : 0;
  const remotePercent = total ? Math.round((loadedCounts.remote / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-2xl bg-slate-50/80 p-4 sm:grid-cols-2">
        <SummaryBlock
          title="Local library"
          subtitle="Available on this device"
          count={loadedCounts.local}
          total={total}
          percent={localPercent}
        />
        {role === 'facilitator' && (
          <SummaryBlock
            title="Explorer"
            subtitle="Reported by remote explorer"
            count={loadedCounts.remote}
            total={total}
            percent={remotePercent}
          />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {manifestEntries.map(entry => {
          const progress = assetProgress[entry.id];
          const pct = progress?.total
            ? Math.round((progress.loaded / Math.max(progress.total, 1)) * 100)
            : 0;
          const localStatus = localAssets.has(entry.id)
            ? 'loaded'
            : progress?.loaded
              ? 'loading'
              : 'missing';
          const remoteStatus = remoteAssets.has(entry.id) ? 'loaded' : 'missing';
          const remoteIssue = role === 'facilitator' && remoteMissing.has(entry.id);
          return (
            <AssetCard
              key={entry.id}
              entry={entry as typeof entry & { duration?: number }}
              localStatus={localStatus}
              progress={pct}
              isSelected={selectedId === entry.id}
              onToggleSelect={handleSelect}
              isFacilitator={role === 'facilitator'}
              remoteStatus={remoteStatus}
              remoteIssue={remoteIssue}
              actionState={actionState[entry.id]}
              onLoad={() => handleLoad(entry.id)}
              onUnload={() => handleUnload(entry.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface SummaryBlockProps {
  title: string;
  subtitle: string;
  count: number;
  total: number;
  percent: number;
}

function SummaryBlock({ title, subtitle, count, total, percent }: SummaryBlockProps) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/60 bg-white/70 p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="text-sm text-slate-500">{subtitle}</div>
      <div className="text-2xl font-semibold text-slate-900">
        {count}
        <span className="text-sm text-slate-400"> / {total}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-sky-500 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="text-xs font-medium text-slate-500">{percent}% complete</div>
    </div>
  );
}
