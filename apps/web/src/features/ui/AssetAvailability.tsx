import React, { useMemo } from 'react';
import { formatBytes } from '../../lib/format';
import { cn } from '../../lib/utils';
import { useSessionStore } from '../../state/session';

const STATUS_BADGE: Record<'loaded' | 'loading' | 'missing', string> = {
  loaded: 'bg-emerald-100 text-emerald-700',
  loading: 'bg-amber-100 text-amber-700',
  missing: 'bg-rose-100 text-rose-700',
};

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
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-sm text-slate-500">
        <span className="text-base font-semibold text-slate-700">Waiting for asset manifest…</span>
        <span>Assets shared by the facilitator will appear here for quick verification.</span>
      </div>
    );
  }

  const localPercent = total ? Math.round((loadedCounts.local / total) * 100) : 0;
  const remotePercent = total ? Math.round((loadedCounts.remote / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-2xl bg-slate-50/80 p-4 sm:grid-cols-2">
        <SummaryBlock
          title="Local library"
          subtitle="Available on this device"
          count={loadedCounts.local}
          total={total}
          percent={localPercent}
        />
        {role === 'facilitator' && (
          <SummaryBlock
            title="Explorer"
            subtitle="Reported by remote explorer"
            count={loadedCounts.remote}
            total={total}
            percent={remotePercent}
          />
        )}
      </div>
      <ul className="space-y-3">
        {manifestEntries.map(entry => {
          const progress = assetProgress[entry.id];
          const pct = progress?.total
            ? Math.round((progress.loaded / Math.max(progress.total, 1)) * 100)
            : 0;
          const localStatus = localAssets.has(entry.id)
            ? 'loaded'
            : progress?.loaded
              ? 'loading'
              : 'missing';
          const remoteStatus = remoteAssets.has(entry.id) ? 'loaded' : 'missing';
          const displayTitle = entry.title?.trim() || entry.id;
          const trimmedNotes = entry.notes?.trim();
          const trimmedUrl = entry.url?.trim();

          return (
            <li key={entry.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-slate-800">{displayTitle}</h4>
                  <div className="text-xs font-mono text-slate-500">ID: {entry.id}</div>
                  {trimmedNotes && (
                    <p className="whitespace-pre-wrap text-xs text-slate-600">{trimmedNotes}</p>
                  )}
                  {trimmedUrl && (
                    <p className="break-all text-xs text-amber-600">Legacy remote reference: {trimmedUrl}</p>
                  )}
                </div>
                <span className="text-xs font-medium text-slate-500">{formatBytes(entry.bytes)}</span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
                  <span className="uppercase tracking-wide text-slate-400">Local</span>
                  <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold', STATUS_BADGE[localStatus])}>
                    {localStatus === 'loaded' ? 'Loaded' : localStatus === 'loading' ? 'Loading…' : 'Missing'}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      localStatus === 'loaded'
                        ? 'bg-emerald-500'
                        : localStatus === 'loading'
                          ? 'bg-amber-500'
                          : 'bg-rose-400'
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {role === 'facilitator' && (
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
                    <span className="uppercase tracking-wide text-slate-400">Explorer</span>
                    <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold', STATUS_BADGE[remoteStatus])}>
                      {remoteStatus === 'loaded' ? 'Loaded' : 'Missing'}
                    </span>
                    <span>
                      {remoteAssets.has(entry.id) ? 'Ready remotely' : 'Awaiting upload'}
                    </span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface SummaryBlockProps {
  title: string;
  subtitle: string;
  count: number;
  total: number;
  percent: number;
}

function SummaryBlock({ title, subtitle, count, total, percent }: SummaryBlockProps) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/60 bg-white/70 p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="text-sm text-slate-500">{subtitle}</div>
      <div className="text-2xl font-semibold text-slate-900">
        {count}
        <span className="text-sm text-slate-400"> / {total}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-sky-500 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="text-xs font-medium text-slate-500">{percent}% complete</div>
    </div>
  );
}
