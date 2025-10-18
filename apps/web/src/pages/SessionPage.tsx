import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Circle,
  Clock3,
  LogOut,
  Mic,
  MicOff,
  RefreshCw,
  Signal,
  Square,
  Users,
} from 'lucide-react';

import AppLayout from '../layouts/AppLayout';
import ExplorerView from '../features/session/views/ExplorerView';
import FacilitatorView from '../features/session/views/FacilitatorView';
import ListenerView from '../features/session/views/ListenerView';
import { useAudioContextUnlock } from '../features/audio/context';
import {
  attachRemoteFacilitatorStream,
  resetRemoteFacilitatorStreams,
} from '../features/audio/speech';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  listParticipants,
  removeRoomParticipant,
  setRoomPassword,
  updateParticipantRole,
  type ParticipantSummary,
  type Role,
} from '../features/session/api';
import { connectWithReconnection } from '../features/webrtc/connection';
import { Button } from '../components/ui/button';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../components/ui/glass-card';
import { useAuthStore } from '../state/auth';
import { useSessionStore } from '../state/session';
import type { StatusIndicatorStatus } from '../components/ui/status-indicator';
import { StatusIndicator } from '../components/ui/status-indicator';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';

const isRole = (value: string | null): value is Role =>
  value === 'facilitator' || value === 'explorer' || value === 'listener';

const formatRole = (value: Role | null): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown';

type PendingModeration = { id: string; type: 'role' | 'remove' };

type SessionPhase = 'idle' | 'connecting' | 'ready' | 'error';

type ConnectionStage = 'idle' | 'preparing' | 'authenticating' | 'syncing' | 'negotiating';

const CONNECTION_STEPS: Array<{
  key: ConnectionStage;
  label: string;
  description: string;
}> = [
  {
    key: 'preparing',
    label: 'Preparing secure channel',
    description: 'Warming up WebRTC transport and clearing previous state.',
  },
  {
    key: 'authenticating',
    label: 'Authenticating with room',
    description: 'Verifying your access and reserving a participant slot.',
  },
  {
    key: 'syncing',
    label: 'Syncing participants',
    description: 'Fetching live roster and choosing the optimal route.',
  },
  {
    key: 'negotiating',
    label: 'Negotiating media transport',
    description: 'Trading ICE candidates and finalising control channels.',
  },
];

const STAGE_INDEX: Record<ConnectionStage, number> = {
  idle: 0,
  preparing: 1,
  authenticating: 2,
  syncing: 3,
  negotiating: 4,
};

