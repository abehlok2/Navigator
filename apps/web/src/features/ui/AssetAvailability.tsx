import React, { useMemo } from 'react';
import { useSessionStore } from '../../state/session';
import { formatBytes } from '../../lib/format';

export default function AssetAvailability() {
  const { role, manifestEntries, assetProgress, localAssets, remoteAssets } = useSessionStore(state => ({
    role: state.role,
    manifestEntries: Object.values(state.manifest),
    assetProgress: state.assetProgress,
    localAssets: state.assets,
    remoteAssets: state.remoteAssets,
  }));

  const total = manifestEntries.length;
  const loadedCounts = useMemo(() => {
    const local = manifestEntries.reduce((count, entry) => (localAssets.has(entry.id) ? count + 1 : count), 0);
    const remote = manifestEntries.reduce((count, entry) => (remoteAssets.has(entry.id) ? count + 1 : count), 0);
    return { local, remote };
  }, [localAssets, manifestEntries, remoteAssets]);

  if (total === 0) {
    return (
      <div className="section">
        <h3>Assets</h3>
        <div className="text-sm text-gray-600">Waiting for asset manifest…</div>
      </div>
    );
  }

  const localPercent = total ? Math.round((loadedCounts.local / total) * 100) : 0;
  const remotePercent = total ? Math.round((loadedCounts.remote / total) * 100) : 0;

  return (
    <div className="section">
      <h3>Assets</h3>
      <div className="text-sm text-gray-600">Local progress: {loadedCounts.local}/{total} ({localPercent}%)</div>
      {role === 'facilitator' && (
        <div className="text-sm text-gray-600">
          Explorer progress: {loadedCounts.remote}/{total} ({remotePercent}%)
        </div>
      )}
      <ul className="mt-2 space-y-2">
        {manifestEntries.map(entry => {
          const progress = assetProgress[entry.id];
          const pct = progress?.total
            ? Math.round((progress.loaded / Math.max(progress.total, 1)) * 100)
            : 0;
          const localStatus = localAssets.has(entry.id) ? 'Loaded' : progress?.loaded ? 'Loading…' : 'Missing';
          const remoteStatus = remoteAssets.has(entry.id) ? 'Loaded' : 'Missing';
          return (
            <li key={entry.id} className="rounded border border-gray-200 p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{entry.id}</span>
                <span className="text-xs text-gray-500">{formatBytes(entry.bytes)}</span>
              </div>
              <div className="text-xs text-gray-600">Local: {localStatus} ({pct}%)</div>
              {role === 'facilitator' && (
                <div className="text-xs text-gray-600">Explorer: {remoteStatus}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
