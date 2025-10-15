import { useMemo } from 'react';
import { motion } from 'framer-motion';

import { cn } from '../../../lib/utils';

const DEFAULT_MIN_DB = -60;
const DEFAULT_MAX_DB = 6;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const normalise = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return 0;
  if (max - min === 0) return 0;
  return clamp01((value - min) / (max - min));
};

export interface VUMeterProps {
  rmsDb: number;
  peakDb?: number;
  minDb?: number;
  maxDb?: number;
  orientation?: 'vertical' | 'horizontal';
  muted?: boolean;
  className?: string;
  showTicks?: boolean;
}

export function VUMeter({
  rmsDb,
  peakDb,
  minDb = DEFAULT_MIN_DB,
  maxDb = DEFAULT_MAX_DB,
  orientation = 'vertical',
  muted = false,
  className,
  showTicks = true,
}: VUMeterProps) {
  const rmsNorm = useMemo(() => normalise(rmsDb, minDb, maxDb), [maxDb, minDb, rmsDb]);
  const peakNorm = useMemo(
    () => (peakDb !== undefined ? normalise(peakDb, minDb, maxDb) : normalise(rmsDb, minDb, maxDb)),
    [maxDb, minDb, peakDb, rmsDb]
  );

  const vertical = orientation === 'vertical';

  return (
    <div
      className={cn(
        'relative flex overflow-hidden rounded-full border border-white/10 bg-slate-950/70 p-[3px]',
        vertical ? 'flex-col' : 'h-3 w-full items-center',
        className
      )}
    >
      <div className={cn('relative flex-1 overflow-hidden rounded-full bg-slate-900/80', vertical ? 'flex flex-col' : '')}>
        <motion.div
          aria-hidden
          className={cn(
            'absolute left-0 top-0 rounded-full bg-gradient-to-t from-emerald-400 via-sky-500 to-purple-400 shadow-[0_0_30px_rgba(56,189,248,0.45)]',
            vertical ? 'w-full origin-bottom' : 'h-full origin-left'
          )}
          animate={vertical ? { scaleY: muted ? 0 : rmsNorm } : { scaleX: muted ? 0 : rmsNorm }}
          transition={{ type: 'spring', stiffness: 240, damping: 32, mass: 0.5 }}
        />
        {showTicks && (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 flex justify-between px-1 text-[0.55rem] uppercase tracking-[0.4em] text-white/20',
              vertical ? 'flex-col py-2' : 'items-center'
            )}
          >
            <span className="h-px w-full bg-white/15" />
            <span className="h-px w-full bg-white/10" />
            <span className="h-px w-full bg-white/15" />
          </div>
        )}
        <motion.div
          aria-hidden
          className={cn(
            'pointer-events-none absolute rounded-full bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.5)]',
            vertical ? 'left-1/2 h-0.5 w-[70%] -translate-x-1/2' : 'top-1/2 h-[70%] w-0.5 -translate-y-1/2'
          )}
          style={
            vertical
              ? { bottom: `${clamp01(peakNorm) * 100}%` }
              : { left: `${clamp01(peakNorm) * 100}%` }
          }
          transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.4 }}
        />
        <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/10 via-transparent to-white/5" />
      </div>
    </div>
  );
}

