import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import * as Slider from '@radix-ui/react-slider';
import {
  Play,
  Square,
  Volume2,
  VolumeX,
  Sparkles,
  Disc3,
  Volume1,
} from 'lucide-react';

import {
  GlassCard,
  type GlassCardGlowColor,
} from '../../../components/ui/glass-card';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { useSessionStore } from '../../../state/session';
import { playAt, setGain, stop } from '../scheduler';
import { VUMeter } from './VUMeter';

const MIN_GAIN_DB = -60;
const MAX_GAIN_DB = 6;
const SILENCE_GAIN_DB = -90;

const MotionGlassCard = motion(GlassCard);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clampGain = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(clamp(value, MIN_GAIN_DB, MAX_GAIN_DB) * 10) / 10;
};
const clampPan = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(clamp(value, -1, 1) * 100) / 100;
};

const formatDb = (value: number, muted: boolean) => {
  if (muted) return '-∞ dB';
  const rounded = Math.round(value * 10) / 10;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toFixed(1)} dB`;
};

const describePan = (value: number) => {
  const abs = Math.abs(value);
  if (abs < 0.05) return 'Center';
  const amount = Math.round(abs * 100);
  return value < 0 ? `L${amount}` : `R${amount}`;
};

const STATUS_THEME: Record<
  'ready' | 'pending' | 'missing',
  { badge: string; dot: string; label: string }
> = {
  ready: {
    badge: 'bg-emerald-500/15 text-emerald-200',
    dot: 'bg-emerald-400',
    label: 'Ready',
  },
  pending: {
    badge: 'bg-amber-500/15 text-amber-200',
    dot: 'bg-amber-300',
    label: 'Pending',
  },
  missing: {
    badge: 'bg-rose-500/15 text-rose-200',
    dot: 'bg-rose-400',
    label: 'Missing',
  },
};

const formatBytes = (bytes?: number) => {
  if (!Number.isFinite(bytes) || bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

export interface MixerChannelProps {
  /** Asset identifier used when calling the scheduler helpers. */
  assetId: string;
  /** Optional friendly name shown at the top of the strip. */
  assetName?: string;
  /** Optional descriptive notes to show alongside the asset metadata. */
  notes?: string;
  /** Approximate size of the asset in bytes. */
  bytes?: number;
  /** Override of the asset status indicator. */
  status?: 'missing' | 'ready' | 'pending';
  /** Current gain value in dB. When omitted the component manages its own state. */
  gainDb?: number;
  /** Initial gain in dB used when the component is uncontrolled. */
  initialGainDb?: number;
  /** RMS level in dBFS for the VU meter. */
  meterRmsDb?: number;
  /** Peak level in dBFS for the VU meter. */
  meterPeakDb?: number;
  /** Indicates if the channel is muted. */
  isMuted?: boolean;
  /** Indicates if the channel is soloed. */
  isSolo?: boolean;
  /** Explicit active highlight override. Defaults to the playing state. */
  isActive?: boolean;
  /** Indicates whether the channel is currently playing. */
  isPlaying?: boolean;
  /** Stereo pan position in the -1 (left) to 1 (right) range. */
  pan?: number;
  /** Toggle to render the optional pan control section. */
  showPan?: boolean;
  /** Invoked when the gain slider changes. */
  onGainChange?: (value: number) => void;
  /** Invoked when the mute state toggles. */
  onMuteChange?: (muted: boolean) => void;
  /** Invoked when the solo state toggles. */
  onSoloChange?: (solo: boolean) => void;
  /** Invoked after playback is requested. */
  onPlay?: () => void;
  /** Invoked after playback stop is requested. */
  onStop?: () => void;
  /** Invoked when the pan control changes. */
  onPanChange?: (pan: number) => void;
  /** Additional class name passed to the underlying GlassCard. */
  className?: string;
  /** Disables all interactive controls when true. */
  disabled?: boolean;
}

export function MixerChannel({
  assetId,
  assetName,
  notes,
  bytes,
  status,
  gainDb: gainDbProp,
  initialGainDb = 0,
  meterRmsDb,
  meterPeakDb,
  isMuted: isMutedProp,
  isSolo: isSoloProp,
  isActive: isActiveProp,
  isPlaying: isPlayingProp,
  pan: panProp,
  showPan = true,
  onGainChange,
  onMuteChange,
  onSoloChange,
  onPlay,
  onStop,
  onPanChange,
  className,
  disabled = false,
}: MixerChannelProps) {
  const manifestEntry = useSessionStore(useCallback(state => state.manifest[assetId], [assetId]));
  const peerClock = useSessionStore(state => state.peerClock);
  const assetLoaded = useSessionStore(state => state.assets.has(assetId));

  const [internalGain, setInternalGain] = useState(() => clampGain(gainDbProp ?? initialGainDb));
  const [internalMuted, setInternalMuted] = useState(isMutedProp ?? false);
  const [internalSolo, setInternalSolo] = useState(isSoloProp ?? false);
  const [internalPlaying, setInternalPlaying] = useState(isPlayingProp ?? false);
  const [internalPan, setInternalPan] = useState(() => clampPan(panProp ?? 0));

  useEffect(() => {
    if (typeof gainDbProp === 'number') {
      setInternalGain(clampGain(gainDbProp));
    }
  }, [gainDbProp]);

  useEffect(() => {
    if (typeof isMutedProp === 'boolean') {
      setInternalMuted(isMutedProp);
    }
  }, [isMutedProp]);

  useEffect(() => {
    if (typeof isSoloProp === 'boolean') {
      setInternalSolo(isSoloProp);
    }
  }, [isSoloProp]);

  useEffect(() => {
    if (typeof isPlayingProp === 'boolean') {
      setInternalPlaying(isPlayingProp);
    }
  }, [isPlayingProp]);

  useEffect(() => {
    if (typeof panProp === 'number') {
      setInternalPan(clampPan(panProp));
    }
  }, [panProp]);

  const gainDb = gainDbProp !== undefined ? clampGain(gainDbProp) : internalGain;
  const muted = isMutedProp !== undefined ? isMutedProp : internalMuted;
  const solo = isSoloProp !== undefined ? isSoloProp : internalSolo;
  const playing = isPlayingProp !== undefined ? isPlayingProp : internalPlaying;
  const pan = panProp !== undefined ? clampPan(panProp) : internalPan;
  const active = isActiveProp ?? playing;
  const resolvedStatus = status ?? (assetLoaded ? 'ready' : 'pending');
  const statusTheme = STATUS_THEME[resolvedStatus];
  const controlsDisabled = disabled || resolvedStatus !== 'ready' || !assetLoaded;

  useEffect(() => {
    const targetGain = muted ? SILENCE_GAIN_DB : gainDb;
    setGain(assetId, targetGain);
  }, [assetId, gainDb, muted]);

  const handleGainChange = useCallback(
    (value: number[]) => {
      if (controlsDisabled) return;
      const next = clampGain(value[0] ?? gainDb);
      if (gainDbProp === undefined) {
        setInternalGain(next);
      }
      onGainChange?.(next);
    },
    [controlsDisabled, gainDb, gainDbProp, onGainChange]
  );

  const handleMuteToggle = useCallback(() => {
    if (controlsDisabled) return;
    const next = !muted;
    if (isMutedProp === undefined) {
      setInternalMuted(next);
    }
    onMuteChange?.(next);
  }, [controlsDisabled, isMutedProp, muted, onMuteChange]);

  const handleSoloToggle = useCallback(() => {
    if (controlsDisabled) return;
    const next = !solo;
    if (isSoloProp === undefined) {
      setInternalSolo(next);
    }
    onSoloChange?.(next);
  }, [controlsDisabled, isSoloProp, solo, onSoloChange]);

  const handlePlay = useCallback(() => {
    if (controlsDisabled || !assetLoaded) return;
    if (!peerClock) {
      console.warn('MixerChannel: cannot start playback without a peer clock.');
      return;
    }
    try {
      playAt(assetId, peerClock, undefined, 0, muted ? SILENCE_GAIN_DB : gainDb);
      if (isPlayingProp === undefined) {
        setInternalPlaying(true);
      }
      onPlay?.();
    } catch (error) {
      console.error('MixerChannel: failed to start playback', error);
    }
  }, [assetId, assetLoaded, controlsDisabled, gainDb, isPlayingProp, muted, onPlay, peerClock]);

  const handleStop = useCallback(() => {
    if (controlsDisabled) return;
    stop(assetId);
    if (isPlayingProp === undefined) {
      setInternalPlaying(false);
    }
    onStop?.();
  }, [assetId, controlsDisabled, isPlayingProp, onStop]);

  const handlePanChange = useCallback(
    (value: number[]) => {
      if (controlsDisabled) return;
      const next = clampPan(value[0] ?? pan);
      if (panProp === undefined) {
        setInternalPan(next);
      }
      onPanChange?.(next);
    },
    [controlsDisabled, onPanChange, pan, panProp]
  );

  const handlePanReset = useCallback(() => {
    if (controlsDisabled) return;
    if (panProp === undefined) {
      setInternalPan(0);
    }
    onPanChange?.(0);
  }, [controlsDisabled, onPanChange, panProp]);

  const channelName = useMemo(() => {
    if (assetName) return assetName;
    if (manifestEntry?.title) return manifestEntry.title;
    return manifestEntry?.id ?? assetId;
  }, [assetId, assetName, manifestEntry]);

  const displayGain = formatDb(gainDb, muted);
  const panLabel = describePan(pan);
  const bytesLabel = formatBytes(bytes);

  const glowColor: GlassCardGlowColor = solo ? 'green' : active ? 'blue' : 'purple';

  const meterRms = muted ? MIN_GAIN_DB : meterRmsDb ?? gainDb;
  const meterPeak = muted ? MIN_GAIN_DB : meterPeakDb ?? meterRms;

  return (
    <MotionGlassCard
      layout
      glowColor={glowColor}
      variant="elevated"
      animate={{
        scale: active ? 1.02 : 1,
        opacity: muted ? 0.65 : 1,
        boxShadow: solo
          ? '0 0 45px rgba(34,197,94,0.35)'
          : active
            ? '0 18px 40px -28px rgba(59,130,246,0.6)'
            : undefined,
      }}
      transition={{ type: 'spring', stiffness: 280, damping: 32, mass: 0.6 }}
      className={cn(
        'flex w-60 flex-col gap-5 p-4 sm:w-64 sm:p-6',
        'bg-slate-950/70',
        'border-white/10 transition-all duration-300 ease-out',
        active && 'border-white/30',
        solo && 'ring-2 ring-emerald-400/70',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">Asset</span>
          <span className="text-base font-semibold text-white sm:text-lg">{channelName}</span>
        </div>
        <div
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] uppercase tracking-[0.25em]',
            statusTheme.badge,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', statusTheme.dot)} />
          {statusTheme.label}
        </div>
      </div>
      {(notes || bytesLabel) && (
        <div className="flex flex-col gap-1 text-xs text-slate-400">
          {notes ? <p className="leading-relaxed">{notes}</p> : null}
          {bytesLabel ? (
            <p className="font-mono uppercase tracking-[0.3em] text-slate-500">{bytesLabel}</p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-6">
        <div className="flex items-end gap-5">
          <div className="flex flex-col items-center gap-2">
            <VUMeter
              rmsDb={meterRms}
              peakDb={meterPeak}
              minDb={MIN_GAIN_DB}
              maxDb={MAX_GAIN_DB}
              muted={muted}
              className="h-40 w-8"
            />
            <span className="text-[0.65rem] uppercase tracking-[0.4em] text-slate-500">VU</span>
          </div>

          <div className="flex flex-1 flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[0.65rem] uppercase tracking-[0.4em] text-slate-500">Gain</span>
              <span className="font-mono text-lg text-white sm:text-xl">{displayGain}</span>
            </div>
            <Slider.Root
              value={[gainDb]}
              min={MIN_GAIN_DB}
              max={MAX_GAIN_DB}
              step={0.5}
              orientation="vertical"
              onValueChange={handleGainChange}
              className="relative flex h-44 w-12 touch-none select-none flex-col items-center"
              disabled={controlsDisabled}
            >
              <div className="relative flex h-full w-1.5 flex-1 items-center justify-center">
                <Slider.Track className="relative h-full w-full overflow-hidden rounded-full bg-slate-800/80">
                  <Slider.Range className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-emerald-400 via-sky-500 to-purple-400 shadow-[0_0_18px_rgba(56,189,248,0.4)]" />
                </Slider.Track>
                <div className="absolute inset-y-0 -left-3 flex w-2 flex-col justify-between py-2">
                  <span className="h-px w-full bg-white/20" />
                  <span className="h-px w-full bg-white/20" />
                  <span className="h-px w-full bg-white/20" />
                </div>
              </div>
              <Slider.Thumb
                aria-label="Gain"
                className="relative mt-3 block h-5 w-11 -translate-y-1/2 rounded-full border border-white/40 bg-slate-900/95 shadow-[0_10px_25px_-12px_rgba(15,23,42,0.8)] outline-none transition-all duration-200 hover:border-white/70 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <div className="pointer-events-none absolute inset-x-2 top-1 h-px bg-white/40" />
                <div className="pointer-events-none absolute inset-x-3 bottom-1 h-px bg-white/20" />
              </Slider.Thumb>
            </Slider.Root>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            glass
            onClick={handleMuteToggle}
            disabled={controlsDisabled}
            className={cn(
              'justify-start gap-2 px-4 py-2 text-xs uppercase tracking-[0.3em]',
              muted
                ? 'border-white/20 bg-white/10 text-white shadow-[0_0_25px_rgba(148,163,184,0.2)]'
                : 'text-slate-200'
            )}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            Mute
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            glass
            onClick={handleSoloToggle}
            disabled={controlsDisabled}
            className={cn(
              'justify-start gap-2 px-4 py-2 text-xs uppercase tracking-[0.3em]',
              solo
                ? 'border border-emerald-400/50 bg-emerald-500/15 text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.35)]'
                : 'text-slate-200'
            )}
          >
            <Sparkles className="h-4 w-4" />
            Solo
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            size="sm"
            variant="primary"
            glass
            disabled={controlsDisabled}
            onClick={handlePlay}
            className="gap-2 px-4 py-2 text-xs uppercase tracking-[0.3em]"
          >
            <Play className="h-4 w-4" />
            Play
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            glass
            disabled={controlsDisabled || !playing}
            onClick={handleStop}
            className="gap-2 px-4 py-2 text-xs uppercase tracking-[0.3em]"
          >
            <Square className="h-4 w-4" />
            Stop
          </Button>
        </div>

        {showPan && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.35em] text-slate-500">
              <span className="flex items-center gap-1 text-slate-500">
                <Volume1 className="h-3 w-3" />
                L
              </span>
              <span className="font-medium text-slate-300">{panLabel}</span>
              <span className="flex items-center gap-1 text-slate-500">
                R
                <Disc3 className="h-3 w-3" />
              </span>
            </div>
            <Slider.Root
              value={[pan]}
              min={-1}
              max={1}
              step={0.01}
              onValueChange={handlePanChange}
              onValueCommit={handlePanChange}
              orientation="horizontal"
              className="relative flex h-10 w-full select-none items-center"
              onDoubleClick={handlePanReset}
              disabled={controlsDisabled}
            >
              <Slider.Track className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
                <Slider.Range className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400 shadow-[0_0_18px_rgba(59,130,246,0.35)]" />
              </Slider.Track>
              <Slider.Thumb
                aria-label="Pan"
                className="block h-5 w-5 -translate-y-0.5 rounded-full border border-white/40 bg-slate-950/95 shadow-[0_10px_25px_-12px_rgba(15,23,42,0.7)] outline-none transition-all duration-200 hover:border-white/70 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              />
            </Slider.Root>
            <span className="text-[0.6rem] text-slate-500">
              Double-click the track to reset pan to center.
            </span>
          </div>
        )}
      </div>
    </MotionGlassCard>
  );
}

export default MixerChannel;
