import * as React from 'react';

import { cn } from '../../lib/utils';
import { useSessionStore } from '../../state/session';
import { getAnalyser } from '../../features/audio/context';
import {
  AudioQualityMonitor,
  type AudioQualityMetrics,
} from '../../features/audio/qualityMonitor';

const REFRESH_INTERVAL = 2000;

const QUALITY_LABELS: Record<AudioQualityMetrics['quality'], string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

const QUALITY_THEMES: Record<AudioQualityMetrics['quality'], {
  container: string;
  text: string;
  badge: string;
  dot: string;
  alert: string;
}> = {
  excellent: {
    container: 'border-emerald-400/30 bg-emerald-500/[0.04]',
    text: 'text-emerald-200',
    badge: 'bg-emerald-500/20 text-emerald-100',
    dot: 'bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]',
    alert: 'text-emerald-200',
  },
  good: {
    container: 'border-cyan-400/30 bg-cyan-500/[0.05]',
    text: 'text-cyan-200',
    badge: 'bg-cyan-500/20 text-cyan-100',
    dot: 'bg-cyan-400 shadow-[0_0_0_4px_rgba(34,211,238,0.18)]',
    alert: 'text-cyan-200',
  },
  fair: {
    container: 'border-amber-400/35 bg-amber-500/[0.06]',
    text: 'text-amber-200',
    badge: 'bg-amber-500/20 text-amber-100',
    dot: 'bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.2)]',
    alert: 'text-amber-200',
  },
  poor: {
    container: 'border-rose-500/40 bg-rose-500/[0.08]',
    text: 'text-rose-200',
    badge: 'bg-rose-500/25 text-rose-100',
    dot: 'bg-rose-400 shadow-[0_0_0_4px_rgba(244,63,94,0.25)]',
    alert: 'text-rose-200',
  },
};

interface AudioQualityIndicatorProps {
  className?: string;
}

