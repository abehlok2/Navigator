import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../../../components/ui/glass-card';
import { useSessionStore } from '../../../state/session';
import { getAnalyser, getMasterGain } from '../../audio/context';
import MixerChannel from './MixerChannel';

const MIN_METER_DB = -60;
const MAX_METER_DB = 6;
const PRESET_STORAGE_KEY = 'facilitator-mixer-presets';

interface MixerPreset {
  id: string;
  name: string;
  masterGainDb: number;
  duckingEnabled: boolean;
  channelGains: Record<string, number>;
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function gainToDb(gain: number): number {
  if (gain <= 0) return MIN_METER_DB;
  return 20 * Math.log10(gain);
}

function normaliseMeter(db: number) {
  const clamped = Math.max(MIN_METER_DB, Math.min(MAX_METER_DB, db));
  return (clamped - MIN_METER_DB) / (MAX_METER_DB - MIN_METER_DB);
}

function loadPresets(): MixerPreset[] {
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MixerPreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => typeof item.id === 'string' && typeof item.name === 'string');
  } catch {
    return [];
  }
}

function savePresets(presets: MixerPreset[]) {
  try {
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // ignore persistence errors
  }
}

const DEFAULT_DUCKING = {
  thresholdDb: -40,
  reduceDb: -12,
  attackMs: 10,
  releaseMs: 300,
};

