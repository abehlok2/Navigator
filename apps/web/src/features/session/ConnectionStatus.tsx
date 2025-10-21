import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';

import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardFooter,
  GlassCardHeader,
  GlassCardTitle,
} from '../../components/ui/glass-card';
import { Button } from '../../components/ui/button';
import { StatusIndicator, type StatusIndicatorStatus } from '../../components/ui/status-indicator';
import AudioQualityIndicator from '../../components/session/AudioQualityIndicator';
import { cn } from '../../lib/utils';
import { useSessionStore, type ConnectionStatus as SessionConnectionStatus } from '../../state/session';

const HISTORY_INTERVAL = 2000;
const HISTORY_LENGTH = 30;
const STALE_HEARTBEAT_THRESHOLD = 15; // seconds

type QualityPoint = {
  timestamp: number;
  quality: number;
};

type QualityBand = 'excellent' | 'fair' | 'degraded';

type MetricTone = 'positive' | 'neutral' | 'warning' | 'critical';

const STATUS_COPY: Record<
  SessionConnectionStatus,
  {
    title: string;
    description: string;
    indicator: StatusIndicatorStatus;
  }
> = {
  connected: {
    title: 'Connected',
    description: 'Media, control, and telemetry channels are online.',
    indicator: 'connected',
  },
  connecting: {
    title: 'Negotiating link…',
    description: 'Establishing secure transport and syncing clocks.',
    indicator: 'connecting',
  },
  disconnected: {
    title: 'Disconnected',
    description: 'No active session detected. Attempting reconnection.',
    indicator: 'disconnected',
  },
};

const QUALITY_THEMES: Record<
  QualityBand,
  {
    label: string;
    stroke: string;
    fill: string;
    text: string;
    badge: string;
  }
> = {
  excellent: {
    label: 'Excellent Link',
    stroke: '#34d399',
    fill: 'rgba(16,185,129,0.22)',
    text: 'text-emerald-300',
    badge: 'bg-emerald-500/15 text-emerald-200',
  },
  fair: {
    label: 'Moderate Stability',
    stroke: '#facc15',
    fill: 'rgba(234,179,8,0.22)',
    text: 'text-amber-300',
    badge: 'bg-amber-500/20 text-amber-200',
  },
  degraded: {
    label: 'Degraded Link',
    stroke: '#f87171',
    fill: 'rgba(248,113,113,0.22)',
    text: 'text-rose-300',
    badge: 'bg-rose-500/20 text-rose-200',
  },
};

const TONE_COLORS: Record<MetricTone, string> = {
  positive: 'text-emerald-300',
  neutral: 'text-slate-100',
  warning: 'text-amber-300',
  critical: 'text-rose-300',
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const computeQualityScore = ({
  connection,
  heartbeatAgeSeconds,
  averageLevel,
}: {
  connection: SessionConnectionStatus;
  heartbeatAgeSeconds: number | null;
  averageLevel: number | null;
}) => {
  if (connection === 'disconnected') {
    return 6;
  }

  if (connection === 'connecting') {
    let interim = 54;
    if (heartbeatAgeSeconds !== null) {
      interim -= Math.min(18, heartbeatAgeSeconds * 2.5);
    }
    if (averageLevel !== null) {
      interim += (averageLevel - 0.5) * 8;
    }
    return Math.max(8, Math.min(70, Math.round(interim)));
  }

  let score = 88;
  if (heartbeatAgeSeconds === null) {
    score -= 18;
  } else {
    score -= Math.min(65, heartbeatAgeSeconds * 7.5);
  }

  if (averageLevel !== null) {
    score += Math.round((averageLevel - 0.6) * 12);
  }

  return Math.max(5, Math.min(100, Math.round(score)));
};

const useQualityHistory = (
  quality: number,
  now: number,
  initializer: () => QualityPoint[],
) => {
  const [history, setHistory] = React.useState<QualityPoint[]>(initializer);

  React.useEffect(() => {
    setHistory(prev => {
      const nextPoint: QualityPoint = { timestamp: now, quality };
      const trimmed = prev.slice(-(HISTORY_LENGTH - 1));
      return [...trimmed, nextPoint];
    });
  }, [quality, now]);

  return history;
};

const MetricTile: React.FC<{
  label: string;
  value: string;
  helper?: string;
  tone?: MetricTone;
}> = ({ label, value, helper, tone = 'neutral' }) => (
  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]">
    <p className="text-[0.65rem] uppercase tracking-[0.28em] text-slate-400">{label}</p>
    <p className={cn('mt-3 text-2xl font-semibold', TONE_COLORS[tone])}>{value}</p>
    {helper ? <p className="mt-2 text-xs text-slate-400">{helper}</p> : null}
  </div>
);

