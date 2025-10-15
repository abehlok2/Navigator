import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '../../../lib/utils';

export interface ConnectionQualitySample {
  timestamp: number;
  score: number;
}

export interface ConnectionQualityGraphProps {
  samples: ConnectionQualitySample[];
  className?: string;
}

export default function ConnectionQualityGraph({ samples, className }: ConnectionQualityGraphProps) {
  const chartData = useMemo(() => {
    return samples.map(sample => ({
      timestamp: sample.timestamp,
      quality: normaliseScore(sample.score),
    }));
  }, [samples]);

  const now = useMemo(() => Date.now(), [chartData]);

  return (
    <div className={cn('h-full w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 6, left: 0, right: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="connectionQualityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.7} />
              <stop offset="45%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#111827" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.18)" strokeDasharray="4 8" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={20}
            tickFormatter={value => formatTimeAgo(now, value as number)}
            tick={{ fill: '#cbd5f5', fontSize: 11 }}
          />
          <YAxis
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tickFormatter={value => `${value}%`}
            tick={{ fill: '#cbd5f5', fontSize: 11 }}
            width={32}
          />
          <Tooltip cursor={{ stroke: 'rgba(148,163,184,0.25)', strokeWidth: 1 }} content={<ConnectionQualityTooltip />} />
          <Area
            type="monotone"
            dataKey="quality"
            stroke="#38bdf8"
            strokeWidth={2.5}
            fill="url(#connectionQualityGradient)"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: '#a855f7' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function normaliseScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? value * 100 : value;
}

function formatTimeAgo(now: number, timestamp: number): string {
  const delta = Math.max(0, now - timestamp);
  const seconds = Math.round(delta / 1000);
  if (seconds <= 0) return 'now';
  if (seconds < 60) return `-${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `-${minutes}m`;
}

function ConnectionQualityTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const [{ value }] = payload;
  return (
    <div className="rounded-xl border border-white/20 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 shadow-xl">
      <span className="font-semibold">{value.toFixed(1)}%</span>
      <p className="mt-1 text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Link quality</p>
    </div>
  );
}
