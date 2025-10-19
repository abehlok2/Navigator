import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import RecordingStudio from '../../features/recording/components/RecordingStudio';
import ConnectionStatus from '../../features/session/ConnectionStatus';
import { useSessionStore } from '../../state/session';
import { getAudioContext, unlockAudioContext } from '../../features/audio/context';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../../components/ui/glass-card';
import { Button } from '../../components/ui/button';
import type { ExplorerLayoutProps } from './types';

const transitionEase = [0.16, 1, 0.3, 1] as const;

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: transitionEase },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: transitionEase,
      delay: index * 0.08,
    },
  }),
};

const clamp01 = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

export const ExplorerLayout: React.FC<ExplorerLayoutProps> = ({ children }) => {
  const { telemetry } = useSessionStore(state => ({ telemetry: state.telemetry }));
  const [exploring, setExploring] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const ctx = getAudioContext();
    const update = () => setExploring(ctx.state === 'running');
    update();
    ctx.addEventListener('statechange', update);
    return () => {
      ctx.removeEventListener('statechange', update);
    };
  }, []);

  const handleStart = React.useCallback(async () => {
    await unlockAudioContext();
    if (typeof window === 'undefined') return;
    const ctx = getAudioContext();
    setExploring(ctx.state === 'running');
  }, []);

  const handleStop = React.useCallback(async () => {
    if (typeof window === 'undefined') return;
    const ctx = getAudioContext();
    if (ctx.state !== 'closed') {
      await ctx.suspend();
      setExploring(false);
    }
  }, []);

  const programLevel = clamp01(telemetry?.program ?? null);
  const micLevel = clamp01(telemetry?.mic ?? null);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <motion.section variants={cardVariants} custom={0} className="w-full">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <GlassCard variant="elevated" glowColor="purple" className="overflow-hidden">
              <GlassCardHeader className="flex-col gap-3 border-white/10 pb-6">
                <GlassCardTitle className="text-2xl text-white">Recording studio</GlassCardTitle>
                <GlassCardDescription className="text-sm text-slate-200/80">
                  Arm tracks, monitor levels, and capture the explorer perspective with the full studio surface.
                </GlassCardDescription>
              </GlassCardHeader>
              <GlassCardContent className="px-0 pb-0">
                <RecordingStudio />
              </GlassCardContent>
            </GlassCard>

            <div className="flex flex-col gap-6">
              <ConnectionStatus />

              <GlassCard variant="default" glowColor="blue" className="h-full">
                <GlassCardHeader className="gap-4 border-white/10 pb-5">
                  <GlassCardTitle className="text-lg text-white">Exploration controls</GlassCardTitle>
                  <GlassCardDescription className="text-sm text-slate-200/80">
                    Start the audio graph when you are ready to scout and end the session when the capture wraps.
                  </GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="gap-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      onClick={handleStart}
                      className="bg-emerald-500 px-4 py-2 text-sm font-semibold hover:bg-emerald-600"
                      disabled={exploring}
                    >
                      Start exploration
                    </Button>
                    <Button
                      type="button"
                      onClick={handleStop}
                      className="bg-rose-500 px-4 py-2 text-sm font-semibold hover:bg-rose-600 disabled:bg-rose-500/60"
                      disabled={!exploring}
                    >
                      End exploration
                    </Button>
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      {exploring ? 'Audio running' : 'Audio idle'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Incoming audio
                    </span>
                    <LevelBar label="Program" value={programLevel} />
                    <LevelBar label="Facilitator mic" value={micLevel} />
                  </div>
                </GlassCardContent>
              </GlassCard>
            </div>
          </div>
        </motion.section>

        {children ? (
          <motion.section variants={cardVariants} custom={1} className="flex flex-col gap-6">
            {children}
          </motion.section>
        ) : null}
      </div>
    </motion.div>
  );
};

function LevelBar({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-400">
        <span>{label}</span>
        <span className="font-semibold text-slate-100">{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400/70 via-blue-500/70 to-indigo-500/70 transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default ExplorerLayout;
