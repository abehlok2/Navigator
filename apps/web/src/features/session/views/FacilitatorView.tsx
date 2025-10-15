import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import AssetLibrary from '../../assets/components/AssetLibrary';
import FacilitatorMixerPanel from '../../audio/components/FacilitatorMixerPanel';
import DuckingEditor from '../../audio/components/DuckingEditor';
import ParticipantGrid, { type ParticipantGridProps } from '../../room/components/ParticipantGrid';
import { useSessionStore } from '../../../state/session';
import { FacilitatorLayout } from '../../../layouts/RoleLayouts/FacilitatorLayout';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../../../components/ui/glass-card';
import { cn } from '../../../lib/utils';
import type { TelemetryLevels } from '../../control/protocol';
import type { ConnectionStatus } from '../../../state/session';

const MOBILE_SECTIONS = [
  { id: 'assets', label: 'Assets' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'participants', label: 'Participants' },
] as const;

const collapseVariants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.35, ease: 'easeOut' as const },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.25, ease: 'easeIn' as const },
  },
};

type MobileSectionId = (typeof MOBILE_SECTIONS)[number]['id'];
type PanelKey = 'ducking' | 'telemetry';

type FacilitatorViewProps = Pick<
  ParticipantGridProps,
  |
    'participants'
  | 'currentParticipantId'
  | 'selectedParticipantId'
  | 'selectableParticipantIds'
  | 'onSelectParticipant'
  | 'canModerate'
  | 'onChangeRole'
  | 'onRemoveParticipant'
  | 'pendingModeration'
>;

const MIN_DBFS = -80;
const MAX_DBFS = 6;

function normaliseDbfs(value: number): number {
  const clamped = Math.max(MIN_DBFS, Math.min(MAX_DBFS, value));
  return ((clamped - MIN_DBFS) / (MAX_DBFS - MIN_DBFS)) * 100;
}

function formatDbfs(value: number): string {
  return `${value.toFixed(1)} dBFS`;
}

function useHeartbeatAge(lastHeartbeat: number | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return lastHeartbeat ? Math.max(0, now - lastHeartbeat) : null;
}

interface TelemetryDashboardProps {
  telemetry: TelemetryLevels | null;
  connection: ConnectionStatus;
  heartbeatAgeMs: number | null;
  manifestStats: {
    total: number;
    loaded: number;
    missing: number;
    pending: number;
    loadedPercent: number;
  };
  participantCount: number;
}

function TelemetryDashboard({
  telemetry,
  connection,
  heartbeatAgeMs,
  manifestStats,
  participantCount,
}: TelemetryDashboardProps) {
  const heartbeatSeconds = heartbeatAgeMs != null ? Math.round(heartbeatAgeMs / 1000) : null;
  const heartbeatLabel = heartbeatSeconds == null ? 'No signal' : `${heartbeatSeconds}s ago`;
  const connectionLabel = (() => {
    switch (connection) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting…';
      default:
        return 'Disconnected';
    }
  })();
  const connectionTone =
    connection === 'connected'
      ? 'text-emerald-300'
      : connection === 'connecting'
        ? 'text-amber-300'
        : 'text-rose-300';

  return (
    <GlassCard variant="elevated" glowColor="blue" className="w-full">
      <GlassCardHeader className="flex-col gap-3 border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <GlassCardTitle className="text-xl text-white">Telemetry dashboard</GlassCardTitle>
          <GlassCardDescription className="text-sm text-slate-200/80">
            Live signal health pulled from the explorer and facilitator control channel.
          </GlassCardDescription>
        </div>
        <div className="flex flex-col items-start gap-2 text-xs uppercase tracking-[0.3em] text-slate-400 sm:items-end">
          <span className={connectionTone}>{connectionLabel}</span>
          <span>Heartbeat {heartbeatLabel}</span>
        </div>
      </GlassCardHeader>
      <GlassCardContent className="gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryMetric
            label="Manifest ready"
            value={`${manifestStats.loaded}/${manifestStats.total}`}
            hint={`${manifestStats.loadedPercent}% loaded`}
          />
          <SummaryMetric
            label="Pending assets"
            value={manifestStats.pending.toString()}
            hint="Awaiting explorer ack"
          />
          <SummaryMetric
            label="Missing assets"
            value={manifestStats.missing.toString()}
            hint={manifestStats.missing > 0 ? 'Explorer reports missing items' : 'All assets confirmed'}
          />
          <SummaryMetric
            label="Participants"
            value={participantCount.toString()}
            hint={participantCount === 1 ? 'Solo facilitator session' : 'Active connections in room'}
          />
        </div>

        {telemetry ? (
          <div className="grid gap-4 md:grid-cols-2">
            <TelemetryMeter
              label="Speech input"
              value={telemetry.mic}
              description="Includes facilitator microphone and any live commentary feeds."
            />
            <TelemetryMeter
              label="Program mix"
              value={telemetry.program}
              description="Combined program bus before ducking is applied."
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm text-slate-200">
            Awaiting telemetry data from the explorer. Once a connection is established you will see live mix levels here.
          </div>
        )}
      </GlassCardContent>
    </GlassCard>
  );
}

function SummaryMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-slate-200">
      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{label}</span>
      <span className="text-2xl font-semibold text-white">{value}</span>
      <span className="text-xs text-slate-300/80">{hint}</span>
    </div>
  );
}

function TelemetryMeter({ label, value, description }: { label: string; value: number; description: string }) {
  const progress = normaliseDbfs(value);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-200">
        <span>{label}</span>
        <span className="font-mono text-xs text-slate-300/90">{formatDbfs(value)}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800/60">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-slate-300/80">{description}</p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="text-lg font-semibold uppercase tracking-[0.3em] text-slate-400">{title}</h2>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition',
        active
          ? 'border-white/40 bg-white/15 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.05)]'
          : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]'
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function MobileTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 min-w-[140px] rounded-full border px-4 py-2 text-sm font-semibold tracking-wide text-slate-200 transition',
        active
          ? 'border-white/40 bg-white/20 text-white shadow-lg shadow-sky-500/20'
          : 'border-white/10 bg-white/[0.06] hover:border-white/25 hover:bg-white/[0.12]'
      )}
    >
      {label}
    </button>
  );
}

export default function FacilitatorView({
  participants = [],
  currentParticipantId,
  selectedParticipantId,
  selectableParticipantIds,
  onSelectParticipant,
  canModerate,
  onChangeRole,
  onRemoveParticipant,
  pendingModeration,
}: FacilitatorViewProps) {
  const {
    manifest,
    remoteAssets,
    remoteMissing,
    telemetry,
    connection,
    lastHeartbeat,
    control,
  } = useSessionStore(state => ({
    manifest: state.manifest,
    remoteAssets: state.remoteAssets,
    remoteMissing: state.remoteMissing,
    telemetry: state.telemetry,
    connection: state.connection,
    lastHeartbeat: state.lastHeartbeat,
    control: state.control,
  }));

  const manifestStats = useMemo(() => {
    const entries = Object.values(manifest);
    const total = entries.length;
    const loaded = total === 0 ? 0 : Array.from(remoteAssets).filter(id => manifest[id]).length;
    const missing = Array.from(remoteMissing).filter(id => manifest[id]).length;
    const pending = Math.max(total - loaded - missing, 0);
    const loadedPercent = total === 0 ? 0 : Math.round((loaded / total) * 100);
    return { total, loaded, missing, pending, loadedPercent };
  }, [manifest, remoteAssets, remoteMissing]);

  const heartbeatAgeMs = useHeartbeatAge(lastHeartbeat);
  const [mobileSection, setMobileSection] = useState<MobileSectionId>('mixer');
  const [panels, setPanels] = useState<Record<PanelKey, boolean>>({ ducking: true, telemetry: true });

  const togglePanel = (panel: PanelKey) => {
    setPanels(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  const mobileContent: Record<MobileSectionId, React.ReactNode> = {
    assets: <AssetLibrary />,
    mixer: <FacilitatorMixerPanel />,
    participants: (
      <ParticipantGrid
        participants={participants}
        currentParticipantId={currentParticipantId}
        selectedParticipantId={selectedParticipantId}
        selectableParticipantIds={selectableParticipantIds}
        onSelectParticipant={onSelectParticipant}
        canModerate={canModerate}
        onChangeRole={onChangeRole}
        onRemoveParticipant={onRemoveParticipant}
        pendingModeration={pendingModeration}
      />
    ),
  };

  return (
    <FacilitatorLayout>
      <div className="flex flex-col gap-8">
        <GlassCard variant="default" glowColor="green" className="border-white/5 bg-white/[0.03]">
          <GlassCardHeader className="flex-col gap-4 text-slate-200 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <GlassCardTitle className="text-xl text-white">Session overview</GlassCardTitle>
              <GlassCardDescription className="max-w-2xl text-sm text-slate-200/80">
                Monitor explorer readiness, asset delivery, and room participation in one glance.
              </GlassCardDescription>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs uppercase tracking-[0.3em] text-slate-400 sm:text-right">
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-slate-200">
                {manifestStats.loadedPercent}% assets ready
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-slate-200">
                {participants.length} participants
              </div>
            </div>
          </GlassCardHeader>
        </GlassCard>

        <div className="lg:hidden">
          <SectionTitle title="Control surface" />
          <div className="mt-4 flex flex-wrap gap-2">
            {MOBILE_SECTIONS.map(section => (
              <MobileTabButton
                key={section.id}
                label={section.label}
                active={mobileSection === section.id}
                onClick={() => setMobileSection(section.id)}
              />
            ))}
          </div>
          <div className="mt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={mobileSection}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col gap-6"
              >
                {mobileContent[mobileSection]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="hidden lg:grid gap-6 lg:[grid-template-columns:minmax(0,1.05fr)_minmax(0,1.25fr)] xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,0.95fr)]">
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="flex flex-col gap-6"
          >
            <AssetLibrary />
          </motion.section>
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="flex flex-col gap-6"
          >
            <FacilitatorMixerPanel />
          </motion.section>
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="flex flex-col gap-6 lg:col-span-2 xl:col-span-1"
          >
            <ParticipantGrid
              participants={participants}
              currentParticipantId={currentParticipantId}
              selectedParticipantId={selectedParticipantId}
              selectableParticipantIds={selectableParticipantIds}
              onSelectParticipant={onSelectParticipant}
              canModerate={canModerate}
              onChangeRole={onChangeRole}
              onRemoveParticipant={onRemoveParticipant}
              pendingModeration={pendingModeration}
            />
          </motion.section>
        </div>

        <section className="space-y-4">
          <SectionTitle title="Signal processing" />
          <div className="flex flex-wrap gap-2">
            <ToggleButton active={panels.ducking} onClick={() => togglePanel('ducking')} label="Ducking">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M4 17h10M4 7h10" />
              </svg>
            </ToggleButton>
            <ToggleButton active={panels.telemetry} onClick={() => togglePanel('telemetry')} label="Telemetry">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 18 9 6l4 9 3-6 4 9" />
              </svg>
            </ToggleButton>
          </div>
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {panels.ducking && (
                <motion.div key="ducking" variants={collapseVariants} initial="initial" animate="animate" exit="exit">
                  <DuckingEditor control={control} className="w-full" />
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {panels.telemetry && (
                <motion.div key="telemetry" variants={collapseVariants} initial="initial" animate="animate" exit="exit">
                  <TelemetryDashboard
                    telemetry={telemetry}
                    connection={connection}
                    heartbeatAgeMs={heartbeatAgeMs}
                    manifestStats={manifestStats}
                    participantCount={participants.length}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </FacilitatorLayout>
  );
}
