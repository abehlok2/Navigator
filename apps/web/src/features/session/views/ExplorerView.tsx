import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, cubicBezier } from 'framer-motion';

import AssetLibrary from '../../assets/components/AssetLibrary';
import RecordingStudio from '../../recording/components/RecordingStudio';
import RecordingLibrary from '../../recording/components/RecordingLibrary';
import ConnectionStatus from '../ConnectionStatus';
import { ExplorerLayout } from '../../../layouts/RoleLayouts';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../../../components/ui/glass-card';
import { Button } from '../../../components/ui/button';
import { StatusIndicator } from '../../../components/ui/status-indicator';
import { cn } from '../../../lib/utils';
import { formatBytes } from '../../../lib/format';
import { useSessionStore } from '../../../state/session';
import { useRecordingLibraryStore } from '../../recording/state';

const sectionEase: Transition['ease'] = [0.16, 1, 0.3, 1];

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (custom: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: cubicBezier(0.16, 1, 0.3, 1),
      delay: index * 0.08,
    },
  }),
};

const collapseVariants: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.35, ease: 'easeOut' },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.25, ease: 'easeIn' },
  },
};

const toneClasses: Record<'positive' | 'neutral' | 'warning', string> = {
  positive: 'text-emerald-300',
  neutral: 'text-slate-200',
  warning: 'text-amber-300',
};

