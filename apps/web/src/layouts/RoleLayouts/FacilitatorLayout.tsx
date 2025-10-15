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
import type { RoleLayoutProps } from './types';

const transitionEase = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: transitionEase },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: transitionEase,
      delay: index * 0.08,
    },
  }),
};

const expandableSectionClasses =
  'flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-white/15';

export const FacilitatorLayout: React.FC<RoleLayoutProps> = ({ children }) => {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-slate-950/95 px-4 py-6 text-slate-100 sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
          <motion.section variants={cardVariants} custom={0}>
            <GlassCard variant="elevated" glowColor="blue" className="h-full">
              <GlassCardHeader className="mb-6">
                <GlassCardTitle className="text-2xl">Asset Library</GlassCardTitle>
                <GlassCardDescription>
                  Curate, queue, and deploy assets for the current session. Expand a category to review
                  the available tracks and cues.
                </GlassCardDescription>
              </GlassCardHeader>
              <GlassCardContent className="gap-4">
                {['Soundscapes', 'Voice Overs', 'FX Cues'].map(label => (
                  <details
                    key={label}
                    className={`${expandableSectionClasses} [&[open]>summary_svg]:rotate-180`}
                  >
                    <summary className="flex cursor-pointer select-none items-center justify-between gap-4 text-base font-medium text-white">
                      <span>{label}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="h-5 w-5 transition-transform duration-300"
                      >
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    <div className="pt-3 text-sm text-slate-200">
                      <p className="mb-2 text-slate-300">
                        Drag and drop to reorder the playback queue or double click to audition the selection.
                      </p>
                      <ul className="flex flex-col gap-2">
                        {[1, 2, 3].map(item => (
                          <li
                            key={`${label}-${item}`}
                            className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-2"
                          >
                            <span className="truncate">{label} Track {item}</span>
                            <span className="text-xs uppercase tracking-wide text-slate-400">Ready</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ))}
              </GlassCardContent>
            </GlassCard>
          </motion.section>

          <motion.section variants={cardVariants} custom={1} className="flex flex-col gap-6">
            <GlassCard variant="elevated" glowColor="purple">
              <GlassCardHeader>
                <GlassCardTitle>Mixer &amp; Controls</GlassCardTitle>
                <GlassCardDescription>
                  Blend live feeds, adjust routing, and automate crossfades. Insert session-specific controls below.
                </GlassCardDescription>
              </GlassCardHeader>
              <GlassCardContent className="gap-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {["Master", "Aux", "Comms", "Monitor"].map(channel => (
                    <div
                      key={channel}
                      className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-4"
                    >
                      <div className="flex items-center justify-between text-sm uppercase tracking-wide text-slate-300">
                        <span>{channel}</span>
                        <span className="text-xs text-slate-400">-6.0 dB</span>
                      </div>
                      <div className="h-24 rounded-xl bg-gradient-to-b from-sky-400/40 via-blue-500/30 to-indigo-500/30">
                        <div className="h-1/2 w-full rounded-t-xl bg-white/30" />
                      </div>
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10"
                      >
                        Snapshot
                      </button>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-sm text-slate-200">
                  {children}
                </div>
              </GlassCardContent>
              <GlassCardFooter className="flex flex-wrap gap-3 text-xs uppercase tracking-wide text-slate-400">
                <span>Live mode</span>
                <span>Auto record enabled</span>
                <span>Latency guard: 18ms</span>
              </GlassCardFooter>
            </GlassCard>

            <GlassCard variant="default" glowColor="green">
              <GlassCardHeader className="flex-row items-center justify-between">
                <div>
                  <GlassCardTitle className="text-lg">Collaboration Hub</GlassCardTitle>
                  <GlassCardDescription>
                    Coordinate with explorers and listeners, review active cues, and broadcast notes in real time.
                  </GlassCardDescription>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300">
                  3 active contributors
                </span>
              </GlassCardHeader>
              <GlassCardContent className="gap-3 text-sm">
                <div className="flex flex-col gap-3">
                  {["Explorer channel synced", "Listener latency check ok", "Backup feed standing by"].map(message => (
                    <div
                      key={message}
                      className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3"
                    >
                      <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-400" />
                      <p className="text-slate-200">{message}</p>
                    </div>
                  ))}
                </div>
              </GlassCardContent>
            </GlassCard>
          </motion.section>
        </div>
      </div>
    </motion.div>
  );
};