function LoadingState({ roomId, stage }: { roomId: string; stage: ConnectionStage }) {
  return (
    <GlassCard
      variant="elevated"
      glowColor="blue"
      className="border-white/10 bg-white/[0.05]"
    >
      <GlassCardHeader className="gap-3 border-white/10 pb-4">
        <GlassCardTitle className="text-2xl text-white">
          Connecting to session
        </GlassCardTitle>
        <GlassCardDescription className="text-slate-200/80">
          Establishing a secure link to room {roomId || '—'}. Follow the
          progress below; we’ll move through each stage automatically.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent className="flex flex-col gap-6 py-8">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <motion.span
              className="absolute h-full w-full rounded-full border-2 border-sky-400/60"
              initial={{ scale: 0.75, opacity: 0.8 }}
              animate={{ scale: 1.2, opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              aria-hidden
            />
            <span
              className="h-12 w-12 animate-spin rounded-full border-2 border-slate-200/70 border-t-transparent"
              aria-hidden
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Negotiating link
            </p>
            <p className="text-sm text-slate-200/80">
              This can take a few seconds while we verify credentials and open
              the media path.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {CONNECTION_STEPS.map((step, index) => {
            const active = STAGE_INDEX[stage] >= index + 1;
            const isCurrent = STAGE_INDEX[stage] === index + 1;
            return (
              <div
                key={step.key}
                className={cn(
                  'rounded-2xl border px-4 py-3 transition-colors',
                  active
                    ? 'border-sky-400/60 bg-sky-500/10'
                    : 'border-white/10 bg-white/[0.03]'
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{step.label}</p>
                  <StatusIndicator
                    status={active ? 'connected' : 'connecting'}
                    size="sm"
                    label={active ? 'Complete' : isCurrent ? 'In progress' : 'Pending'}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-300">{step.description}</p>
              </div>
            );
          })}
        </div>
      </GlassCardContent>
    </GlassCard>
  );
}

function ErrorState({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <GlassCard
      variant="elevated"
      glowColor="purple"
      className="border-rose-400/30 bg-rose-500/10"
    >
      <GlassCardHeader className="gap-2 border-rose-400/20 pb-4">
        <GlassCardTitle className="text-2xl text-white">
          Connection issue
        </GlassCardTitle>
        <GlassCardDescription className="text-rose-100/80">
          We couldn’t complete the handshake. Double-check the room credentials
          or try connecting again.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent className="flex flex-col gap-4">
        <p className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">
          {message}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={onReset}
            variant="secondary"
            className="bg-white/15 text-white hover:bg-white/25"
          >
            Dismiss and retry
          </Button>
        </div>
      </GlassCardContent>
    </GlassCard>
  );
}

function IdleState() {
  return (
    <GlassCard
      variant="elevated"
      glowColor="blue"
      className="border-white/10 bg-white/[0.03]"
    >
      <GlassCardHeader className="gap-3 border-white/10 pb-4">
        <GlassCardTitle className="text-2xl text-white">
          Ready when you are
        </GlassCardTitle>
        <GlassCardDescription className="text-slate-200/80">
          Use the session panel to create or join a room. Once connected, we’ll
          display the control surface tailored to your role.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent className="flex flex-col gap-4 text-sm text-slate-200/80">
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          You’ll see live telemetry, asset status, and participant controls as
          soon as a connection is established.
        </p>
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          Facilitators can moderate participants, explorers can manage capture,
          and listeners stay in receive-only mode—each view activates
          automatically based on your authenticated role.
        </p>
      </GlassCardContent>
    </GlassCard>
  );
}

const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${remainingMinutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

function ConnectedBanner({ roomId }: { roomId: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard
        variant="elevated"
        glowColor="green"
        className="border-emerald-400/20 bg-emerald-500/10"
      >
        <GlassCardContent className="flex items-center justify-between gap-3 px-6 py-4">
          <div className="flex flex-col">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-200">
              Connected
            </p>
            <p className="text-sm text-emerald-100/90">
              Session link established for room {roomId || '—'}. All controls are
              live.
            </p>
          </div>
          <StatusIndicator status="connected" size="md" label="Live" />
        </GlassCardContent>
      </GlassCard>
    </motion.div>
  );
}

interface SessionHeaderBarProps {
  roomId: string;
  connectionPhase: SessionPhase;
  duration: string;
  participantsOnline: number;
  totalParticipants: number;
  isRecording: boolean;
  onLeaveSession: () => void;
  canLeave: boolean;
  leaving: boolean;
  roleLabel: string;
}

function SessionHeaderBar({
  roomId,
  connectionPhase,
  duration,
  participantsOnline,
  totalParticipants,
  isRecording,
  onLeaveSession,
  canLeave,
  leaving,
  roleLabel,
}: SessionHeaderBarProps) {
  const phaseLabel =
    connectionPhase === 'ready'
      ? 'Connected'
      : connectionPhase === 'connecting'
        ? 'Connecting'
        : connectionPhase === 'error'
          ? 'Error'
          : 'Idle';

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-lg shadow-slate-900/30 backdrop-blur">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Navigator Session</h2>
          <p className="text-sm text-slate-300">
            {roomId ? `Room ${roomId}` : 'No room selected yet'} · {roleLabel}
          </p>
        </div>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={onLeaveSession}
          disabled={!canLeave || leaving}
          loading={leaving}
          leadingIcon={<LogOut className="h-4 w-4" />}
        >
          Leave session
        </Button>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <div className="flex items-center gap-3">
            <Clock3 className="h-5 w-5 text-sky-300" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Session timer
              </p>
              <p className="text-lg font-semibold text-white">{duration}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-emerald-300" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Participants online
              </p>
              <p className="text-lg font-semibold text-white">
                {participantsOnline}/{totalParticipants}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <div className="flex items-center gap-3">
            <Signal className="h-5 w-5 text-violet-300" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Link state
              </p>
              <p className="text-lg font-semibold text-white">{phaseLabel}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <div className="flex items-center gap-3">
            <Circle
              className={cn(
                'h-5 w-5',
                isRecording ? 'text-rose-400 animate-pulse' : 'text-slate-400'
              )}
              aria-hidden
            />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Recording
              </p>
              <p className="text-lg font-semibold text-white">
                {isRecording ? 'Capturing' : 'Standby'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ParticipantsPanelProps {
  participants: ParticipantSummary[];
  participantId: string | null;
  selectedParticipantId: string;
  selectableParticipantIds: string[];
  onSelectParticipant: (id: string) => void;
  onRefreshParticipants: () => Promise<void> | void;
  loadingParticipants: boolean;
  canModerate: boolean;
  onChangeRole?: (id: string, role: Role) => void;
  onRemoveParticipant?: (id: string) => void;
  pendingModeration: PendingModeration | null;
}

const ROLE_LABELS: Record<Role, string> = {
  facilitator: 'Facilitator',
  explorer: 'Explorer',
  listener: 'Listener',
};

function ParticipantsPanel({
  participants,
  participantId,
  selectedParticipantId,
  selectableParticipantIds,
  onSelectParticipant,
  onRefreshParticipants,
  loadingParticipants,
  canModerate,
  onChangeRole,
  onRemoveParticipant,
  pendingModeration,
}: ParticipantsPanelProps) {
  return (
    <GlassCard variant="default" className="border-white/10 bg-white/5">
      <GlassCardHeader className="border-white/10 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <GlassCardTitle className="text-lg text-white">
              Active participants
            </GlassCardTitle>
            <GlassCardDescription className="text-slate-200/80">
              Select a participant to link your stream or manage their access.
            </GlassCardDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void onRefreshParticipants();
            }}
            loading={loadingParticipants}
            leadingIcon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>
      </GlassCardHeader>
      <GlassCardContent className="space-y-4">
        {participants.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            No participants are connected yet.
          </p>
        ) : (
          <div className="space-y-3">
            {participants.map(participant => {
              const isSelf = participant.id === participantId;
              const isSelected = selectedParticipantId === participant.id;
              const selectable = selectableParticipantIds.includes(participant.id);
              const pending = pendingModeration?.id === participant.id ? pendingModeration.type : null;
              return (
                <div
                  key={participant.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition',
                    isSelected
                      ? 'border-sky-400/60 bg-sky-500/10'
                      : 'border-white/10 bg-white/[0.04] hover:border-sky-400/40 hover:bg-sky-500/5'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectable) return;
                      onSelectParticipant(participant.id);
                    }}
                    className={cn(
                      'flex flex-1 items-center gap-3 text-left transition',
                      selectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-base font-semibold text-white">
                      {ROLE_LABELS[participant.role].charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white">
                        {ROLE_LABELS[participant.role]}
                        {isSelf ? ' · You' : ''}
                      </span>
                      <span className="text-xs text-slate-300">
                        {participant.connected ? 'Online' : 'Offline'}
                        {isSelected && !isSelf ? ' · Target' : ''}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center gap-3">
                    <StatusIndicator
                      status={participant.connected ? 'connected' : 'disconnected'}
                      size="sm"
                      label={null}
                    />
                    {canModerate && !isSelf ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={participant.role}
                          onChange={event => {
                            onChangeRole?.(participant.id, event.target.value as Role);
                          }}
                          className="rounded-xl border border-white/20 bg-white/10 px-3 py-1 text-xs text-white focus:border-sky-400/60 focus:outline-none"
                        >
                          {Object.entries(ROLE_LABELS).map(([role, label]) => (
                            <option key={role} value={role} className="bg-slate-900 text-white">
                              {label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs text-rose-300 hover:text-rose-200"
                          onClick={() => onRemoveParticipant?.(participant.id)}
                          loading={pending === 'remove'}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : null}
                    {pending === 'role' && (
                      <Badge variant="muted" className="bg-white/10 text-xs text-slate-200">
                        Updating…
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCardContent>
    </GlassCard>
  );
}

interface SessionInfoCardProps {
  roomId: string;
  onRoomIdChange: (value: string) => void;
  joinPassword: string;
  onJoinPasswordChange: (value: string) => void;
  canCreateRoom: boolean;
  creatingRoom: boolean;
  onCreateRoom: () => Promise<boolean> | boolean;
  onJoin: () => Promise<void> | void;
  connecting: boolean;
  connectionPhase: SessionPhase;
  connectionStage: ConnectionStage;
  error: string | null;
  onResetError: () => void;
  role: Role | null;
  hasActiveSession: boolean;
}

function SessionInfoCard({
  roomId,
  onRoomIdChange,
  joinPassword,
  onJoinPasswordChange,
  canCreateRoom,
  creatingRoom,
  onCreateRoom,
  onJoin,
  connecting,
  connectionPhase,
  connectionStage,
  error,
  onResetError,
  role,
  hasActiveSession,
}: SessionInfoCardProps) {
  const status: StatusIndicatorStatus =
    connectionPhase === 'error'
      ? 'error'
      : connectionPhase === 'ready'
        ? 'connected'
        : connectionPhase === 'connecting'
          ? 'connecting'
          : 'disconnected';

  const stageLabel = (() => {
    switch (connectionStage) {
      case 'preparing':
        return 'Preparing connection';
      case 'authenticating':
        return 'Authenticating…';
      case 'syncing':
        return 'Syncing participants…';
      case 'negotiating':
        return 'Negotiating media…';
      default:
        return hasActiveSession ? 'Session ready' : 'Standing by';
    }
  })();

  return (
    <GlassCard variant="default" className="border-white/10 bg-white/5">
      <GlassCardHeader className="border-white/10 pb-4">
        <GlassCardTitle className="text-lg text-white">
          Session overview
        </GlassCardTitle>
        <GlassCardDescription className="text-slate-200/80">
          Manage room access and monitor the live link state.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <StatusIndicator status={status} size="md" label={stageLabel} />
          {role && <Badge variant="info">{formatRole(role)}</Badge>}
        </div>
        {error ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-rose-100"
                onClick={onResetError}
              >
                Clear
              </Button>
            </div>
          </div>
        ) : null}
        <div className="space-y-3">
          <div>
            <Label htmlFor="session-room" className="text-slate-200">
              Room ID
            </Label>
            <Input
              id="session-room"
              value={roomId}
              onChange={event => onRoomIdChange(event.target.value)}
              placeholder="Enter or paste room ID"
              className="mt-1 bg-white/10 text-white"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="session-password" className="text-slate-200">
              Room password
            </Label>
            <Input
              id="session-password"
              value={joinPassword}
              onChange={event => onJoinPasswordChange(event.target.value)}
              placeholder="Optional password"
              className="mt-1 bg-white/10 text-white"
              autoComplete="off"
              type="password"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => {
              void onJoin();
            }}
            loading={connecting}
            disabled={!roomId.trim()}
          >
            {connecting ? 'Connecting…' : hasActiveSession ? 'Reconnect' : 'Join session'}
          </Button>
          {canCreateRoom ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void onCreateRoom();
              }}
              loading={creatingRoom}
            >
              {creatingRoom ? 'Creating…' : 'Create new room'}
            </Button>
          ) : null}
        </div>
      </GlassCardContent>
    </GlassCard>
  );
}

interface PasswordCardProps {
  roomPassword: string;
  onPasswordChange: (value: string) => void;
  onSetPassword: () => Promise<void> | void;
  settingPassword: boolean;
  disabled: boolean;
}

function PasswordCard({
  roomPassword,
  onPasswordChange,
  onSetPassword,
  settingPassword,
  disabled,
}: PasswordCardProps) {
  return (
    <GlassCard variant="default" className="border-white/10 bg-white/5">
      <GlassCardHeader className="border-white/10 pb-4">
        <GlassCardTitle className="text-lg text-white">Room password</GlassCardTitle>
        <GlassCardDescription className="text-slate-200/80">
          Update or clear the shared password for this room.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent className="flex flex-col gap-3">
        <Input
          type="text"
          value={roomPassword}
          onChange={event => onPasswordChange(event.target.value)}
          placeholder="Set or clear the room password"
          disabled={settingPassword || disabled}
          className="bg-white/10 text-white"
        />
        <Button
          type="button"
          onClick={() => {
            void onSetPassword();
          }}
          disabled={disabled}
          loading={settingPassword}
          className="h-10"
        >
          {settingPassword ? 'Saving…' : 'Save password'}
        </Button>
      </GlassCardContent>
    </GlassCard>
  );
}

interface QuickActionsProps {
  muted: boolean;
  onToggleMute: () => void;
  recording: boolean;
  onToggleRecording: () => void;
  canLeave: boolean;
  onLeave: () => void;
  leaving: boolean;
}

function QuickActions({
  muted,
  onToggleMute,
  recording,
  onToggleRecording,
  canLeave,
  onLeave,
  leaving,
}: QuickActionsProps) {
  return (
    <GlassCard variant="default" className="mt-auto border-white/10 bg-white/5">
      <GlassCardHeader className="border-white/10 pb-4">
        <GlassCardTitle className="text-lg text-white">Quick actions</GlassCardTitle>
        <GlassCardDescription className="text-slate-200/80">
          Instant controls for your local session state.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent className="flex flex-col gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onToggleMute}
          leadingIcon={muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        >
          {muted ? 'Unmute microphone' : 'Mute microphone'}
        </Button>
        <Button
          type="button"
          variant={recording ? 'danger' : 'secondary'}
          onClick={onToggleRecording}
          leadingIcon={recording ? <Square className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
        >
          {recording ? 'Stop recording' : 'Start recording'}
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={onLeave}
          disabled={!canLeave || leaving}
          loading={leaving}
          leadingIcon={<LogOut className="h-4 w-4" />}
        >
          Leave session
        </Button>
      </GlassCardContent>
    </GlassCard>
  );
}

interface SessionSidebarProps {
  roomId: string;
  onRoomIdChange: (value: string) => void;
  joinPassword: string;
  onJoinPasswordChange: (value: string) => void;
  canCreateRoom: boolean;
  creatingRoom: boolean;
  onCreateRoom: () => Promise<boolean> | boolean;
  onJoin: () => Promise<void> | void;
  connecting: boolean;
  connectionPhase: SessionPhase;
  connectionStage: ConnectionStage;
  error: string | null;
  onResetError: () => void;
  role: Role | null;
  hasActiveSession: boolean;
  participants: ParticipantSummary[];
  participantId: string | null;
  selectedParticipantId: string;
  selectableParticipantIds: string[];
  onSelectParticipant: (id: string) => void;
  onRefreshParticipants: () => Promise<void> | void;
  loadingParticipants: boolean;
  canModerate: boolean;
  onChangeRole: (id: string, role: Role) => void;
  onRemoveParticipant: (id: string) => void;
  pendingModeration: PendingModeration | null;
  roomPassword: string;
  onRoomPasswordChange: (value: string) => void;
  onSetRoomPassword: () => Promise<void> | void;
  settingPassword: boolean;
  canLeaveRoom: boolean;
  onLeaveRoom: () => Promise<void> | void;
  leavingRoom: boolean;
  muted: boolean;
  onToggleMute: () => void;
  recording: boolean;
  onToggleRecording: () => void;
}

function SessionSidebar({
  roomId,
  onRoomIdChange,
  joinPassword,
  onJoinPasswordChange,
  canCreateRoom,
  creatingRoom,
  onCreateRoom,
  onJoin,
  connecting,
  connectionPhase,
  connectionStage,
  error,
  onResetError,
  role,
  hasActiveSession,
  participants,
  participantId,
  selectedParticipantId,
  selectableParticipantIds,
  onSelectParticipant,
  onRefreshParticipants,
  loadingParticipants,
  canModerate,
  onChangeRole,
  onRemoveParticipant,
  pendingModeration,
  roomPassword,
  onRoomPasswordChange,
  onSetRoomPassword,
  settingPassword,
  canLeaveRoom,
  onLeaveRoom,
  leavingRoom,
  muted,
  onToggleMute,
  recording,
  onToggleRecording,
}: SessionSidebarProps) {
  return (
    <div className="flex h-full flex-col gap-6">
      <SessionInfoCard
        roomId={roomId}
        onRoomIdChange={onRoomIdChange}
        joinPassword={joinPassword}
        onJoinPasswordChange={onJoinPasswordChange}
        canCreateRoom={canCreateRoom}
        creatingRoom={creatingRoom}
        onCreateRoom={onCreateRoom}
        onJoin={onJoin}
        connecting={connecting}
        connectionPhase={connectionPhase}
        connectionStage={connectionStage}
        error={error}
        onResetError={onResetError}
        role={role}
        hasActiveSession={hasActiveSession}
      />
      <ParticipantsPanel
        participants={participants}
        participantId={participantId}
        selectedParticipantId={selectedParticipantId}
        selectableParticipantIds={selectableParticipantIds}
        onSelectParticipant={onSelectParticipant}
        onRefreshParticipants={onRefreshParticipants}
        loadingParticipants={loadingParticipants}
        canModerate={canModerate}
        onChangeRole={onChangeRole}
        onRemoveParticipant={onRemoveParticipant}
        pendingModeration={pendingModeration}
      />
      {canModerate ? (
        <PasswordCard
          roomPassword={roomPassword}
          onPasswordChange={onRoomPasswordChange}
          onSetPassword={onSetRoomPassword}
          settingPassword={settingPassword}
          disabled={!roomId}
        />
      ) : null}
      <QuickActions
        muted={muted}
        onToggleMute={onToggleMute}
        recording={recording}
        onToggleRecording={onToggleRecording}
        canLeave={canLeaveRoom}
        onLeave={() => {
          void onLeaveRoom();
        }}
        leaving={leavingRoom}
      />
    </div>
  );
}

export default function SessionPage() {
  const { roomId: routeRoomId } = useParams<{ roomId?: string }>();
  const rootRef = useRef<HTMLDivElement>(null);
  useAudioContextUnlock(rootRef);
  const remoteStreamCleanups = useRef(new Map<string, () => void>());
  const disconnectRef = useRef<(() => void) | null>(null);
  const autoJoinRef = useRef(false);

  const { token, logout, username, role: authRole } = useAuthStore(state => ({
    token: state.token,
    logout: state.logout,
    username: state.username,
    role: state.role,
  }));

  const { role: sessionRole, connection, micStream } = useSessionStore(state => ({
    role: state.role,
    connection: state.connection,
    micStream: state.micStream,
  }));

  const [roomId, setRoomId] = useState(routeRoomId ?? '');
  const [joinPassword, setJoinPassword] = useState('');
  const [targetId, setTargetId] = useState('');
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingModeration, setPendingModeration] = useState<PendingModeration | null>(null);
  const [roomPassword, setRoomPasswordInput] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);
  const [turnServers, setTurnServers] = useState<RTCIceServer[]>([]);
  const [leavingRoom, setLeavingRoom] = useState(false);
  const [connectionStage, setConnectionStage] = useState<ConnectionStage>('idle');
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [displayDuration, setDisplayDuration] = useState('00:00');
  const [showConnectedBanner, setShowConnectedBanner] = useState(false);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(true);

  const resetError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (typeof routeRoomId === 'string') {
      setRoomId(routeRoomId);
    }
  }, [routeRoomId]);

  useEffect(() => {
    if (!token) {
      setParticipants([]);
      setTargetId('');
      setParticipantId(null);
      setTurnServers([]);
    }
  }, [authRole, token]);

  const effectiveRole = useMemo<Role | null>(() => {
    if (sessionRole) return sessionRole;
    return isRole(authRole) ? authRole : null;
  }, [authRole, sessionRole]);

  const isFacilitatorSession = effectiveRole === 'facilitator';
  const canCreateRoom = isFacilitatorSession;
  const canModerateParticipants = isFacilitatorSession;

  const availableTargets = useMemo(() => {
    const others = participants.filter(p => p.id !== participantId);
    if (!effectiveRole) return others;
    switch (effectiveRole) {
      case 'listener':
        return others.filter(p => p.role === 'facilitator');
      case 'explorer':
        return others.filter(p => p.role === 'facilitator');
      case 'facilitator':
        return others.filter(p => p.role !== 'facilitator');
      default:
        return others;
    }
  }, [effectiveRole, participantId, participants]);

  useEffect(() => {
    if (!availableTargets.length) {
      if (targetId) setTargetId('');
      return;
    }
    if (!availableTargets.some(p => p.id === targetId)) {
      setTargetId(availableTargets[0].id);
    }
  }, [availableTargets, targetId]);

  useEffect(() => {
    if (!participants.length || !effectiveRole) return;
    if (effectiveRole === 'facilitator') return;
    const facilitator = participants.find(
      participant => participant.role === 'facilitator' && participant.id !== participantId,
    );
    if (facilitator && facilitator.id !== targetId) {
      setTargetId(facilitator.id);
    }
  }, [participants, effectiveRole, participantId, targetId]);

  const loadParticipants = useCallback(async () => {
    if (!token) {
      setError('Authentication token is missing');
      return;
    }
    if (!roomId) {
      setError('Room ID is required to list participants');
      return;
    }
    setLoadingParticipants(true);
    setError(null);
    try {
      const list = await listParticipants(roomId, token);
      setParticipants(list);
    } catch (err) {
      console.error(err);
      setError('Failed to load participants');
    } finally {
      setLoadingParticipants(false);
    }
  }, [roomId, token]);

  const handleSetRoomPassword = useCallback(async () => {
    if (!token) {
      setError('Authentication token is missing');
      return;
    }
    if (!roomId) {
      setError('Room ID is required to update the password');
      return;
    }
    setSettingPassword(true);
    setError(null);
    try {
      const nextPassword = roomPassword === '' ? undefined : roomPassword;
      await setRoomPassword(roomId, token, nextPassword);
      setRoomPasswordInput('');
    } catch (err) {
      console.error(err);
      setError('Failed to update room password');
    } finally {
      setSettingPassword(false);
    }
  }, [roomId, roomPassword, token]);

  const cleanupRemoteAudio = useCallback(() => {
    remoteStreamCleanups.current.forEach(cleanup => cleanup());
    remoteStreamCleanups.current.clear();
    resetRemoteFacilitatorStreams();
  }, []);

  const handleTrack = useCallback((event: RTCTrackEvent) => {
    if (event.track.kind !== 'audio') return;
    const streams = event.streams.length ? event.streams : [new MediaStream([event.track])];
    streams.forEach(stream => {
      const key = stream.id;
      remoteStreamCleanups.current.get(key)?.();
      const detach = attachRemoteFacilitatorStream(stream);
      const cleanup = () => {
        detach();
        stream.removeEventListener('removetrack', cleanup);
        stream.getTracks().forEach(track => track.removeEventListener('ended', cleanup));
        remoteStreamCleanups.current.delete(key);
      };
      stream.addEventListener('removetrack', cleanup);
      stream.getTracks().forEach(track => track.addEventListener('ended', cleanup));
      remoteStreamCleanups.current.set(key, cleanup);
    });
  }, []);

  const handleCreateRoom = useCallback(async () => {
    if (!token) {
      setError('Authentication token is missing');
      return false;
    }
    if (!isRole(authRole) || authRole !== 'facilitator') {
      setError('Only facilitators can create rooms');
      return false;
    }
    setCreatingRoom(true);
    setError(null);
    try {
      const created = await createRoom(token, authRole);
      setRoomId(created.roomId);
      setParticipants(created.participants);
      setParticipantId(created.participantId);
      setTurnServers(created.turn);
      useSessionStore.getState().setRole('facilitator');
      return true;
    } catch (err) {
      console.error(err);
      setError('Failed to create room');
      return false;
    } finally {
      setCreatingRoom(false);
    }
  }, [authRole, token]);

  const handleConnect = useCallback(async () => {
    if (!token) {
      setError('Authentication token is missing');
      return;
    }
    if (!isRole(authRole)) {
      setError('User role is unavailable');
      return;
    }
    if (!roomId) {
      setError('Room ID is required');
      return;
    }
    setConnectionStage('preparing');
    setConnecting(true);
    setError(null);
    const previousDisconnect = disconnectRef.current;
    disconnectRef.current = null;
    previousDisconnect?.();
    cleanupRemoteAudio();
    let nextParticipantId = participantId;
    let currentTurn = turnServers;
    let remoteList = participants;
    let joinedForThisAttempt = false;
    let hasLeft = false;
    const leaveIfNeeded = () => {
      if (hasLeft || !joinedForThisAttempt || !nextParticipantId) {
        return;
      }
      hasLeft = true;
      void leaveRoom(roomId, nextParticipantId, token).catch(() => {});
    };
    try {
      if (!nextParticipantId) {
        setConnectionStage('authenticating');
        const join = await joinRoom(roomId, authRole, token, joinPassword || undefined);
        nextParticipantId = join.participantId;
        currentTurn = join.turn;
        remoteList = join.participants;
        setParticipantId(join.participantId);
        setParticipants(join.participants);
        setTurnServers(join.turn);
        joinedForThisAttempt = true;
      } else {
        setConnectionStage('syncing');
        const refreshed = await listParticipants(roomId, token);
        remoteList = refreshed;
        setParticipants(refreshed);
      }

      let resolvedTargetId = targetId;
      if (!resolvedTargetId) {
        const preferred = remoteList.find(p => {
          if (effectiveRole === 'facilitator') {
            return p.id !== nextParticipantId && p.role !== 'facilitator';
          }
          return p.role === 'facilitator' && p.id !== nextParticipantId;
        });
        if (preferred) {
          resolvedTargetId = preferred.id;
          setTargetId(preferred.id);
        }
      }

      const resolvedTarget = resolvedTargetId
        ? remoteList.find(p => p.id === resolvedTargetId)
        : undefined;

      if (!resolvedTarget || resolvedTarget.id === nextParticipantId) {
        leaveIfNeeded();
        throw new Error('target-unavailable');
      }

      if (!currentTurn.length) {
        setError('Missing connection details for this room');
        leaveIfNeeded();
        return;
      }

      setConnectionStage('negotiating');
      const disconnect = connectWithReconnection({
        roomId,
        participantId: nextParticipantId,
        targetId: resolvedTarget.id,
        token,
        turn: currentTurn,
        role: authRole,
        targetRole: resolvedTarget.role,
        version: '1',
        onTrack: handleTrack,
      });
      let disconnected = false;
      const shouldClearParticipant = joinedForThisAttempt;
      disconnectRef.current = () => {
        if (disconnected) return;
        disconnected = true;
        disconnect();
        cleanupRemoteAudio();
        if (shouldClearParticipant) {
          setParticipantId(null);
        }
        useSessionStore.getState().resetRemotePresence();
        leaveIfNeeded();
        disconnectRef.current = null;
      };
    } catch (err) {
      console.error(err);
      leaveIfNeeded();
      if (err instanceof Error && err.message === 'target-unavailable') {
        setError('No available participants to connect');
      } else {
        setError('Failed to connect to room');
      }
    } finally {
      setConnecting(false);
    }
  }, [
    authRole,
    cleanupRemoteAudio,
    effectiveRole,
    handleTrack,
    joinPassword,
    participantId,
    participants,
    roomId,
    targetId,
    token,
    turnServers,
  ]);

  const handleLeaveRoom = useCallback(async () => {
    if (!token) {
      setError('Authentication token is missing');
      return;
    }
    if (!roomId) {
      setError('Room ID is required to leave the room');
      return;
    }
    if (!participantId) {
      setParticipants([]);
      setTargetId('');
      setTurnServers([]);
      useSessionStore.getState().setRole(null);
      return;
    }
    setLeavingRoom(true);
    setError(null);
    const currentParticipantId = participantId;
    disconnectRef.current?.();
    cleanupRemoteAudio();
    const session = useSessionStore.getState();
    session.setConnection('disconnected');
    session.setControl(null);
    session.setTelemetry(null);
    session.setPeerClock(null);
    session.setMicStream(null);
    session.resetRemotePresence();
    try {
      await leaveRoom(roomId, currentParticipantId, token);
    } catch (err) {
      console.error(err);
      setError('Failed to leave room');
    } finally {
      setLeavingRoom(false);
    }
    setParticipantId(null);
    setParticipants([]);
    setTargetId('');
    setTurnServers([]);
    setPendingModeration(null);
    session.setRole(null);
  }, [cleanupRemoteAudio, participantId, roomId, token]);

  useEffect(() => {
    return () => {
      disconnectRef.current?.();
      cleanupRemoteAudio();
    };
  }, [cleanupRemoteAudio]);

  useEffect(() => {
    if (micStream && micStream.getAudioTracks().length > 0) {
      const mutedTracks = micStream.getAudioTracks().every(track => !track.enabled);
      setMuted(mutedTracks);
    } else {
      setMuted(true);
    }
  }, [micStream]);

  useEffect(() => {
    if (connecting) return;
    if (connection !== 'connecting') {
      setConnectionStage('idle');
    }
  }, [connection, connecting]);

  const handleToggleMute = useCallback(() => {
    if (!micStream) return;
    const nextMuted = !muted;
    micStream.getAudioTracks().forEach(track => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }, [micStream, muted]);

  const handleToggleRecording = useCallback(() => {
    setRecording(prev => !prev);
  }, []);

  const handleParticipantCardSelect = useCallback(
    (id: string) => {
      if (!availableTargets.some(target => target.id === id)) {
        return;
      }
      setTargetId(id);
    },
    [availableTargets],
  );

  const handleParticipantRoleChange = useCallback(
    async (id: string, nextRole: Role) => {
      if (!token) {
        setError('Authentication token is missing');
        return;
      }
      if (!roomId) {
        setError('Room ID is required to manage participants');
        return;
      }
      setPendingModeration({ id, type: 'role' });
      setError(null);
      try {
        await updateParticipantRole(roomId, id, nextRole, token);
        setParticipants(prev => prev.map(p => (p.id === id ? { ...p, role: nextRole } : p)));
      } catch (err) {
        console.error(err);
        setError('Failed to update participant role');
      } finally {
        setPendingModeration(null);
      }
    },
    [roomId, token],
  );

  const handleRemoveParticipant = useCallback(
    async (id: string) => {
      if (!token) {
        setError('Authentication token is missing');
        return;
      }
      if (!roomId) {
        setError('Room ID is required to manage participants');
        return;
      }
      setPendingModeration({ id, type: 'remove' });
      setError(null);
      try {
        await removeRoomParticipant(roomId, id, token);
        setParticipants(prev => prev.filter(p => p.id !== id));
        if (targetId === id) {
          setTargetId('');
          disconnectRef.current?.();
          cleanupRemoteAudio();
        }
      } catch (err) {
        console.error(err);
        setError('Failed to remove participant');
      } finally {
        setPendingModeration(null);
      }
    },
    [cleanupRemoteAudio, roomId, targetId, token],
  );

  useEffect(() => {
    if (!token || !isRole(authRole)) return;
    if (!routeRoomId) return;
    if (participantId) return;
    if (connecting) return;
    if (autoJoinRef.current) return;
    autoJoinRef.current = true;
    setRoomId(routeRoomId);
    void handleConnect();
  }, [authRole, connecting, handleConnect, participantId, routeRoomId, token]);

  useEffect(() => {
    if (connection === 'connected') {
      setConnectedAt(prev => prev ?? Date.now());
      setShowConnectedBanner(true);
      const timeout = window.setTimeout(() => setShowConnectedBanner(false), 4000);
      return () => window.clearTimeout(timeout);
    }
    if (connection !== 'connecting') {
      setConnectedAt(null);
    }
    setShowConnectedBanner(false);
  }, [connection]);

  useEffect(() => {
    if (!connectedAt) {
      setDisplayDuration('00:00');
      return;
    }
    const update = () => {
      setDisplayDuration(formatDuration(Date.now() - connectedAt));
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [connectedAt]);

  const connectionPhase: SessionPhase = error
    ? 'error'
    : connecting || connection === 'connecting'
      ? 'connecting'
      : connection === 'connected' && participantId
        ? 'ready'
        : 'idle';

  const indicatorStatus: StatusIndicatorStatus = error
    ? 'error'
    : connection === 'connected'
      ? 'connected'
      : connection === 'connecting' || connecting
        ? 'connecting'
        : 'disconnected';

  const indicatorLabel = error
    ? 'Connection error'
    : connection === 'connected'
      ? 'Live session'
      : connection === 'connecting' || connecting
        ? 'Negotiating link'
        : isFacilitatorSession && participantId
          ? 'Room controls ready'
          : 'Idle';

  const handleLogout = useCallback(async () => {
    disconnectRef.current?.();
    cleanupRemoteAudio();
    await logout();
  }, [cleanupRemoteAudio, logout]);

  const participantsOnline = participants.filter(p => p.connected).length;

  let mainContent: React.ReactNode;
  let contentKey = 'idle';

  if (connectionPhase === 'error' && error) {
    mainContent = <ErrorState message={error} onReset={resetError} />;
    contentKey = 'error';
  } else if (connectionPhase === 'connecting') {
    mainContent = <LoadingState roomId={roomId} stage={connectionStage} />;
    contentKey = 'connecting';
  } else if (connectionPhase === 'ready' && sessionRole) {
    contentKey = `role-${sessionRole}`;
    if (sessionRole === 'facilitator') {
      mainContent = (
        <FacilitatorView
          participants={participants}
          currentParticipantId={participantId ?? undefined}
          selectedParticipantId={targetId || undefined}
          selectableParticipantIds={availableTargets.map(participant => participant.id)}
          onSelectParticipant={handleParticipantCardSelect}
          canModerate={canModerateParticipants}
          onChangeRole={handleParticipantRoleChange}
          onRemoveParticipant={handleRemoveParticipant}
          pendingModeration={pendingModeration}
        />
      );
    } else if (sessionRole === 'explorer') {
      mainContent = <ExplorerView />;
    } else if (sessionRole === 'listener') {
      mainContent = (
        <ListenerView
          participants={participants}
          participantId={participantId}
          facilitatorId={targetId || null}
          username={username}
        />
      );
    }
  } else if (isFacilitatorSession && participantId) {
    contentKey = 'role-facilitator';
    mainContent = (
      <FacilitatorView
        participants={participants}
        currentParticipantId={participantId ?? undefined}
        selectedParticipantId={targetId || undefined}
        selectableParticipantIds={availableTargets.map(participant => participant.id)}
        onSelectParticipant={handleParticipantCardSelect}
        canModerate={canModerateParticipants}
        onChangeRole={handleParticipantRoleChange}
        onRemoveParticipant={handleRemoveParticipant}
        pendingModeration={pendingModeration}
      />
    );
  } else {
    mainContent = <IdleState />;
    contentKey = 'idle';
  }

  return (
    <div ref={rootRef} className="min-h-screen bg-slate-950">
      <AppLayout
        user={{ name: username ?? 'Navigator Operator', role: formatRole(effectiveRole) }}
        connection={{ indicatorStatus, label: indicatorLabel, ariaLabel: indicatorLabel }}
        title="Navigator Session"
        subtitle="Real-time mission orchestration"
        sidebar={
          <SessionSidebar
            roomId={roomId}
            onRoomIdChange={setRoomId}
            joinPassword={joinPassword}
            onJoinPasswordChange={setJoinPassword}
            canCreateRoom={canCreateRoom}
            creatingRoom={creatingRoom}
            onCreateRoom={handleCreateRoom}
            onJoin={handleConnect}
            connecting={connecting}
            connectionPhase={connectionPhase}
            connectionStage={connectionStage}
            error={error}
            onResetError={resetError}
            role={effectiveRole}
            hasActiveSession={Boolean(participantId)}
            participants={participants}
            participantId={participantId}
            selectedParticipantId={targetId}
            selectableParticipantIds={availableTargets.map(participant => participant.id)}
            onSelectParticipant={handleParticipantCardSelect}
            onRefreshParticipants={loadParticipants}
            loadingParticipants={loadingParticipants}
            canModerate={canModerateParticipants}
            onChangeRole={handleParticipantRoleChange}
            onRemoveParticipant={handleRemoveParticipant}
            pendingModeration={pendingModeration}
            roomPassword={roomPassword}
            onRoomPasswordChange={setRoomPasswordInput}
            onSetRoomPassword={handleSetRoomPassword}
            settingPassword={settingPassword}
            canLeaveRoom={Boolean(participantId)}
            onLeaveRoom={handleLeaveRoom}
            leavingRoom={leavingRoom}
            muted={muted}
            onToggleMute={handleToggleMute}
            recording={recording}
            onToggleRecording={handleToggleRecording}
          />
        }
        onLogout={() => {
          void handleLogout();
        }}
      >
        <div className="flex flex-col gap-6">
          <SessionHeaderBar
            roomId={roomId}
            connectionPhase={connectionPhase}
            duration={displayDuration}
            participantsOnline={participantsOnline}
            totalParticipants={participants.length}
            isRecording={recording}
            onLeaveSession={() => {
              void handleLeaveRoom();
            }}
            canLeave={Boolean(participantId)}
            leaving={leavingRoom}
            roleLabel={formatRole(effectiveRole)}
          />
          <AnimatePresence>
            {showConnectedBanner ? <ConnectedBanner roomId={roomId} /> : null}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.div
              key={contentKey}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-6"
            >
              {mainContent}
            </motion.div>
          </AnimatePresence>
        </div>
      </AppLayout>
    </div>
  );
}
