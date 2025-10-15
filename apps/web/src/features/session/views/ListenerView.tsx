import React, { useEffect, useMemo, useState } from 'react';

import { ListenerLayout } from '../../../layouts/RoleLayouts/ListenerLayout';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardFooter,
  GlassCardHeader,
  GlassCardTitle,
} from '../../../components/ui/glass-card';
import { cn } from '../../../lib/utils';
import { useSessionStore, type ConnectionStatus } from '../../../state/session';
import type { ParticipantSummary } from '../api';
import { VUMeter } from '../../audio/components/VUMeter';
import { getRemoteFacilitatorBus } from '../../audio/context';

interface ListenerViewProps {
  participants: ParticipantSummary[];
  participantId: string | null;
  facilitatorId: string | null;
  username?: string | null;
}

const MIN_DB = -60;
const MAX_DB = 6;

const STATUS_META: Record<
  ConnectionStatus,
  { label: string; description: string; tone: string; indicator: string }
> = {
  connected: {
    label: 'Connected',
    description: 'Streaming the facilitator program mix.',
    tone: 'text-emerald-200',
    indicator: 'bg-emerald-400 shadow-[0_0_22px_rgba(52,211,153,0.45)]',
  },
  connecting: {
    label: 'Connecting…',
    description: 'Negotiating a secure audio link.',
    tone: 'text-amber-200',
    indicator: 'bg-amber-400 shadow-[0_0_22px_rgba(250,204,21,0.4)]',
  },
  disconnected: {
    label: 'Disconnected',
    description: 'Waiting for a facilitator signal.',
    tone: 'text-rose-200',
    indicator: 'bg-rose-400 shadow-[0_0_22px_rgba(248,113,113,0.45)]',
  },
};

const linearToDb = (value: number): number => (value <= 0 ? MIN_DB : 20 * Math.log10(value));

