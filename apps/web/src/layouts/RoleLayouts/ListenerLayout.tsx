import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import { useSessionStore } from '../../state/session';
import { getRemoteFacilitatorBus, unlockAudioContext } from '../../features/audio/context';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../../components/ui/glass-card';
import { Button } from '../../components/ui/button';
import type { ListenerLayoutProps } from './types';

const transitionEase = [0.33, 1, 0.68, 1] as const;

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: transitionEase },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: transitionEase,
      delay: index * 0.1,
    },
  }),
};

const clamp01 = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

export const ListenerLayout: React.FC<ListenerLayoutProps> = ({ facilitatorName, children }) => {
  const { connection, telemetry } = useSessionStore(state => ({
    connection: state.connection,
    telemetry: state.telemetry,
  }));
  const [volume, setVolume] = React.useState(1);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const bus = getRemoteFacilitatorBus();
    setVolume(bus.gain.value);
  }, []);

  const handleConnect = React.useCallback(async () => {
    await unlockAudioContext();
  }, []);

  const handleVolumeChange = React.useCallback((next: number) => {
    if (typeof window === 'undefined') return;
    const bus = getRemoteFacilitatorBus();
    bus.gain.value = next;
    setVolume(next);
  }, []);

  const programLevel = clamp01(telemetry?.program ?? null);
  const volumePercent = Math.round(volume * 100);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-slate-950/98 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <motion.section variants={cardVariants} custom={0}>
          <GlassCard variant="elevated" glowColor="purple">
            <GlassCardHeader className="gap-2">
              <GlassCardTitle className="text-2xl text-white">
                Listening to: {facilitatorName ? facilitatorName : 'Facilitator'}
              </GlassCardTitle>
              <GlassCardDescription className="text-slate-200/80">
                Connect to the program mix and adjust playback locally.
              </GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent className="gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={handleConnect}
                  className="bg-emerald-500 px-4 py-2 text-sm font-semibold hover:bg-emerald-600"
                >
                  Connect audio
                </Button>
                <span className="text-xs uppercase tracking-[0.3em] text-slate-400">{connection}</span>
              </div>
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
                  <span>Volume</span>
                  <span className="font-semibold text-slate-100">{volumePercent}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={Math.round(volume * 100)}
                  onChange={event => handleVolumeChange(Number(event.target.value) / 100)}
                  className="h-2 w-full appearance-none rounded-full bg-white/10"
                />
              </div>
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Program level</span>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400/60 via-cyan-400/70 to-blue-500/70 transition-[width] duration-150"
                    style={{ width: `${Math.round(programLevel * 100)}%` }}
                  />
                </div>
              </div>
            </GlassCardContent>
          </GlassCard>
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

export default ListenerLayout;
