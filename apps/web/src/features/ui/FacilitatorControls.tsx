import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
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

  const inlineButtonClass =
    'rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';

  const statusTone = (phase?: EntryStatusPhase) => {
    switch (phase) {
      case 'loading':
      case 'unloading':
        return 'text-xs font-medium text-sky-600';
      case 'success':
        return 'text-xs font-medium text-emerald-600';
      case 'error':
        return 'text-xs font-medium text-rose-600';
      default:
        return 'text-xs text-slate-500';
    }
  };

  const loadedEntries = manifestEntries.filter(entry => remoteAssetSet.has(entry.id));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-slate-50/70">
        <CardTitle>Facilitator console</CardTitle>
        <CardDescription>
          Curate manifest entries, trigger playback on the explorer, and tune the automatic ducking envelope.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm">
          <ManifestEditor />
        </div>
        <ul className="space-y-4">
          {manifestEntries.map(entry => {
            const id = entry.id;
            const entryStatus = status[id];
            const canLoad = !remoteAssetSet.has(id) && entryStatus?.phase !== 'loading';
            const canUnload = remoteAssetSet.has(id) && entryStatus?.phase !== 'unloading';
            const explorerStatus = remoteAssetSet.has(id)
              ? 'Explorer reports asset is loaded.'
              : remoteMissingSet.has(id)
                ? 'Explorer reports asset is missing.'
                : 'Explorer has not confirmed receipt yet.';

            return (
              <li key={id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{id}</div>
                    <div className="text-xs text-slate-500">
                      {entry.bytes ? `${entry.bytes.toLocaleString()} bytes` : 'Unknown size'}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{explorerStatus}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoad(id, entry.sha256, entry.bytes)}
                      disabled={!canLoad || !control}
                      className={inlineButtonClass}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnload(id)}
                      disabled={!canUnload || !control}
                      className={inlineButtonClass}
                    >
                      Unload
                    </button>
                  </div>
                </div>
                {entryStatus?.message && <div className={statusTone(entryStatus.phase)}>{entryStatus.message}</div>}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                    <button
                      type="button"
                      onClick={() => handlePlay(id)}
                      disabled={!remoteAssetSet.has(id) || !control}
                      className={inlineButtonClass}
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStop(id)}
                      disabled={!remoteAssetSet.has(id) || !control}
                      className={inlineButtonClass}
                    >
                      Stop
                    </button>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                      Remote {remoteAssetSet.has(id) ? 'ready' : 'pending'}
                    </span>
                  </div>
                  <label className="flex w-full flex-col gap-2 text-xs text-slate-500 sm:max-w-md">
                    <span className="font-semibold uppercase tracking-wide text-slate-400">Gain</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={-60}
                        max={6}
                        step={1}
                        value={gain[id] ?? 0}
                        onChange={e => handleGain(id, Number(e.target.value))}
                        disabled={!remoteAssetSet.has(id) || !control}
                        className="h-1.5 flex-1 appearance-none rounded-full bg-slate-200 accent-blue-600 disabled:opacity-50"
                      />
                      <span className="w-16 text-right text-xs font-semibold text-slate-600">
                        {(gain[id] ?? 0).toFixed(0)} dB
                      </span>
                    </div>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
        {loadedEntries.length >= 2 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-700">Quick crossfade</div>
              <div className="text-xs text-slate-500">
                Trigger a 2-second crossfade between the first two loaded assets on the explorer.
              </div>
            </div>
            <Button
              type="button"
              onClick={handleCrossfade}
              className="bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-600"
            >
              Crossfade now
            </Button>
          </div>
        )}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-700">Automatic ducking</div>
              <div className="text-xs text-slate-500">
                Remote speech is mixed with the local microphone fallback before driving ducking.
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={duck}
                onChange={toggleDucking}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Enable ducking
            </label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Threshold
              <input
                type="range"
                min={-80}
                max={-10}
                step={1}
                value={threshold}
                onChange={e => updateThreshold(Number(e.target.value))}
                disabled={!control}
                className="h-1.5 appearance-none rounded-full bg-slate-200 accent-emerald-600 disabled:opacity-50"
              />
              <span className="text-sm font-medium text-slate-600">{threshold} dBFS</span>
            </label>
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Reduction
              <input
                type="range"
                min={-24}
                max={0}
                step={1}
                value={reduction}
                onChange={e => updateReduction(Number(e.target.value))}
                disabled={!control}
                className="h-1.5 appearance-none rounded-full bg-slate-200 accent-emerald-600 disabled:opacity-50"
              />
              <span className="text-sm font-medium text-slate-600">{reduction} dB</span>
            </label>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            Attack {attackMs} ms · Release {releaseMs} ms
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
