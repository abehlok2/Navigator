import React from 'react';
import { Button } from '../../../components/ui/button';

export interface MixerChannelProps {
  id: string;
  title?: string;
  bytes?: number;
  notes?: string;
  gainDb: number;
  status: 'ready' | 'pending' | 'missing';
  onGainChange: (value: number) => void;
  onPlay: () => void;
  onStop: () => void;
  disabled?: boolean;
}

const statusTone: Record<MixerChannelProps['status'], string> = {
  ready: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
  pending: 'text-amber-300 border-amber-300/40 bg-amber-400/10',
  missing: 'text-rose-300 border-rose-300/40 bg-rose-400/10',
};

export const MixerChannel: React.FC<MixerChannelProps> = ({
  id,
  title,
  bytes,
  notes,
  gainDb,
  status,
  onGainChange,
  onPlay,
  onStop,
  disabled = false,
}) => {
  const displayName = title?.trim() || id;
  const subtitle = bytes ? `${bytes.toLocaleString()} bytes` : undefined;

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-lg ring-1 ring-white/5 backdrop-blur">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-white">{displayName}</div>
          {subtitle && <div className="text-xs text-slate-300">{subtitle}</div>}
          {notes && <div className="mt-2 text-xs text-slate-400">{notes}</div>}
        </div>
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone[status]}`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {status === 'ready' && 'Remote ready'}
          {status === 'pending' && 'Waiting for explorer'}
          {status === 'missing' && 'Explorer missing'}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
            <span>Gain</span>
            <span className="text-slate-200">{gainDb.toFixed(0)} dB</span>
          </div>
          <input
            type="range"
            min={-60}
            max={6}
            step={1}
            value={gainDb}
            onChange={event => onGainChange(Number(event.target.value))}
            disabled={disabled || status !== 'ready'}
            className="h-1.5 w-full appearance-none rounded-full bg-slate-700 accent-indigo-400 disabled:opacity-40"
          />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          type="button"
          size="sm"
          variant="primary"
          onClick={onPlay}
          disabled={disabled || status !== 'ready'}
          className="w-full"
        >
          Play
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onStop}
          disabled={disabled}
          className="w-full"
        >
          Stop
        </Button>
      </div>
    </div>
  );
};

export default MixerChannel;
