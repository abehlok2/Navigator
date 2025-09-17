import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '../../state/session';
import ManifestEditor from './ManifestEditor';

type EntryStatusPhase = 'idle' | 'loading' | 'unloading' | 'success' | 'error';

interface EntryStatus {
  phase: EntryStatusPhase;
  message?: string;
}

export default function FacilitatorControls() {
  const { manifest, remoteAssets, remoteMissing, control } = useSessionStore(s => ({
    manifest: s.manifest,
    remoteAssets: s.remoteAssets,
    remoteMissing: s.remoteMissing,
    control: s.control,
  }));

  const manifestEntries = useMemo(() => Object.values(manifest), [manifest]);
  const remoteAssetSet = remoteAssets;
  const remoteMissingSet = remoteMissing;
  const [status, setStatus] = useState<Record<string, EntryStatus>>({});

  const [gain, setGain] = useState<Record<string, number>>({});
  const handlePlay = (id: string) => control?.play({ id }).catch(() => {});
  const handleStop = (id: string) => control?.stop({ id }).catch(() => {});
  const handleGain = (id: string, value: number) => {
    setGain(g => ({ ...g, [id]: value }));
    control?.setGain({ id, gainDb: value }).catch(() => {});
  };

  useEffect(() => {
    setStatus(prev => {
      let changed = false;
      const next: typeof prev = { ...prev };
      manifestEntries.forEach(entry => {
        const current = prev[entry.id];
        if (!current) return;
        if (current.phase === 'loading' && remoteAssetSet.has(entry.id)) {
          next[entry.id] = {
            phase: 'success',
            message: 'Explorer reports asset loaded.',
          };
          changed = true;
        }
        if (current.phase === 'unloading' && !remoteAssetSet.has(entry.id)) {
          next[entry.id] = {
            phase: 'success',
            message: 'Explorer reports asset unloaded.',
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [manifestEntries, remoteAssets]);

  useEffect(() => {
    const validIds = new Set(manifestEntries.map(entry => entry.id));
    setStatus(prev => {
      const hasInvalid = Object.keys(prev).some(id => !validIds.has(id));
      if (!hasInvalid) return prev;
      const next: typeof prev = {};
      manifestEntries.forEach(entry => {
        if (prev[entry.id]) {
          next[entry.id] = prev[entry.id];
        }
      });
      return next;
    });
  }, [manifestEntries]);

  const updateStatus = useCallback((id: string, next: EntryStatus) => {
    setStatus(prev => ({ ...prev, [id]: next }));
  }, []);

  const handleLoad = useCallback(
    async (entryId: string, sha256?: string, bytes?: number) => {
      if (!control) {
        updateStatus(entryId, {
          phase: 'error',
          message: 'Control channel is not connected.',
        });
        return;
      }
      updateStatus(entryId, { phase: 'loading', message: 'Sending load command…' });
      try {
        await control.load({ id: entryId, sha256, bytes });
        updateStatus(entryId, { phase: 'success', message: 'Load command acknowledged.' });
      } catch (err) {
        updateStatus(entryId, {
          phase: 'error',
          message: (err as Error).message || 'Failed to load asset.',
        });
      }
    },
    [control, updateStatus]
  );

  const handleUnload = useCallback(
    async (entryId: string) => {
      if (!control) {
        updateStatus(entryId, {
          phase: 'error',
          message: 'Control channel is not connected.',
        });
        return;
      }
      updateStatus(entryId, { phase: 'unloading', message: 'Sending unload command…' });
      try {
        await control.unload({ id: entryId });
        updateStatus(entryId, { phase: 'success', message: 'Unload command acknowledged.' });
      } catch (err) {
        updateStatus(entryId, {
          phase: 'error',
          message: (err as Error).message || 'Failed to unload asset.',
        });
      }
    },
    [control, updateStatus]
  );

  const handleCrossfade = () => {
    const loaded = manifestEntries.filter(entry => remoteAssetSet.has(entry.id)).map(entry => entry.id);
    if (loaded.length >= 2) {
      control?.crossfade({ fromId: loaded[0], toId: loaded[1], duration: 2 }).catch(() => {});
    }
  };

  const [duck, setDuck] = useState(false);
  const [threshold, setThreshold] = useState(-40);
  const [reduction, setReduction] = useState(-12);
  const attackMs = 10;
  const releaseMs = 300;

  const sendDucking = (enabled: boolean, nextThreshold = threshold, nextReduction = reduction) => {
    control
      ?.ducking({
        enabled,
        thresholdDb: nextThreshold,
        reduceDb: nextReduction,
        attackMs,
        releaseMs,
      })
      .catch(() => {});
  };

  const toggleDucking = () => {
    const next = !duck;
    setDuck(next);
    sendDucking(next);
  };

  const updateThreshold = (value: number) => {
    setThreshold(value);
    if (duck) {
      sendDucking(true, value, reduction);
    }
  };

  const updateReduction = (value: number) => {
    setReduction(value);
    if (duck) {
      sendDucking(true, threshold, value);
    }
  };

  return (
    <div className="section space-y-4">
      <h2>Facilitator Controls</h2>
      <ManifestEditor />
      <ul className="space-y-4">
        {manifestEntries.map(entry => {
          const id = entry.id;
          const entryStatus = status[id];
          const canLoad = !remoteAssetSet.has(id) && entryStatus?.phase !== 'loading';
          const canUnload = remoteAssetSet.has(id) && entryStatus?.phase !== 'unloading';
          const explorerStatus = remoteAssetSet.has(id)
            ? 'Explorer: Loaded'
            : remoteMissingSet.has(id)
              ? 'Explorer: Missing'
              : 'Explorer: Unknown';
          const statusClass = (() => {
            switch (entryStatus?.phase) {
              case 'loading':
              case 'unloading':
                return 'text-xs text-blue-600';
              case 'success':
                return 'text-xs text-green-600';
              case 'error':
                return 'text-xs text-red-600';
              default:
                return 'text-xs text-gray-500';
            }
          })();
          return (
            <li key={id} className="rounded border border-gray-200 p-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{id}</span>
                  <span className="text-xs text-gray-500">{entry.bytes?.toLocaleString()} bytes</span>
                </div>
                <div className="text-xs text-gray-600">{explorerStatus}</div>
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <div className="text-xs text-gray-600 md:flex-1">
                    Explorer playback now relies exclusively on facilitator-provided local media.
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoad(id, entry.sha256, entry.bytes)}
                      disabled={!canLoad || !control}
                      className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnload(id)}
                      disabled={!canUnload || !control}
                      className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
                    >
                      Unload
                    </button>
                  </div>
                </div>
                {entryStatus?.message && <div className={statusClass}>{entryStatus.message}</div>}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => handlePlay(id)}
                    disabled={!remoteAssetSet.has(id) || !control}
                    className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStop(id)}
                    disabled={!remoteAssetSet.has(id) || !control}
                    className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
                  >
                    Stop
                  </button>
                  <label className="flex items-center gap-2">
                    <span className="text-xs uppercase text-gray-500">Gain</span>
                    <input
                      type="range"
                      min={-60}
                      max={6}
                      step={1}
                      value={gain[id] ?? 0}
                      onChange={e => handleGain(id, Number(e.target.value))}
                      disabled={!remoteAssetSet.has(id) || !control}
                    />
                    <span className="w-14 text-right text-xs">{(gain[id] ?? 0).toFixed(0)} dB</span>
                  </label>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {manifestEntries.filter(entry => remoteAssetSet.has(entry.id)).length >= 2 && (
        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={handleCrossfade}>Crossfade first two</button>
        </div>
      )}
      <div style={{ marginTop: '0.5rem' }}>
        <label>
          <input type="checkbox" checked={duck} onChange={toggleDucking} /> Enable ducking
        </label>
        <div className="mt-2 space-y-2 text-sm text-gray-600">
          <div>
            Facilitator speech is mixed with the local microphone fallback before driving the
            ducking detector.
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <span className="w-32">Threshold</span>
              <input
                type="range"
                min={-80}
                max={-10}
                step={1}
                value={threshold}
                onChange={e => updateThreshold(Number(e.target.value))}
                disabled={!control}
              />
              <span className="w-16 text-right">{threshold} dBFS</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-32">Reduction</span>
              <input
                type="range"
                min={-24}
                max={0}
                step={1}
                value={reduction}
                onChange={e => updateReduction(Number(e.target.value))}
                disabled={!control}
              />
              <span className="w-16 text-right">{reduction} dB</span>
            </label>
            <div className="text-xs text-gray-500">
              Attack {attackMs} ms · Release {releaseMs} ms
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
