import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';

import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
  type GlassCardGlowColor,
} from '../../../components/ui/glass-card';
import { formatBytes } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import { useSessionStore } from '../../../state/session';
import { VUMeter } from '../../audio/components/VUMeter';
import ConnectionQualityGraph, {
  type ConnectionQualitySample,
} from './ConnectionQualityGraph';
import type { TelemetryLevels } from '../../control/protocol';

const AUTO_REFRESH_INTERVAL = 500;

interface TelemetryParticipant {
  id: string;
  name?: string;
  role?: string;
  connected?: boolean;
}

type DashboardTelemetry = TelemetryLevels &
  Partial<{
    latencyMs: number;
    jitterMs: number;
    packetLoss: number;
    qualityTimeline: ConnectionQualitySample[];
    sessionStart: number;
    bytesSent: number;
    bytesReceived: number;
    participants: TelemetryParticipant[];
    cpuUsage: number;
    memoryUsage: number;
    audioBufferHealth: number;
    inputPeakDb: number;
    programPeakDb: number;
  }>;

const PANEL_GLOW: Record<string, GlassCardGlowColor> = {
  connection: 'blue',
  audio: 'purple',
  session: 'green',
  system: 'purple',
};

const PANEL_BACKGROUND =
  'border-white/10 bg-slate-950/40 backdrop-blur-xl shadow-[0_28px_60px_-35px_rgba(15,23,42,0.9)]';