function formatDbfs(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(1)} dBFS`;
}

export default function ExplorerView() {
  const { manifest, assets, remoteAssets, remoteMissing, telemetry, connection } = useSessionStore(state => ({
    manifest: state.manifest,
    assets: state.assets,
    remoteAssets: state.remoteAssets,
    remoteMissing: state.remoteMissing,
    telemetry: state.telemetry,
    connection: state.connection,
  }));
  const recordings = useRecordingLibraryStore(state => state.recordings);

  const manifestEntries = useMemo(() => Object.values(manifest), [manifest]);
  const totalAssets = manifestEntries.length;

  const localLoadedCount = useMemo(
    () => manifestEntries.reduce((count, entry) => count + (assets.has(entry.id) ? 1 : 0), 0),
    [assets, manifestEntries]
  );

  const localPendingCount = totalAssets - localLoadedCount;
  const remoteReadyCount = remoteAssets.size;

  const totalBytes = useMemo(
    () => manifestEntries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
    [manifestEntries]
  );

  const localBytes = useMemo(
    () => manifestEntries.reduce((sum, entry) => sum + (assets.has(entry.id) ? entry.bytes ?? 0 : 0), 0),
    [assets, manifestEntries]
  );

  const pendingBytes = Math.max(0, totalBytes - localBytes);

  const latestRecording = useMemo(() => {
    if (!recordings.length) return null;
    return recordings.reduce((latest, item) => (latest.createdAt > item.createdAt ? latest : item));
  }, [recordings]);

  const [libraryOpen, setLibraryOpen] = useState(recordings.length > 0);

  return (
    <ExplorerLayout>
      <motion.div
        initial="hidden"
        animate="visible"
        className="flex min-h-screen flex-col gap-8 pb-10"
      >
        <motion.section variants={sectionVariants} custom={0} className="w-full">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <GlassCard variant="elevated" glowColor="purple" className="overflow-hidden">
              <GlassCardHeader className="flex-col gap-3 border-white/10 pb-6">
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-slate-400">
                  <StatusIndicator status={connection === 'connected' ? 'connected' : connection === 'connecting' ? 'connecting' : 'disconnected'} />
                  <span>Explorer capture</span>
                </div>
                <div className="space-y-2">
                  <GlassCardTitle className="text-2xl text-white">Recording studio</GlassCardTitle>
                  <GlassCardDescription className="text-sm text-slate-200/80">
                    Arm, monitor, and capture the explorer feed with streamlined controls tailored for field work.
                  </GlassCardDescription>
                </div>
              </GlassCardHeader>
              <GlassCardContent className="px-0 pb-0">
                <RecordingStudio />
              </GlassCardContent>
            </GlassCard>

            <div className="flex flex-col gap-6">
              <ConnectionStatus />

              <GlassCard variant="default" glowColor="blue" className="h-full">
                <GlassCardHeader className="border-white/10 pb-5">
                  <GlassCardTitle className="text-lg text-white">Live mix snapshot</GlassCardTitle>
                  <GlassCardDescription className="text-sm text-slate-200/80">
                    Confidence monitors for current capture health and recently logged takes.
                  </GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="gap-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <StatusMetric
                      label="Program bus"
                      value={formatDbfs(telemetry?.program ?? null)}
                      helper="Post-mix level"
                      tone={telemetry?.program && telemetry.program > -12 ? 'positive' : 'neutral'}
                    />
                    <StatusMetric
                      label="Mic return"
                      value={formatDbfs(telemetry?.mic ?? null)}
                      helper="Facilitator commentary"
                      tone={telemetry?.mic && telemetry.mic > -18 ? 'positive' : 'neutral'}
                    />
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">
                    {recordings.length ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-[0.35em] text-slate-400">
                          Library
                        </span>
                        <span className="text-lg font-semibold text-white">
                          {recordings.length} {recordings.length === 1 ? 'take captured' : 'takes captured'}
                        </span>
                        {latestRecording ? (
                          <span className="text-xs text-slate-300/80">
                            Latest take saved {new Date(latestRecording.createdAt).toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-[0.35em] text-slate-400">
                          Library
                        </span>
                        <span className="text-lg font-semibold text-white">No captured takes yet</span>
                        <span className="text-xs text-slate-300/80">
                          Takes will appear here the moment you finish a recording.
                        </span>
                      </div>
                    )}
                  </div>
                </GlassCardContent>
              </GlassCard>
            </div>
          </div>
        </motion.section>

        <motion.section variants={sectionVariants} custom={1} className="w-full">
          <GlassCard variant="elevated" glowColor="cyan" className="overflow-hidden">
            <GlassCardHeader className="flex flex-col gap-5 border-white/10 pb-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <GlassCardTitle className="text-2xl text-white">Asset runway</GlassCardTitle>
                <GlassCardDescription className="text-sm text-slate-200/80">
                  Keep pace with facilitator drops, verify explorer availability, and watch for incoming cues in real time.
                </GlassCardDescription>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <AssetSummary
                  label="Local ready"
                  value={`${localLoadedCount}/${totalAssets}`}
                  helper={formatBytes(localBytes)}
                  tone={localPendingCount === 0 ? 'positive' : 'neutral'}
                />
                <AssetSummary
                  label="Incoming"
                  value={localPendingCount > 0 ? `${localPendingCount}` : '0'}
                  helper={pendingBytes > 0 ? `${formatBytes(pendingBytes)} pending` : 'All synced'}
                  tone={localPendingCount > 0 ? 'warning' : 'positive'}
                />
                <AssetSummary
                  label="Facilitator ready"
                  value={`${remoteReadyCount}/${totalAssets}`}
                  helper={remoteMissing.size ? `${remoteMissing.size} flagged missing` : 'All confirmed'}
                  tone={remoteMissing.size ? 'warning' : 'positive'}
                />
                <AssetSummary
                  label="Manifest size"
                  value={formatBytes(totalBytes)}
                  helper="Across all cues"
                />
              </div>
            </GlassCardHeader>
            <GlassCardContent className="gap-6">
              <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-1 shadow-inner shadow-cyan-500/10">
                <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-slate-300 backdrop-blur">
                  <span>Read-only explorer view</span>
                  <span className="text-slate-400">Controls managed by facilitator</span>
                </div>
                <div className="[&_button]:pointer-events-none [&_input]:pointer-events-none [&_select]:pointer-events-none [&_textarea]:pointer-events-none">
                  <AssetLibrary />
                </div>
              </div>
            </GlassCardContent>
          </GlassCard>
        </motion.section>

        <motion.section variants={sectionVariants} custom={2} className="w-full">
          <GlassCard variant="default" glowColor="purple" className="overflow-hidden">
            <GlassCardHeader className="flex flex-col gap-4 border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <GlassCardTitle className="text-xl text-white">Recording library</GlassCardTitle>
                <GlassCardDescription className="text-sm text-slate-200/80">
                  Review takes, annotate critical finds, and export deliverables when you return to base.
                </GlassCardDescription>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-400">
                  {recordings.length} {recordings.length === 1 ? 'take' : 'takes'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  glass
                  size="sm"
                  className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-200"
                  onClick={() => setLibraryOpen(open => !open)}
                >
                  {libraryOpen ? 'Collapse' : 'Expand'}
                </Button>
              </div>
            </GlassCardHeader>
            <AnimatePresence initial={false}>
              {libraryOpen ? (
                <motion.div
                  key="recording-library"
                  variants={collapseVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <GlassCardContent className="px-0 pb-0">
                    <RecordingLibrary />
                  </GlassCardContent>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </GlassCard>
        </motion.section>
      </motion.div>
    </ExplorerLayout>
  );
}

interface StatusMetricProps {
  label: string;
  value: string;
  helper?: string;
  tone?: keyof typeof toneClasses;
}

function StatusMetric({ label, value, helper, tone = 'neutral' }: StatusMetricProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">{label}</p>
      <p className={cn('mt-3 text-2xl font-semibold text-white', toneClasses[tone])}>{value}</p>
      {helper ? <p className="mt-2 text-xs text-slate-300/80">{helper}</p> : null}
    </div>
  );
}

interface AssetSummaryProps {
  label: string;
  value: string;
  helper?: string;
  tone?: keyof typeof toneClasses;
}

function AssetSummary({ label, value, helper, tone = 'neutral' }: AssetSummaryProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
      <p className="text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">{label}</p>
      <p className={cn('mt-3 text-2xl font-semibold text-white', toneClasses[tone])}>{value}</p>
      {helper ? <p className="mt-2 text-xs text-slate-300/80">{helper}</p> : null}
    </div>
  );
}