export default function FacilitatorMixerPanel() {
  const { manifest, remoteAssets, remoteMissing, control } = useSessionStore(state => ({
    manifest: state.manifest,
    remoteAssets: state.remoteAssets,
    remoteMissing: state.remoteMissing,
    control: state.control,
  }));

  const [masterGainDb, setMasterGainDb] = useState(() => gainToDb(getMasterGain().gain.value));
  const [channelGains, setChannelGains] = useState<Record<string, number>>({});
  const [duckingEnabled, setDuckingEnabled] = useState(false);
  const [presets, setPresets] = useState<MixerPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [meters, setMeters] = useState(() => ({ left: MIN_METER_DB, right: MIN_METER_DB }));

  const loadedChannels = useMemo(() => {
    const ready = Array.from(remoteAssets)
      .map(id => manifest[id])
      .filter((entry): entry is typeof manifest[string] => Boolean(entry));
    return ready.sort((a, b) => a.id.localeCompare(b.id));
  }, [manifest, remoteAssets]);

  const statusById = useMemo(() => {
    const missing = remoteMissing;
    return (id: string): 'ready' | 'pending' | 'missing' => {
      if (remoteAssets.has(id)) return 'ready';
      if (missing.has(id)) return 'missing';
      return 'pending';
    };
  }, [remoteAssets, remoteMissing]);

  useEffect(() => {
    setChannelGains(prev => {
      const next: Record<string, number> = {};
      loadedChannels.forEach(entry => {
        next[entry.id] = prev[entry.id] ?? 0;
      });
      return next;
    });
  }, [loadedChannels]);

  useEffect(() => {
    const stored = loadPresets();
    setPresets(stored);
    setSelectedPresetId(stored.length ? stored[0].id : null);
  }, []);

  useEffect(() => {
    let raf: number | null = null;
    const analyser = getAnalyser();
    const buffer = new Float32Array(analyser.fftSize);
    const update = () => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const sample = buffer[i];
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const db = 20 * Math.log10(Math.max(rms, 1e-6));
      const clamped = Math.max(MIN_METER_DB, Math.min(MAX_METER_DB, db));
      setMeters(prev => {
        if (Math.abs(prev.left - clamped) < 0.5 && Math.abs(prev.right - clamped) < 0.5) {
          return prev;
        }
        return { left: clamped, right: clamped };
      });
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  const applyMasterGain = useCallback(
    (db: number) => {
      const node = getMasterGain();
      node.gain.setValueAtTime(dbToGain(db), node.context.currentTime);
    },
    [],
  );

  const handleMasterGainChange = useCallback(
    (value: number) => {
      setMasterGainDb(value);
      applyMasterGain(value);
    },
    [applyMasterGain],
  );

  const handleChannelGainChange = useCallback(
    (id: string, value: number) => {
      setChannelGains(prev => ({ ...prev, [id]: value }));
      control?.setGain({ id, gainDb: value }).catch(() => {});
    },
    [control],
  );

  const handlePlayChannel = useCallback(
    (id: string) => {
      control?.play({ id }).catch(() => {});
    },
    [control],
  );

  const handleStopChannel = useCallback(
    (id: string) => {
      control?.stop({ id }).catch(() => {});
    },
    [control],
  );

  const handlePlayAll = useCallback(() => {
    loadedChannels.forEach(entry => {
      control?.play({ id: entry.id }).catch(() => {});
    });
  }, [control, loadedChannels]);

  const handleStopAll = useCallback(() => {
    loadedChannels.forEach(entry => {
      control?.stop({ id: entry.id }).catch(() => {});
    });
  }, [control, loadedChannels]);

  const handleEmergencyStop = useCallback(() => {
    handleStopAll();
  }, [handleStopAll]);

  const toggleDucking = useCallback(() => {
    const next = !duckingEnabled;
    setDuckingEnabled(next);
    control
      ?.ducking({
        enabled: next,
        thresholdDb: DEFAULT_DUCKING.thresholdDb,
        reduceDb: DEFAULT_DUCKING.reduceDb,
        attackMs: DEFAULT_DUCKING.attackMs,
        releaseMs: DEFAULT_DUCKING.releaseMs,
      })
      .catch(() => {});
  }, [control, duckingEnabled]);

  const handleSavePreset = useCallback(() => {
    const name = window.prompt('Preset name');
    if (!name) return;
    const preset: MixerPreset = {
      id: `${Date.now()}`,
      name,
      masterGainDb,
      duckingEnabled,
      channelGains,
    };
    setPresets(prev => {
      const next = [preset, ...prev];
      savePresets(next);
      return next;
    });
    setSelectedPresetId(preset.id);
  }, [channelGains, duckingEnabled, masterGainDb]);

  const handleLoadPreset = useCallback(() => {
    if (!selectedPresetId) return;
    const preset = presets.find(item => item.id === selectedPresetId);
    if (!preset) return;
    setMasterGainDb(preset.masterGainDb);
    applyMasterGain(preset.masterGainDb);
    setDuckingEnabled(preset.duckingEnabled);
    control
      ?.ducking({
        enabled: preset.duckingEnabled,
        thresholdDb: DEFAULT_DUCKING.thresholdDb,
        reduceDb: DEFAULT_DUCKING.reduceDb,
        attackMs: DEFAULT_DUCKING.attackMs,
        releaseMs: DEFAULT_DUCKING.releaseMs,
      })
      .catch(() => {});
    setChannelGains(prev => {
      const next: Record<string, number> = { ...prev };
      Object.entries(preset.channelGains).forEach(([id, value]) => {
        next[id] = value;
      });
      return next;
    });
    Object.entries(preset.channelGains).forEach(([id, value]) => {
      control?.setGain({ id, gainDb: value }).catch(() => {});
    });
  }, [applyMasterGain, control, presets, selectedPresetId]);

  const disableTransport = control == null || !loadedChannels.length;

  return (
    <div className="space-y-6">
      <GlassCard variant="elevated" glowColor="purple">
        <GlassCardHeader className="flex flex-col gap-4 border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <GlassCardTitle className="text-xl text-white">Master mix</GlassCardTitle>
            <GlassCardDescription className="text-slate-200/80">
              Monitor explorer output and adjust overall level and ducking envelope.
            </GlassCardDescription>
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-100">
            <input
              type="checkbox"
              checked={duckingEnabled}
              onChange={toggleDucking}
              className="h-5 w-5 rounded border-white/30 bg-slate-900 text-emerald-400 focus:ring-emerald-500"
            />
            Enable ducking
          </label>
        </GlassCardHeader>
        <GlassCardContent className="gap-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-inner">
              <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-slate-300">
                <span>Master Gain</span>
                <span className="text-slate-100">{masterGainDb.toFixed(1)} dB</span>
              </div>
              <input
                type="range"
                min={-40}
                max={6}
                step={0.5}
                value={masterGainDb}
                onChange={event => handleMasterGainChange(Number(event.target.value))}
                className="h-1.5 w-full appearance-none rounded-full bg-slate-800 accent-purple-400"
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <div className="mb-4 text-xs uppercase tracking-wide text-slate-300">Master Output</div>
              <div className="space-y-3">
                {(['L', 'R'] as const).map(channel => {
                  const value = meters[channel === 'L' ? 'left' : 'right'];
                  return (
                    <div key={channel} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
                        <span>{channel}</span>
                        <span className="text-slate-200">{value.toFixed(1)} dBFS</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-400"
                          style={{ width: `${Math.round(normaliseMeter(value) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={handlePlayAll}
              disabled={disableTransport}
            >
              Play all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleStopAll}
              disabled={disableTransport}
            >
              Stop all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={handleEmergencyStop}
              disabled={disableTransport}
              className="uppercase tracking-wide"
            >
              Emergency stop
            </Button>
            {!control && (
              <span className="text-xs text-amber-300">
                Control channel not connected. Transport commands are unavailable.
              </span>
            )}
          </div>
        </GlassCardContent>
      </GlassCard>

      <GlassCard variant="elevated" glowColor="blue">
        <GlassCardHeader className="border-white/10 pb-4">
          <GlassCardTitle className="text-xl text-white">Mixer channels</GlassCardTitle>
          <GlassCardDescription className="text-slate-200/80">
            One strip per explorer asset currently loaded and ready for playback.
          </GlassCardDescription>
        </GlassCardHeader>
        <GlassCardContent>
          {loadedChannels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-slate-900/40 p-8 text-center text-sm text-slate-300">
              No explorer assets are loaded. Load assets to begin mixing.
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto pr-1">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {loadedChannels.map(entry => (
                  <MixerChannel
                    key={entry.id}
                    assetId={entry.id}
                    assetName={entry.title ?? entry.id}
                    notes={entry.notes}
                    bytes={entry.bytes}
                    gainDb={channelGains[entry.id] ?? 0}
                    status={statusById(entry.id)}
                    onGainChange={value => handleChannelGainChange(entry.id, value)}
                    onPlay={() => handlePlayChannel(entry.id)}
                    onStop={() => handleStopChannel(entry.id)}
                    disabled={!control}
                  />
                ))}
              </div>
            </div>
          )}
        </GlassCardContent>
      </GlassCard>

      <GlassCard variant="default" glowColor="green">
        <GlassCardHeader className="border-white/10 pb-4">
          <GlassCardTitle className="text-lg text-white">Mix presets</GlassCardTitle>
          <GlassCardDescription className="text-slate-200/80">
            Capture channel and master gains to quickly recall balancing decisions.
          </GlassCardDescription>
        </GlassCardHeader>
        <GlassCardContent className="gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex flex-1 flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
              Preset
              <select
                value={selectedPresetId ?? ''}
                onChange={event => setSelectedPresetId(event.target.value || null)}
                className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white shadow-inner focus:border-emerald-400 focus:outline-none"
              >
                {presets.length === 0 && <option value="">No presets saved</option>}
                {presets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              <Button type="button" size="sm" variant="secondary" onClick={handleSavePreset}>
                Save current mix
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={handleLoadPreset}
                disabled={!selectedPresetId}
              >
                Load preset
              </Button>
            </div>
          </div>
        </GlassCardContent>
      </GlassCard>
    </div>
  );
}
