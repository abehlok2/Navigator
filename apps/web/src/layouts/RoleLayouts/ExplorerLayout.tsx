import * as React from 'react';
import { motion, type Variants } from 'framer-motion';

import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardFooter,
  GlassCardHeader,
  GlassCardTitle,
} from '../../components/ui/glass-card';

import { cn } from '../../lib/utils';
import type { RoleLayoutProps } from './types';

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

const recordingButtonBase =
  'relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-full text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

const meterSamples: number[][] = [
  [30, 45, 62, 58, 76, 40, 34, 82, 66, 54, 70, 38, 52, 61],
  [28, 33, 40, 48, 52, 60, 72, 78, 68, 60, 50, 45, 38, 32],
  [20, 28, 36, 44, 55, 64, 74, 85, 90, 82, 70, 58, 46, 34],
];

export const ExplorerLayout: React.FC<RoleLayoutProps> = ({ children }) => {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <motion.section variants={cardVariants} custom={0}>
          <GlassCard variant="elevated" glowColor="purple" className="overflow-hidden">
            <GlassCardHeader className="flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <GlassCardTitle className="text-2xl">Recording Controls</GlassCardTitle>
                <GlassCardDescription>
                  Arm tracks, monitor levels, and capture the explorer perspective with a single tap.
                </GlassCardDescription>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <button
                  type="button"
                  className={cn(
                    recordingButtonBase,
                    'bg-gradient-to-r from-rose-500/80 via-red-500/70 to-orange-500/70 text-white shadow-[0_30px_95px_-45px_rgba(248,113,113,0.95)] hover:scale-[1.02] focus-visible:ring-rose-400/70'
                  )}
                >
                  <span className="absolute inset-0 bg-white/10 opacity-0 transition duration-500 hover:opacity-100" />
                  <span className="relative z-10 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-300 shadow-[0_0_15px_rgba(248,113,113,0.9)]" />
                    Start Capture
                  </span>
                </button>
                <button
                  type="button"
                  className={cn(
                    recordingButtonBase,
                    'h-11 bg-white/10 text-sm font-medium text-slate-100 hover:bg-white/15 sm:w-40'
                  )}
                >
                  Arm Secondary Feed
                </button>
              </div>
            </GlassCardHeader>
            <GlassCardContent className="gap-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {["Voice", "Environment", "Diagnostics"].map((channel, index) => (
                  <div
                    key={channel}
                    className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-4"
                  >
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                      <span>{channel}</span>
                      <span className="font-semibold text-slate-100">Ready</span>
                    </div>
                    <div className="flex h-20 items-end justify-between gap-1 overflow-hidden rounded-xl bg-gradient-to-br from-white/5 via-white/10 to-white/5 p-2">
                      {meterSamples[index]?.map((height, levelIndex) => (
                        <span
                          key={`${channel}-meter-${levelIndex}`}
                          className="w-1 rounded-full bg-gradient-to-t from-sky-500/40 via-blue-500/35 to-cyan-400/35"
                          style={{ height: `${height}%` }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-slate-300">Peak: -4.3 dB</span>
                  </div>
                ))}
              </div>
            </GlassCardContent>
          </GlassCard>
        </motion.section>

        <motion.section variants={cardVariants} custom={1}>
          <GlassCard variant="elevated" glowColor="blue">
            <GlassCardHeader>
              <GlassCardTitle>Asset Status</GlassCardTitle>
              <GlassCardDescription>
                Monitor explorer-assigned cues, field notes, and live channel health. Customize the feed below.
              </GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent className="gap-6">
              <div className="grid gap-4 md:grid-cols-2">
                {["Navigator Sync", "Audio Markers", "Waypoint Notes", "Spectral Capture"].map(title => (
                  <div key={title} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-sm font-medium text-slate-100">{title}</p>
                    <p className="mt-2 text-xs text-slate-300">All systems green • Updated moments ago</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-cyan-300/80">
                      <span className="h-2 w-2 rounded-full bg-cyan-300" />
                      Stable telemetry
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6">
                {children}
              </div>
            </GlassCardContent>
          </GlassCard>
        </motion.section>

        <motion.section variants={cardVariants} custom={2}>
          <GlassCard variant="default" glowColor="green">
            <GlassCardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <GlassCardTitle className="text-lg">Telemetry &amp; Diagnostics</GlassCardTitle>
                <GlassCardDescription>
                  Maintain situational awareness of vitals, location, and link stability.
                </GlassCardDescription>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                Link Secure
              </span>
            </GlassCardHeader>
            <GlassCardContent className="gap-5 text-sm text-slate-200">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Coordinates</p>
                  <p className="mt-2 text-lg font-semibold text-white">48.8584° N</p>
                  <p className="text-sm text-slate-300">2.2945° E</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Network</p>
                  <p className="mt-2 text-lg font-semibold text-white">19 ms RTT</p>
                  <p className="text-sm text-slate-300">Packet health 99.4%</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Vitals</p>
                  <p className="mt-2 text-lg font-semibold text-white">Calm • 72 BPM</p>
                  <p className="text-sm text-slate-300">Breath steady</p>
                </div>
              </div>
            </GlassCardContent>
            <GlassCardFooter className="text-xs uppercase tracking-wide text-slate-400">
              Channel integrity: 98.7% • Sync drift: &lt; 1.2 ms
            </GlassCardFooter>
          </GlassCard>
        </motion.section>
      </div>
    </motion.div>
  );
};