type TooltipDatum = { payload?: unknown };

const QualityTooltip: React.FC<{ active?: boolean; payload?: TooltipDatum[]; now: number }> = ({
  active,
  payload,
  now,
}) => {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload as QualityPoint | undefined;
  if (!datum) return null;
  const secondsAgo = Math.max(0, Math.round((now - datum.timestamp) / 1000));
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-200 shadow-xl">
      <div className="font-semibold">{Math.round(datum.quality)}% signal</div>
      <div className="text-slate-400">{secondsAgo === 0 ? 'Live' : `${secondsAgo}s ago`}</div>
    </div>
  );
};

export default function ConnectionStatus() {
  const { connection, lastHeartbeat, telemetry } = useSessionStore(state => ({
    connection: state.connection,
    lastHeartbeat: state.lastHeartbeat,
    telemetry: state.telemetry,
  }));

  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const heartbeatAgeSeconds = React.useMemo(() => {
    if (!lastHeartbeat) return null;
    return Math.max(0, (now - lastHeartbeat) / 1000);
  }, [lastHeartbeat, now]);

  const averageLevel = React.useMemo(() => {
    if (!telemetry) return null;
    const mic = clamp01(telemetry.mic ?? 0);
    const program = clamp01(telemetry.program ?? 0);
    return (mic + program) / 2;
  }, [telemetry]);

  const qualityScore = React.useMemo(
    () =>
      computeQualityScore({
        connection,
        heartbeatAgeSeconds,
        averageLevel,
      }),
    [connection, heartbeatAgeSeconds, averageLevel],
  );

  const history = useQualityHistory(
    qualityScore,
    now,
    React.useCallback(() => {
      const initialTimestamp = Date.now();
      const initialScore = computeQualityScore({
        connection,
        heartbeatAgeSeconds: lastHeartbeat ? (initialTimestamp - lastHeartbeat) / 1000 : null,
        averageLevel,
      });
      return Array.from({ length: HISTORY_LENGTH }, (_, index) => ({
        timestamp: initialTimestamp - (HISTORY_LENGTH - index) * HISTORY_INTERVAL,
        quality: initialScore,
      }));
    }, [averageLevel, connection, lastHeartbeat]),
  );

  const latestQuality = history[history.length - 1]?.quality ?? qualityScore;
  const qualityBand: QualityBand =
    latestQuality >= 70 ? 'excellent' : latestQuality >= 40 ? 'fair' : 'degraded';
  const qualityTheme = QUALITY_THEMES[qualityBand];
  const qualityPercent = Math.round(latestQuality);

  const latencyMs = heartbeatAgeSeconds === null ? null : Math.round(heartbeatAgeSeconds * 1000);
  const countdownSeconds =
    heartbeatAgeSeconds === null
      ? null
      : Math.max(0, STALE_HEARTBEAT_THRESHOLD - heartbeatAgeSeconds);

  const telemetryWithPacketLoss = telemetry as (typeof telemetry & { packetLoss?: number }) | null;
  const packetLossValue = telemetryWithPacketLoss?.packetLoss;

  const latencyTone: MetricTone =
    latencyMs === null
      ? 'neutral'
      : latencyMs < 120
        ? 'positive'
        : latencyMs < 320
          ? 'warning'
          : 'critical';

  const heartbeatTone: MetricTone =
    countdownSeconds === null
      ? 'neutral'
      : countdownSeconds <= 1.5
        ? 'critical'
        : countdownSeconds <= 4
          ? 'warning'
          : 'positive';

  const packetLossTone: MetricTone =
    packetLossValue === undefined || packetLossValue === null
      ? 'neutral'
      : packetLossValue < 0.02
        ? 'positive'
        : packetLossValue < 0.05
          ? 'warning'
          : 'critical';

  const packetLossDisplay =
    packetLossValue === undefined || packetLossValue === null
      ? '—'
      : `${(packetLossValue * 100).toFixed(2)}%`;

  const packetLossHelper =
    packetLossValue === undefined || packetLossValue === null
      ? 'No packet statistics reported yet.'
      : packetLossValue < 0.02
        ? 'Nominal transport performance.'
        : packetLossValue < 0.05
          ? 'Minor degradation detected—monitor closely.'
          : 'Severe packet drop—check network conditions.';

  const countdownLabel =
    heartbeatAgeSeconds === null
      ? 'Awaiting first heartbeat.'
      : (countdownSeconds ?? 0) === 0
        ? 'Link will recycle if heartbeat remains idle.'
        : `Stale in ${(countdownSeconds ?? 0).toFixed(1)}s`;

  const statusCopy = STATUS_COPY[connection];
  const gradientId = React.useId();
  const tooltipRenderer = React.useCallback(
    (props: TooltipProps<number, string>) => (
      <QualityTooltip
        active={props.active}
        payload={('payload' in props ? props.payload : undefined) as TooltipDatum[] | undefined}
        now={now}
      />
    ),
    [now],
  );

  const chartData = React.useMemo(
    () =>
      history.map(point => ({
        timestamp: point.timestamp,
        quality: Number(point.quality.toFixed(1)),
      })),
    [history],
  );

  const [detailsOpen, setDetailsOpen] = React.useState(false);

  return (
    <GlassCard variant="elevated" glowColor="green" className="w-full max-w-5xl">
      <GlassCardHeader className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <GlassCardTitle>Connection Status</GlassCardTitle>
            <GlassCardDescription>
              Real-time overview of session connectivity, heartbeat cadence, and network quality.
            </GlassCardDescription>
          </div>
          <div className="flex flex-col gap-4 text-left sm:flex-row sm:items-center sm:gap-6">
            <StatusIndicator
              status={statusCopy.indicator}
              label={null}
              size="lg"
              className="drop-shadow-[0_0_25px_rgba(16,185,129,0.35)]"
            />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={connection}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur"
              >
                <p className="text-base font-semibold text-white sm:text-lg">{statusCopy.title}</p>
                <p className="text-sm text-slate-300">{statusCopy.description}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={qualityBand}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex flex-col items-start rounded-2xl border border-white/10 bg-slate-950/40 px-5 py-4 text-left shadow-[0_20px_45px_-35px_rgba(15,23,42,0.8)] sm:items-end"
          >
            <span className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Link Quality</span>
            <div className="mt-3 flex items-baseline gap-3">
              <span className={cn('text-4xl font-semibold leading-none', qualityTheme.text)}>
                {qualityPercent}%
              </span>
              <span className="text-sm text-slate-300">{qualityTheme.label}</span>
            </div>
            <span className={cn('mt-3 inline-flex rounded-full px-3 py-1 text-xs font-medium', qualityTheme.badge)}>
              {connection === 'connected' ? 'Live session' : 'Monitoring'}
            </span>
          </motion.div>
        </AnimatePresence>
      </GlassCardHeader>

      <GlassCardContent className="gap-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-[22px] border border-white/10 bg-slate-950/30 p-5 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.28em] text-slate-400">
              <span>Signal Strength Trend</span>
              <span className={cn('font-semibold normal-case', qualityTheme.text)}>
                {qualityTheme.label}
              </span>
            </div>
            <div className="mt-4 h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={qualityTheme.stroke} stopOpacity={0.75} />
                      <stop offset="95%" stopColor={qualityTheme.fill} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148,163,184,0.18)" strokeDasharray="3 8" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    minTickGap={20}
                    tickFormatter={value => {
                      const secondsAgo = Math.round((now - value) / 1000);
                      if (secondsAgo <= 0) return 'now';
                      return `-${secondsAgo}s`;
                    }}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={value => `${value}%`}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    width={35}
                  />
                  <Tooltip cursor={{ stroke: 'rgba(148,163,184,0.25)', strokeWidth: 1 }} content={tooltipRenderer} />
                  <Area
                    type="monotone"
                    dataKey="quality"
                    stroke={qualityTheme.stroke}
                    strokeWidth={2.5}
                    fill={`url(#${gradientId})`}
                    isAnimationActive={false}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid gap-5">
            <AudioQualityIndicator />
            <MetricTile
              label="Latency"
              value={latencyMs === null ? '—' : `${latencyMs} ms`}
              helper={
                latencyMs === null
                  ? 'Waiting for heartbeat sample.'
                  : latencyMs < 120
                    ? 'Low round-trip delay.'
                    : latencyMs < 320
                      ? 'Acceptable latency—monitor drift.'
                      : 'High latency detected. Check uplink.'
              }
              tone={latencyTone}
            />
            <MetricTile
              label="Last Heartbeat"
              value={
                heartbeatAgeSeconds === null ? '—' : `${heartbeatAgeSeconds.toFixed(1)} s ago`
              }
              helper={countdownLabel}
              tone={heartbeatTone}
            />
            <MetricTile label="Packet Loss" value={packetLossDisplay} helper={packetLossHelper} tone={packetLossTone} />
          </div>
        </div>
      </GlassCardContent>

      <GlassCardFooter className="items-center gap-4">
        <span className="text-xs uppercase tracking-[0.32em] text-slate-400">
          Telemetry auto-refresh every second
        </span>
        <Button
          variant="ghost"
          size="sm"
          glass
          onClick={() => setDetailsOpen(open => !open)}
          trailingIcon={
            <motion.span
              animate={{ rotate: detailsOpen ? 180 : 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex h-4 w-4 items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </motion.span>
          }
          className="text-xs uppercase tracking-[0.28em] text-slate-200"
        >
          {detailsOpen ? 'Hide Diagnostics' : 'Show Diagnostics'}
        </Button>
      </GlassCardFooter>

      <AnimatePresence initial={false}>
        {detailsOpen ? (
          <motion.div
            key="diagnostics"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <GlassCardContent className="border-t border-white/5 bg-slate-950/35 p-6 text-sm">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Session Diagnostics</p>
                  <dl className="mt-4 space-y-3 text-sm text-slate-200">
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400">Current status</dt>
                      <dd className="font-medium text-white">{statusCopy.title}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400">Heartbeat age</dt>
                      <dd className="font-medium">
                        {heartbeatAgeSeconds === null
                          ? '—'
                          : `${heartbeatAgeSeconds.toFixed(2)} s`}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400">Stale threshold</dt>
                      <dd className="font-medium">{STALE_HEARTBEAT_THRESHOLD}s</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400">Quality score</dt>
                      <dd className={cn('font-semibold', qualityTheme.text)}>{qualityPercent}/100</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400">Last heartbeat timestamp</dt>
                      <dd className="font-medium">
                        {lastHeartbeat ? new Date(lastHeartbeat).toLocaleTimeString() : '—'}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Audio Telemetry</p>
                  <dl className="mt-4 space-y-3 text-sm text-slate-200">
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400">Mic level</dt>
                      <dd className="font-medium">
                        {telemetry ? `${(clamp01(telemetry.mic) * 100).toFixed(1)}%` : '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400">Program level</dt>
                      <dd className="font-medium">
                        {telemetry ? `${(clamp01(telemetry.program) * 100).toFixed(1)}%` : '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400">Average level</dt>
                      <dd className="font-medium">
                        {averageLevel === null ? '—' : `${(averageLevel * 100).toFixed(1)}%`}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400">Packet loss</dt>
                      <dd className={cn('font-medium', TONE_COLORS[packetLossTone])}>{packetLossDisplay}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-400">Telemetry heartbeat</dt>
                      <dd className="font-medium">
                        {telemetry ? 'Streaming' : 'Idle'}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </GlassCardContent>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GlassCard>
  );
}