export default function ListenerView({
  participants,
  participantId,
  facilitatorId,
  username,
}: ListenerViewProps) {
  const { connection, telemetry, lastHeartbeat } = useSessionStore(state => ({
    connection: state.connection,
    telemetry: state.telemetry,
    lastHeartbeat: state.lastHeartbeat,
  }));

  const [now, setNow] = useState(() => Date.now());
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bus = getRemoteFacilitatorBus();
    setVolume(bus.gain.value);
  }, []);

  const listener = useMemo(
    () => (participantId ? participants.find(p => p.id === participantId) ?? null : null),
    [participants, participantId]
  );

  const facilitator = useMemo(() => {
    if (facilitatorId) {
      return participants.find(p => p.id === facilitatorId) ?? null;
    }
    return participants.find(p => p.role === 'facilitator') ?? null;
  }, [facilitatorId, participants]);

  const connectedCount = useMemo(
    () => participants.filter(p => p.connected).length,
    [participants]
  );

  const heartbeatSeconds = useMemo(() => {
    if (!lastHeartbeat) return null;
    return Math.max(0, Math.round((now - lastHeartbeat) / 1000));
  }, [lastHeartbeat, now]);

  const status = STATUS_META[connection];

  const programDb = telemetry ? linearToDb(telemetry.program) : MIN_DB;
  const speechDb = telemetry ? linearToDb(telemetry.mic) : MIN_DB;

  const receivingActive = connection === 'connected' && programDb > -50;

  const handleVolumeChange = (value: number) => {
    setVolume(value);
    if (typeof window === 'undefined') return;
    const bus = getRemoteFacilitatorBus();
    bus.gain.value = value;
  };

  const onVolumeSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value) / 100;
    handleVolumeChange(next);
  };

  const volumePercent = Math.round(volume * 100);

  const listenerLabel = username || listener?.id || 'Listener';

  return (
    <ListenerLayout>
      <div className="flex flex-col gap-6">
        <GlassCard variant="elevated" glowColor="blue">
          <GlassCardHeader className="gap-3 border-white/10 pb-4">
            <GlassCardTitle className="text-2xl text-white">Connection status</GlassCardTitle>
            <GlassCardDescription className="text-slate-200/80">
              Stay in receive-only mode while we manage the transport link in the background.
            </GlassCardDescription>
          </GlassCardHeader>
          <GlassCardContent className="gap-6">
            <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className={cn('h-3 w-3 rounded-full', status.indicator)} aria-hidden />
                <div>
                  <p className={cn('text-xl font-semibold text-white', status.tone)}>{status.label}</p>
                  <p className="text-sm text-slate-200/80">{status.description}</p>
                </div>
              </div>
              <div className="flex flex-col items-start gap-2 text-xs uppercase tracking-[0.3em] text-slate-400 sm:items-end">
                <span>{heartbeatSeconds === null ? 'Heartbeat waiting…' : `Heartbeat ${heartbeatSeconds}s ago`}</span>
                <span>{connectedCount} participant{connectedCount === 1 ? '' : 's'} live</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatusTile label="You are" value={listenerLabel} helper="Listening privately" />
              <StatusTile
                label="Facilitator"
                value={facilitator ? facilitator.id : 'Not selected'}
                helper={facilitator?.connected ? 'Signal online' : 'Awaiting link'}
                tone={facilitator?.connected ? 'positive' : 'neutral'}
              />
              <StatusTile
                label="Mode"
                value="Receive only"
                helper="No microphone or control data leaves this device"
              />
            </div>
          </GlassCardContent>
          <GlassCardFooter className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Connection managed automatically
          </GlassCardFooter>
        </GlassCard>

        <GlassCard variant="elevated" glowColor="purple">
          <GlassCardHeader className="gap-3 border-white/10 pb-4">
            <GlassCardTitle className="text-2xl text-white">What you are hearing</GlassCardTitle>
            <GlassCardDescription className="text-slate-200/80">
              Live program levels mirror the facilitator output. Adjust the volume to taste on this device only.
            </GlassCardDescription>
          </GlassCardHeader>
          <GlassCardContent className="gap-6">
            <div
              className={cn(
                'flex flex-col gap-3 rounded-3xl border p-5 text-sm sm:flex-row sm:items-center sm:justify-between',
                receivingActive
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-200'
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'h-3 w-3 rounded-full',
                    receivingActive
                      ? 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.65)]'
                      : 'bg-slate-400/60 shadow-[0_0_12px_rgba(148,163,184,0.35)]'
                  )}
                  aria-hidden
                />
                <div>
                  <p className="text-base font-semibold uppercase tracking-[0.35em]">Receiving audio</p>
                  <p className="text-xs uppercase tracking-[0.25em]">
                    {receivingActive ? 'Live stream active' : 'Waiting for facilitator mix'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-100/80 sm:text-right">
                Audio is routed locally only. You will never transmit.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <MeterBlock title="Program mix" description="Main facilitator playback" rmsDb={programDb} />
              <MeterBlock title="Guidance" description="Spoken cues from facilitator" rmsDb={speechDb} />
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span className="font-semibold uppercase tracking-[0.3em] text-slate-300">Volume</span>
                <span className="font-mono text-xs text-slate-400">{volumePercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volumePercent}
                onChange={onVolumeSliderChange}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800/80"
                aria-label="Playback volume"
              />
              <p className="text-xs text-slate-400">
                Adjusts the audio you hear on this device only. Facilitator levels remain untouched.
              </p>
            </div>
          </GlassCardContent>
        </GlassCard>

        <GlassCard variant="default" glowColor="green">
          <GlassCardHeader className="gap-3 border-white/10 pb-4">
            <GlassCardTitle className="text-xl text-white">First-time listener checklist</GlassCardTitle>
            <GlassCardDescription className="text-slate-200/80">
              A quick refresher so you can settle in and focus on the experience.
            </GlassCardDescription>
          </GlassCardHeader>
          <GlassCardContent className="gap-4 text-sm text-slate-200">
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                <span>
                  Join the correct room and choose the facilitator you want to hear from the control panel on the right.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-sky-400" aria-hidden />
                <span>
                  Keep this tab in focus on mobile so the browser keeps audio playback alive. Headphones are recommended.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-purple-400" aria-hidden />
                <span>
                  You are always muted. If the audio stops, check the connection status above or tap reconnect in the room
                  panel.
                </span>
              </li>
            </ul>
          </GlassCardContent>
          <GlassCardFooter className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Settle in and enjoy the stream
          </GlassCardFooter>
        </GlassCard>
      </div>
    </ListenerLayout>
  );
}

const TONE_TEXT: Record<'neutral' | 'positive', string> = {
  neutral: 'text-slate-200',
  positive: 'text-emerald-200',
};

interface StatusTileProps {
  label: string;
  value: string;
  helper?: string;
  tone?: 'neutral' | 'positive';
}

function StatusTile({ label, value, helper, tone = 'neutral' }: StatusTileProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[0.65rem] uppercase tracking-[0.28em] text-slate-400">{label}</p>
      <p className={cn('mt-3 text-lg font-semibold text-white', TONE_TEXT[tone])}>{value}</p>
      {helper ? <p className="mt-2 text-xs text-slate-400">{helper}</p> : null}
    </div>
  );
}

interface MeterBlockProps {
  title: string;
  description: string;
  rmsDb: number;
}

function MeterBlock({ title, description, rmsDb }: MeterBlockProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between text-sm text-slate-200">
        <span className="font-semibold">{title}</span>
        <span className="font-mono text-xs text-slate-400">{rmsDb.toFixed(1)} dBFS</span>
      </div>
      <div className="flex items-end gap-4">
        <VUMeter rmsDb={rmsDb} minDb={MIN_DB} maxDb={MAX_DB} className="h-36 flex-1" />
      </div>
      <p className="text-xs text-slate-400">{description}</p>
    </div>
  );
}