export default function TelemetryDashboard() {
  const telemetry = useSessionStore(state => state.telemetry) as DashboardTelemetry | null;
  const [refreshTick, setRefreshTick] = useState(0);
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshTick(tick => (tick + 1) % Number.MAX_SAFE_INTEGER);
    }, AUTO_REFRESH_INTERVAL);
    return () => window.clearInterval(timer);
  }, []);

  const qualityTimeline = telemetry?.qualityTimeline ?? [];
  const latencyMs = telemetry?.latencyMs ?? null;
  const jitterMs = telemetry?.jitterMs ?? null;
  const packetLoss = telemetry?.packetLoss ?? null;
  const sessionStart = telemetry?.sessionStart ?? null;
  const bytesSent = telemetry?.bytesSent ?? null;
  const bytesReceived = telemetry?.bytesReceived ?? null;
  const participants = telemetry?.participants ?? [];
  const cpuUsage = telemetry?.cpuUsage ?? null;
  const memoryUsage = telemetry?.memoryUsage ?? null;
  const audioBufferHealth = telemetry?.audioBufferHealth ?? null;

  const micLevelDb = normaliseDb(telemetry?.mic);
  const programLevelDb = normaliseDb(telemetry?.program);
  const micPeakDb = normaliseDb(telemetry?.inputPeakDb ?? telemetry?.mic);
  const programPeakDb = normaliseDb(telemetry?.programPeakDb ?? telemetry?.program);

  const sessionDurationLabel = useMemo(() => {
    if (!sessionStart) return '—';
    const durationMs = Math.max(0, Date.now() - sessionStart);
    return formatDuration(durationMs / 1000);
  }, [sessionStart, refreshTick]);

  const transferredBytes = useMemo(() => {
    if (bytesSent == null && bytesReceived == null) return null;
    const sent = Math.max(0, bytesSent ?? 0);
    const received = Math.max(0, bytesReceived ?? 0);
    return {
      total: sent + received,
      sent,
      received,
    };
  }, [bytesSent, bytesReceived]);

  const participantSummary = useMemo(() => {
    if (!participants.length) return 'Awaiting participants';
    const connected = participants.filter(participant => participant.connected !== false);
    return `${connected.length}/${participants.length} connected`;
  }, [participants]);

  const togglePanel = (panelId: string) => {
    setCollapsedPanels(state => ({ ...state, [panelId]: !state[panelId] }));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DashboardPanel
        id="connection"
        title="Connection Quality"
        description="Live sampling of explorer link health and network resilience."
        glowColor={PANEL_GLOW.connection}
        collapsed={collapsedPanels.connection ?? false}
        onToggle={togglePanel}
      >
        {qualityTimeline.length ? (
          <div className="space-y-6">
            <div className="h-48 w-full overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.32em] text-slate-400">
                <span>Signal Strength Trend</span>
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Auto-refreshing
                </span>
              </div>
              <div className="mt-3 h-36">
                <ConnectionQualityGraph samples={qualityTimeline} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricTile label="Latency" value={formatLatency(latencyMs)} helper="Round-trip time" tone={metricTone(latencyMs, 'latency')} />
              <MetricTile label="Jitter" value={formatLatency(jitterMs)} helper="Variation" tone={metricTone(jitterMs, 'jitter')} />
              <MetricTile label="Packet Loss" value={formatPacketLoss(packetLoss)} helper="Rolling average" tone={metricTone(packetLoss, 'loss')} />
            </div>
          </div>
        ) : (
          <EmptyState message="Awaiting telemetry samples" />
        )}
      </DashboardPanel>

      <DashboardPanel
        id="audio"
        title="Audio Levels"
        description="Monitor live speech input and program output dynamics."
        glowColor={PANEL_GLOW.audio}
        collapsed={collapsedPanels.audio ?? false}
        onToggle={togglePanel}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <AudioMeter
            label="Speech Input"
            rmsDb={micLevelDb}
            peakDb={micPeakDb}
            helper="Facilitator mic and local speech"
          />
          <AudioMeter
            label="Program Output"
            rmsDb={programLevelDb}
            peakDb={programPeakDb}
            helper="Program mix at explorer"
          />
        </div>
      </DashboardPanel>

      <DashboardPanel
        id="session"
        title="Session Overview"
        description="Key session telemetry and participation metrics."
        glowColor={PANEL_GLOW.session}
        collapsed={collapsedPanels.session ?? false}
        onToggle={togglePanel}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <StatBlock label="Session Duration" value={sessionDurationLabel} />
          <StatBlock
            label="Data Transferred"
            value={
              transferredBytes
                ? `${formatBytes(transferredBytes.total)} total`
                : '—'
            }
            helper={
              transferredBytes
                ? `${formatBytes(transferredBytes.sent)} sent · ${formatBytes(transferredBytes.received)} received`
                : undefined
            }
          />
          <StatBlock label="Participants" value={participantSummary} helper={formatParticipantList(participants)} />
          <StatBlock label="Last Update" value={new Date().toLocaleTimeString()} helper="Local time" />
        </div>
      </DashboardPanel>

      <DashboardPanel
        id="system"
        title="System Monitor"
        description="Explorer device performance and buffer health."
        glowColor={PANEL_GLOW.system}
        collapsed={collapsedPanels.system ?? false}
        onToggle={togglePanel}
      >
        {cpuUsage == null && memoryUsage == null && audioBufferHealth == null ? (
          <EmptyState message="No system telemetry available" />
        ) : (
          <div className="grid gap-5 sm:grid-cols-3">
            <StatBlock label="CPU" value={formatPercent(cpuUsage)} helper="Processor load" />
            <StatBlock label="Memory" value={formatPercent(memoryUsage)} helper="Working set" />
            <StatBlock label="Audio Buffer" value={formatPercent(audioBufferHealth)} helper="Headroom" />
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}

interface DashboardPanelProps {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
  collapsed: boolean;
  glowColor: GlassCardGlowColor;
  onToggle: (id: string) => void;
}

function DashboardPanel({ id, title, description, children, collapsed, glowColor, onToggle }: DashboardPanelProps) {
  return (
    <GlassCard variant="elevated" glowColor={glowColor} className={cn('flex flex-col', PANEL_BACKGROUND)}>
      <GlassCardHeader className="flex flex-row items-start justify-between gap-4 border-white/5">
        <div className="space-y-1.5">
          <GlassCardTitle className="text-lg text-white">{title}</GlassCardTitle>
          <GlassCardDescription className="text-xs text-slate-300">{description}</GlassCardDescription>
        </div>
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={!collapsed}
          aria-controls={`${id}-panel`}
          className="group inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:border-white/30 hover:bg-white/20"
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-200', collapsed ? '-rotate-90' : 'rotate-0')}
          />
        </button>
      </GlassCardHeader>
      {!collapsed && (
        <GlassCardContent id={`${id}-panel`} className="gap-6 pt-4 text-sm text-slate-200">
          {children}
        </GlassCardContent>
      )}
    </GlassCard>
  );
}

interface MetricTileProps {
  label: string;
  value: string;
  helper: string;
  tone: 'positive' | 'neutral' | 'warning' | 'critical';
}

function MetricTile({ label, value, helper, tone }: MetricTileProps) {
  const toneClasses: Record<MetricTileProps['tone'], string> = {
    positive: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    neutral: 'border-white/10 bg-white/5 text-slate-200',
    warning: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
    critical: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
  };

  return (
    <div className={cn('rounded-2xl border px-4 py-3 shadow-sm backdrop-blur', toneClasses[tone])}>
      <span className="text-[0.6rem] uppercase tracking-[0.32em] text-white/60">{label}</span>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      <p className="mt-1 text-xs text-white/70">{helper}</p>
    </div>
  );
}

interface AudioMeterProps {
  label: string;
  helper: string;
  rmsDb: number | null;
  peakDb: number | null;
}

function AudioMeter({ label, helper, rmsDb, peakDb }: AudioMeterProps) {
  const safeRms = Number.isFinite(rmsDb) ? (rmsDb as number) : -72;
  const safePeak = Number.isFinite(peakDb) ? (peakDb as number) : safeRms;
  return (
    <div className="flex flex-col gap-3 rounded-[22px] border border-white/10 bg-slate-950/40 p-4 shadow-inner">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xs text-slate-300">{helper}</span>
      </div>
      <VUMeter rmsDb={safeRms} peakDb={safePeak} />
      <div className="flex items-center justify-between text-xs text-slate-300">
        <span>RMS {formatDbLabel(rmsDb)}</span>
        <span>Peak {formatDbLabel(peakDb)}</span>
      </div>
    </div>
  );
}

interface StatBlockProps {
  label: string;
  value: string;
  helper?: string;
}

function StatBlock({ label, value, helper }: StatBlockProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-inner">
      <span className="text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">{label}</span>
      <span className="text-lg font-semibold text-white">{value}</span>
      {helper && <span className="text-xs text-slate-300">{helper}</span>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-slate-950/20 text-center">
      <p className="text-sm font-medium text-slate-200">{message}</p>
      <p className="text-xs text-slate-400">Telemetry updates every 500 ms.</p>
    </div>
  );
}

function normaliseDb(value?: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value <= 1.2 && value >= 0) {
    const clamped = Math.max(value, 0.000001);
    return 20 * Math.log10(clamped);
  }
  return value;
}

function formatDbLabel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} dBFS`;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const segments = [
    hours > 0 ? `${hours}h` : null,
    hours > 0 || minutes > 0 ? `${minutes.toString().padStart(hours > 0 ? 2 : 1, '0')}m` : null,
    `${seconds.toString().padStart(minutes > 0 || hours > 0 ? 2 : 1, '0')}s`,
  ].filter(Boolean);

  return segments.join(' ');
}

function formatLatency(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value)} ms`;
}

function formatPacketLoss(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(2)}%`;
}

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

type MetricType = 'latency' | 'jitter' | 'loss';

function metricTone(value: number | null, type: MetricType): MetricTileProps['tone'] {
  if (value == null || Number.isNaN(value)) return 'neutral';
  if (type === 'loss') {
    const percent = value <= 1 ? value * 100 : value;
    if (percent < 1) return 'positive';
    if (percent < 3) return 'neutral';
    if (percent < 8) return 'warning';
    return 'critical';
  }

  const metricValue = value;
  if (type === 'latency') {
    if (metricValue < 120) return 'positive';
    if (metricValue < 240) return 'neutral';
    if (metricValue < 360) return 'warning';
    return 'critical';
  }

  // jitter
  if (metricValue < 20) return 'positive';
  if (metricValue < 40) return 'neutral';
  if (metricValue < 80) return 'warning';
  return 'critical';
}

function formatParticipantList(participants: TelemetryParticipant[]): string | undefined {
  if (!participants.length) return undefined;
  const names = participants
    .map(participant => participant.name ?? participant.id)
    .slice(0, 4);
  const remainder = participants.length - names.length;
  const summary = names.join(', ');
  return remainder > 0 ? `${summary}, +${remainder} more` : summary;
}
