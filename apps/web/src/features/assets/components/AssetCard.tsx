import React, { useMemo, useState } from 'react';

import type { AssetManifest } from '../../control/protocol';
import { GlassCard, type GlassCardGlowColor } from '../../../components/ui/glass-card';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { formatBytes } from '../../../lib/format';

export type AssetStatusVariant = 'loaded' | 'loading' | 'missing' | 'error';

type ManifestEntry = AssetManifest['entries'][number] & { duration?: number };

type ActionTone = 'info' | 'success' | 'error';

type ActionPhase = 'idle' | 'loading' | 'unloading';

export interface AssetActionState {
  phase: ActionPhase;
  tone?: ActionTone;
  message?: string;
}

export interface AssetCardProps {
  entry: ManifestEntry;
  localStatus: Exclude<AssetStatusVariant, 'error'>;
  progress: number;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  isFacilitator?: boolean;
  remoteStatus?: 'loaded' | 'missing';
  remoteIssue?: boolean;
  actionState?: AssetActionState;
  onLoad?: () => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
}

const STATUS_LABELS: Record<AssetStatusVariant, string> = {
  loaded: 'Loaded',
  loading: 'Loading…',
  missing: 'Missing',
  error: 'Error',
};

const STATUS_STYLES: Record<AssetStatusVariant, string> = {
  loaded:
    'bg-emerald-500/15 text-emerald-100 border border-emerald-300/50 shadow-[0_0_20px_-12px_rgba(16,185,129,0.9)]',
  loading:
    'bg-amber-500/15 text-amber-100 border border-amber-300/40 shadow-[0_0_20px_-12px_rgba(245,158,11,0.9)]',
  missing:
    'bg-slate-500/15 text-slate-100 border border-slate-300/40 shadow-[0_0_16px_-12px_rgba(148,163,184,0.75)]',
  error: 'bg-rose-500/20 text-rose-100 border border-rose-300/60 shadow-[0_0_24px_-12px_rgba(244,63,94,0.95)]',
};

const PROGRESS_STYLES: Record<'loaded' | 'loading' | 'missing', string> = {
  loaded: 'from-emerald-400 via-emerald-300 to-emerald-200',
  loading: 'from-amber-400 via-amber-300 to-amber-200',
  missing: 'from-rose-500 via-rose-400 to-rose-300',
};

