import * as React from 'react';
import { motion } from 'framer-motion';

import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardFooter,
  GlassCardHeader,
  GlassCardTitle,
} from '../../components/ui/glass-card';

export interface RoleLayoutProps {
  children: React.ReactNode;
}

const containerVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.33, 1, 0.68, 1] },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.33, 1, 0.68, 1],
      delay: index * 0.1,
    },
  }),
};

export const ListenerLayout: React.FC<RoleLayoutProps> = ({ children }) => {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-slate-950/98 px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <motion.section variants={cardVariants} custom={0}>
          <GlassCard variant="elevated" glowColor="blue" className="text-center">
            <GlassCardHeader className="items-center text-center">
              <GlassCardTitle className="text-3xl sm:text-4xl">Live Listener Status</GlassCardTitle>
              <GlassCardDescription className="text-base text-slate-300">
                Relax and receive. Your stream will adapt automatically to facilitator commands.
              </GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent className="items-center gap-6 text-base text-slate-200">
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 text-sm uppercase tracking-[0.35em] text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]" />
                  Stream Healthy
                </div>
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm uppercase tracking-wide text-slate-400">Now Playing</p>
                  <p className="text-4xl font-semibold text-white sm:text-5xl">Aurora Drift</p>
                  <p className="text-sm text-slate-300">Facilitator mix • 04:21 elapsed</p>
                </div>
              </div>
              <div className="w-full rounded-3xl border border-white/5 bg-white/[0.03] p-4">
                <div className="h-2 w-full rounded-full bg-gradient-to-r from-emerald-500/40 via-sky-500/35 to-blue-500/35">
                  <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-blue-400" />
                </div>
                <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">Adaptive volume 68%</p>
              </div>
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-sm text-slate-200">
                {children}
              </div>
            </GlassCardContent>
            <GlassCardFooter className="justify-center text-xs uppercase tracking-[0.3em] text-slate-400">
              Enjoy the journey • Hands-free mode
            </GlassCardFooter>
          </GlassCard>
        </motion.section>

        <motion.section variants={cardVariants} custom={1}>
          <GlassCard variant="default" glowColor="green">
            <GlassCardHeader className="items-center text-center">
              <GlassCardTitle className="text-xl">Connection Details</GlassCardTitle>
              <GlassCardDescription>
                Minimal controls for when you need to confirm link stability.
              </GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent className="gap-4 text-sm text-slate-200">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Session</p>
                  <p className="mt-2 text-lg font-semibold text-white">#A1F-342</p>
                  <p className="text-xs text-slate-400">Auto-join active</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Latency</p>
                  <p className="mt-2 text-lg font-semibold text-white">22 ms</p>
                  <p className="text-xs text-slate-400">Smooth playback</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Input</p>
                  <p className="mt-2 text-lg font-semibold text-white">Mic muted</p>
                  <p className="text-xs text-slate-400">Listening only</p>
                </div>
              </div>
            </GlassCardContent>
            <GlassCardFooter className="flex flex-col items-center gap-3 text-xs text-slate-300 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                <span>Audio mirror enabled</span>
              </div>
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10"
              >
                Re-sync Stream
              </button>
            </GlassCardFooter>
          </GlassCard>
        </motion.section>
      </div>
    </motion.div>
  );
};

