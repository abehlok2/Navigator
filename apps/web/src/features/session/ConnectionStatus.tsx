import React from 'react';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { useSessionStore } from '../../state/session';

const STATUS_STYLE: Record<
  'connected' | 'connecting' | 'disconnected',
  { label: string; description: string; badgeVariant: 'success' | 'info' | 'destructive' }
> = {
  connected: {
    label: 'Connected',
    badgeVariant: 'success',
    description: 'Media and control channels are active.',
  },
  connecting: {
    label: 'Connecting…',
    badgeVariant: 'info',
    description: 'Negotiating session details—stay on this page.',
  },
  disconnected: {
    label: 'Disconnected',
    badgeVariant: 'destructive',
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
  const heartbeatTone =
    heartbeatAgeSeconds === null
      ? 'text-slate-400'
      : heartbeatAgeSeconds > 5
        ? 'text-amber-600'
        : 'text-emerald-600';

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 text-slate-700 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={status.badgeVariant} className="text-[11px] tracking-wide">
          {status.label}
        </Badge>
        <span className="text-sm text-slate-600">{status.description}</span>
      </div>
      <div className={cn('text-xs font-medium', heartbeatTone)}>
        {heartbeatAgeSeconds === null
          ? 'Awaiting first heartbeat…'
          : `Last heartbeat ${heartbeatAgeSeconds.toFixed(1)}s ago`}
      </div>
    </div>
  );
}