export function AudioQualityIndicator({ className }: AudioQualityIndicatorProps) {
  const peerConnection = useSessionStore(state => state.peerConnection);
  const [metrics, setMetrics] = React.useState<AudioQualityMetrics | null>(null);
  const [sampleCount, setSampleCount] = React.useState(0);
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);
  const monitorRef = React.useRef<AudioQualityMonitor | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!peerConnection) {
      monitorRef.current = null;
      setMetrics(null);
      setSampleCount(0);
      setLastUpdated(null);
      return;
    }

    setMetrics(null);
    setSampleCount(0);
    setLastUpdated(null);

    const monitor = new AudioQualityMonitor(peerConnection);
    try {
      const analyser = getAnalyser();
      monitor.setAnalyser(analyser);
    } catch {
      // Audio graph may not be initialised yet; metrics will omit audioLevel until available.
    }
    monitorRef.current = monitor;

    let cancelled = false;

    const update = async () => {
      if (!monitorRef.current || cancelled) return;
      try {
        const next = await monitorRef.current.getMetrics();
        if (!cancelled) {
          setMetrics(next);
          setSampleCount(count => count + 1);
          setLastUpdated(Date.now());
        }
      } catch {
        // Ignore transient getStats failures (e.g., when the peer connection is closing).
      }
    };

    void update();
    const interval = window.setInterval(update, REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      monitorRef.current = null;
    };
  }, [peerConnection]);

  const pending = React.useMemo(() => {
    if (!metrics) return true;
    if (sampleCount < 2 && metrics.bitrate === 0 && metrics.packetLoss === 0 && metrics.jitter === 0) {
      return true;
    }
    return false;
  }, [metrics, sampleCount]);

  const qualityKey: keyof typeof QUALITY_THEMES = metrics
    ? pending
      ? 'good'
      : metrics.quality
    : 'good';

  const theme = QUALITY_THEMES[qualityKey];

  const bitrateDisplay = formatBitrate(metrics?.bitrate ?? 0);
  const packetLossDisplay = formatPercent(metrics?.packetLoss ?? null, 2);
  const jitterDisplay = formatMilliseconds(metrics?.jitter ?? null);
  const levelPercent = metrics ? Math.round(Math.min(1, Math.max(0, metrics.audioLevel)) * 100) : null;

  const isDegraded = !!metrics && !pending && (metrics.quality === 'fair' || metrics.quality === 'poor');

  const degradeDetails = React.useMemo(() => {
    if (!metrics || pending) return [] as string[];
    const issues: string[] = [];
    if (metrics.bitrate < 64_000) {
      issues.push('Bitrate below 64 kbps baseline.');
    }
    if (metrics.packetLoss > 3) {
      issues.push('Packet loss exceeding 3% threshold.');
    }
    if (metrics.jitter > 0.05) {
      issues.push(`Jitter high at ${formatMilliseconds(metrics.jitter)}.`);
    }
    if (metrics.audioLevel < 0.08) {
      issues.push('Audio signal is very low—check gain staging.');
    }
    return issues;
  }, [metrics, pending]);

  const statusLabel = !metrics
    ? 'Awaiting statistics'
    : pending
      ? 'Calibrating metrics'
      : QUALITY_LABELS[metrics.quality];

  const helperCopy = !metrics
    ? 'Peer connection not established yet.'
    : pending
      ? 'Collecting baseline audio statistics…'
      : metrics.quality === 'excellent'
        ? 'Audio pipeline is healthy with strong throughput.'
        : metrics.quality === 'good'
          ? 'Nominal link—monitor periodically for changes.'
          : 'Audio quality degraded—review the metrics below.';

  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-slate-950/50 p-4 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)] transition-colors',
        theme.container,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={cn('inline-flex h-3 w-3 rounded-full transition-colors duration-300', theme.dot)} />
          <span className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Audio Link</span>
        </div>
        <span className={cn('rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.32em]', theme.badge)}>
          {metrics ? QUALITY_LABELS[metrics.quality] : 'Idle'}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className={cn('text-2xl font-semibold leading-none', theme.text)}>{statusLabel}</span>
          {typeof levelPercent === 'number' ? (
            <span className="text-sm text-slate-300">Audio level {levelPercent}%</span>
          ) : null}
        </div>
        <p className="text-xs text-slate-300/80">{helperCopy}</p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Metric label="Bitrate" value={bitrateDisplay} helper="Target &gt; 64 kbps" />
        <Metric label="Packet loss" value={packetLossDisplay} helper="Keep under 3%" />
        <Metric label="Jitter" value={jitterDisplay} helper="Keep under 50 ms" />
        <Metric
          label="Signal"
          value={typeof levelPercent === 'number' ? `${levelPercent}%` : '—'}
          helper="Post-mix audio level"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[0.65rem] uppercase tracking-[0.3em] text-slate-500">
        <span>Auto-refresh every 2s</span>
        <span>Last update {lastUpdatedLabel}</span>
      </div>

      {isDegraded && degradeDetails.length ? (
        <div
          className={cn(
            'mt-5 rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed',
            metrics.quality === 'poor' ? 'text-rose-100' : 'text-amber-100',
          )}
        >
          <p className={cn('mb-2 font-semibold uppercase tracking-[0.32em]', theme.alert)}>Diagnostics</p>
          <ul className="space-y-2 text-slate-200">
            {degradeDetails.map(issue => (
              <li key={issue} className="flex items-start gap-2">
                <span className="mt-[2px] inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-80" />
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
      <p className="text-[0.65rem] uppercase tracking-[0.28em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-[0.7rem] text-slate-300/80">{helper}</p>
    </div>
  );
}

function formatBitrate(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '—';
  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  }
  return `${Math.round(bps / 1000)} kbps`;
}

function formatPercent(value: number | null, fractionDigits: number): string {
  if (!Number.isFinite(value ?? NaN) || value === null || value < 0) return '—';
  return `${value.toFixed(fractionDigits)}%`;
}

function formatMilliseconds(seconds: number | null): string {
  if (!Number.isFinite(seconds ?? NaN) || seconds === null) return '—';
  return `${Math.round(seconds * 1000)} ms`;
}

export default AudioQualityIndicator;
