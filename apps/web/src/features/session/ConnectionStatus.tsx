import React from 'react';
import { cn } from '../../lib/utils';
import { useSessionStore } from '../../state/session';

const STATUS_STYLE: Record<
  'connected' | 'connecting' | 'disconnected',
  { label: string; badge: string; description: string }
> = {
  connected: {
    label: 'Connected',
    badge: 'bg-emerald-400/20 text-emerald-50 border border-emerald-200/60 shadow shadow-emerald-900/10',
    description: 'Media and control channels are active.',
  },
  connecting: {
    label: 'Connecting…',
    badge: 'bg-amber-400/30 text-amber-50 border border-amber-200/60 shadow shadow-amber-900/10',
    description: 'Negotiating session details—stay on this page.',
  },
  disconnected: {
    label: 'Disconnected',
    badge: 'bg-rose-400/25 text-rose-50 border border-rose-200/60 shadow shadow-rose-900/10',
    description: 'Reconnect to begin streaming audio.',
  },
};

export default function ConnectionStatus() {
  const { connection, lastHeartbeat } = useSessionStore(s => ({
    connection: s.connection,
    lastHeartbeat: s.lastHeartbeat,
  }));
  const status = STATUS_STYLE[connection] ?? STATUS_STYLE.disconnected;
  const heartbeatAgeSeconds = lastHeartbeat ? (Date.now() - lastHeartbeat) / 1000 : null;
  const heartbeatTone = heartbeatAgeSeconds === null
    ? 'text-blue-100/70'
    : heartbeatAgeSeconds > 5
      ? 'text-amber-100'
      : 'text-emerald-100';

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 text-blue-50 shadow-lg shadow-sky-900/30 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn('rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em]', status.badge)}>
          {status.label}
        </span>
        <span className="text-sm text-blue-50/80">{status.description}</span>
      </div>
      <div className={cn('text-xs font-medium', heartbeatTone)}>
        {heartbeatAgeSeconds === null
          ? 'Awaiting first heartbeat…'
          : `Last heartbeat ${heartbeatAgeSeconds.toFixed(1)}s ago`}
      </div>
    </div>
  );
}