function formatDuration(seconds?: number) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function WaveformPreview({ accent }: { accent: AssetStatusVariant }) {
  const accentClass =
    accent === 'loaded'
      ? 'text-emerald-300'
      : accent === 'loading'
        ? 'text-sky-300'
        : accent === 'error'
          ? 'text-rose-300'
          : 'text-slate-300';

  return (
    <svg
      viewBox="0 0 480 96"
      className={cn('h-20 w-full select-none text-opacity-70 transition-all duration-500', accentClass)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="480" height="96" rx="24" fill="url(#waveGradient)" opacity="0.4" />
      <path
        d="M0 48 C 20 20, 40 20, 60 48 S 100 76, 120 48 160 20, 180 48 220 76, 240 48 280 20, 300 48 340 76, 360 48 400 20, 420 48 460 76, 480 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <path
        d="M0 60 C 30 30, 60 30, 90 60 S 150 90, 180 60 240 30, 270 60 330 90, 360 60 420 30, 450 60 480 30"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}

interface StatusBadgeProps {
  variant: AssetStatusVariant;
  label?: string;
}

function StatusBadge({ variant, label }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-all duration-300',
        STATUS_STYLES[variant],
      )}
    >
      {label ?? STATUS_LABELS[variant]}
    </span>
  );
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function AssetCard({
  entry,
  localStatus,
  progress,
  isSelected,
  onToggleSelect,
  isFacilitator = false,
  remoteStatus,
  remoteIssue = false,
  actionState,
  onLoad,
  onUnload,
}: AssetCardProps) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const durationLabel = useMemo(() => formatDuration(entry.duration), [entry.duration]);
  const normalizedProgress = clampProgress(progress);
  const cardStatus: AssetStatusVariant = remoteIssue
    ? 'error'
    : localStatus === 'loaded'
      ? 'loaded'
      : localStatus === 'loading'
        ? 'loading'
        : 'missing';
  const glowColor: GlassCardGlowColor = cardStatus === 'loaded' ? 'green' : cardStatus === 'loading' ? 'blue' : 'purple';
  const progressVariant = remoteIssue ? 'missing' : localStatus;
  const cardMessage = actionState?.message;
  const messageTone = actionState?.tone ?? 'info';
  const isActionLoading = actionState?.phase === 'loading';
  const isActionUnloading = actionState?.phase === 'unloading';
  const displayNotes = entry.notes?.trim();
  const remoteReference = entry.url?.trim();
  const remoteVariant: AssetStatusVariant = remoteStatus === 'loaded' ? 'loaded' : remoteIssue ? 'error' : 'missing';
  const remoteLabel = remoteStatus === 'loaded' ? 'Explorer ready' : remoteIssue ? 'Explorer missing' : 'Awaiting explorer';
  const remoteDescription = remoteStatus === 'loaded'
    ? 'Remote device reports this asset is available.'
    : remoteIssue
      ? 'Explorer has reported this asset as missing.'
      : 'Waiting for explorer confirmation.';

  const toggleSelect = () => {
    onToggleSelect(entry.id);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggleSelect(entry.id);
    }
  };

  const onLoadClick: React.MouseEventHandler<HTMLButtonElement> = event => {
    event.stopPropagation();
    onLoad?.();
  };

  const onUnloadClick: React.MouseEventHandler<HTMLButtonElement> = event => {
    event.stopPropagation();
    onUnload?.();
  };

  const progressWidth =
    localStatus === 'loaded'
      ? 100
      : localStatus === 'loading'
        ? Math.max(12, normalizedProgress)
        : normalizedProgress;

  return (
    <GlassCard
      role="button"
      tabIndex={0}
      glowColor={glowColor}
      variant="interactive"
      aria-pressed={isSelected}
      onClick={toggleSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex h-full flex-col gap-6 transition-all duration-500 ease-out',
        isSelected && 'border-white/40 shadow-[0_0_45px_-20px_rgba(56,189,248,0.65)]',
        cardStatus === 'loading' && 'animate-[pulse_3s_ease-in-out_infinite_800ms]',
        remoteIssue && 'border-rose-300/50',
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h4 className="text-2xl font-semibold tracking-tight text-white sm:text-[1.65rem]">
              {entry.title?.trim() || entry.id}
            </h4>
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.35em] text-slate-300/80">
              <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] tracking-[0.4em] text-slate-200/75">ID</span>
              <span className="text-slate-200/90">{entry.id}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-right text-xs text-slate-300">
            <span className="text-sm font-semibold text-slate-100">{formatBytes(entry.bytes)}</span>
            {durationLabel ? <span className="text-[11px] uppercase tracking-wide text-slate-400">{durationLabel}</span> : null}
          </div>
        </div>

        <WaveformPreview accent={cardStatus} />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-200">
            <StatusBadge variant={remoteIssue ? 'error' : localStatus} label={STATUS_LABELS[cardStatus]} />
            <span className="text-slate-400">Local library</span>
            <span className="text-slate-500">{normalizedProgress}% loaded</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-all duration-700 ease-out',
                PROGRESS_STYLES[progressVariant],
              )}
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        </div>

        {displayNotes ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-white/5">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
              <span>Notes</span>
              <Button
                variant="ghost"
                size="sm"
                glass
                className="text-[11px] tracking-wide text-slate-200"
                onClick={event => {
                  event.stopPropagation();
                  setNotesExpanded(open => !open);
                }}
              >
                {notesExpanded ? 'Collapse' : 'Expand'}
              </Button>
            </div>
            <div
              className={cn('mt-3 overflow-hidden text-sm text-slate-200 transition-all duration-500 ease-out', {
                'max-h-64': notesExpanded,
                'max-h-16': !notesExpanded,
              })}
            >
              <p className="whitespace-pre-line leading-relaxed text-slate-100/90">{displayNotes}</p>
            </div>
          </div>
        ) : null}

        {remoteReference ? (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-xs text-amber-100/90 shadow-inner shadow-amber-500/10">
            <div className="font-semibold uppercase tracking-[0.35em] text-amber-200/90">Legacy remote reference</div>
            <a
              href={remoteReference}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block break-all text-sm font-medium text-amber-100 underline decoration-amber-200/60 decoration-dashed underline-offset-4 transition-colors hover:text-amber-50"
              onClick={event => event.stopPropagation()}
            >
              {remoteReference}
            </a>
          </div>
        ) : null}

        {isFacilitator ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-200">
              <span className="uppercase tracking-[0.35em] text-slate-400">Explorer</span>
              <StatusBadge variant={remoteVariant} label={remoteLabel} />
              <span className={cn('text-slate-400', remoteIssue && 'text-rose-200')}>{remoteDescription}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                glass
                loading={isActionLoading}
                disabled={remoteStatus === 'loaded'}
                onClick={onLoadClick}
              >
                Load asset
              </Button>
              <Button
                variant={remoteStatus === 'loaded' ? 'ghost' : 'secondary'}
                size="sm"
                glass
                loading={isActionUnloading}
                disabled={remoteStatus !== 'loaded'}
                onClick={onUnloadClick}
              >
                Unload
              </Button>
            </div>
            {cardMessage ? (
              <div
                className={cn('text-xs transition-all duration-500', {
                  'text-emerald-200': messageTone === 'success',
                  'text-rose-200': messageTone === 'error',
                  'text-slate-200': messageTone === 'info',
                })}
              >
                {cardMessage}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}
