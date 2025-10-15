import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardFooter,
  GlassCardHeader,
  GlassCardTitle,
} from '../../../components/ui/glass-card';
import { cn } from '../../../lib/utils';
import type { ParticipantSummary, Role } from '../../session/api';

const STEPS = [
  { key: 'room', title: 'Room ID', description: 'Enter or create the room you want to manage.' },
  { key: 'password', title: 'Room password', description: 'Supply the room password when required.' },
  { key: 'participant', title: 'Target participant', description: 'Choose who you want to connect with.' },
  { key: 'confirm', title: 'Confirmation', description: 'Review your selections before connecting.' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

const stepOrder: StepKey[] = ['room', 'password', 'participant', 'confirm'];

const stepVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

export interface RoomJoinerProps {
  roomId: string;
  onRoomIdChange: (value: string) => void;
  canCreateRoom: boolean;
  creatingRoom: boolean;
  onCreateRoom: () => Promise<boolean> | boolean;
  joinPassword: string;
  onJoinPasswordChange: (value: string) => void;
  participants: ParticipantSummary[];
  availableTargets: ParticipantSummary[];
  loadingParticipants: boolean;
  onRefreshParticipants: () => Promise<void> | void;
  targetId: string;
  onTargetChange: (value: string) => void;
  onConnect: () => Promise<void> | void;
  connecting: boolean;
  participantId: string | null;
  error: string | null;
  onResetError?: () => void;
  role: Role | null;
}

function formatRole(role: Role): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

const statusBadgeVariant: Record<'connected' | 'offline', 'success' | 'muted'> = {
  connected: 'success',
  offline: 'muted',
};

const statusCopy: Record<'connected' | 'offline', string> = {
  connected: 'Connected',
  offline: 'Offline',
};

const STEP_BUTTON_COPY: Record<StepKey, string> = {
  room: 'Continue to password',
  password: 'Select participant',
  participant: 'Review & confirm',
  confirm: 'Connect to room',
};

export default function RoomJoiner({
  roomId,
  onRoomIdChange,
  canCreateRoom,
  creatingRoom,
  onCreateRoom,
  joinPassword,
  onJoinPasswordChange,
  participants,
  availableTargets,
  loadingParticipants,
  onRefreshParticipants,
  targetId,
  onTargetChange,
  onConnect,
  connecting,
  participantId,
  error,
  onResetError,
  role,
}: RoomJoinerProps) {
  const [step, setStep] = useState<StepKey>('room');
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const selectedTarget = useMemo(
    () => participants.find(participant => participant.id === targetId) ?? null,
    [participants, targetId]
  );

  useEffect(() => {
    if (!roomId) {
      setStep('room');
    }
  }, [roomId]);

  useEffect(() => {
    if (onResetError) {
      onResetError();
    }
    setStepMessage(null);
  }, [step, onResetError]);

  useEffect(() => {
    if (!autoRefresh) return;
    if (!roomId) return;
    const interval = window.setInterval(() => {
      void onRefreshParticipants();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, onRefreshParticipants, roomId]);

  const currentIndex = stepOrder.indexOf(step);
  const canGoNext = () => {
    switch (step) {
      case 'room':
        return roomId.trim().length > 0;
      case 'password':
        return true;
      case 'participant':
        return !!targetId;
      case 'confirm':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (!canGoNext()) {
      setStepMessage(
        step === 'room' ? 'Enter a room ID to continue.' : 'Select a participant to continue.'
      );
      return;
    }
    setStepMessage(null);
    if (step === 'confirm') {
      void onConnect();
      return;
    }
    const nextStep = stepOrder[currentIndex + 1] ?? 'confirm';
    setStep(nextStep);
  };

  const handleBack = () => {
    if (currentIndex === 0) return;
    const prevStep = stepOrder[currentIndex - 1] ?? 'room';
    setStep(prevStep);
  };

  const handleCreateRoom = async () => {
    setStepMessage(null);
    const created = await onCreateRoom();
    if (created) {
      setStep('password');
    }
  };

  const handleRefreshClick = async () => {
    setStepMessage(null);
    await onRefreshParticipants();
  };

  useEffect(() => {
    if (!targetId && availableTargets.length > 0) {
      onTargetChange(availableTargets[0].id);
    }
  }, [availableTargets, onTargetChange, targetId]);

  return (
    <GlassCard variant="elevated" glowColor="blue" className="sticky top-8 shadow-xl">
      <GlassCardHeader className="gap-3 border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <GlassCardTitle className="text-xl text-white">Room access</GlassCardTitle>
            <GlassCardDescription className="text-slate-200/80">
              Step through the room setup to connect with the right participant.
            </GlassCardDescription>
          </div>
          <Badge variant="info" className="px-3 py-1 text-[10px] uppercase tracking-[0.25em]">
            {role ? formatRole(role) : 'Unknown'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-300">
          {STEPS.map((item, index) => {
            const active = index === currentIndex;
            const complete = index < currentIndex;
            return (
              <div
                key={item.key}
                className={cn(
                  'flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 transition-colors',
                  active && 'bg-white/20 text-white',
                  complete && !active && 'bg-white/10 text-slate-100',
                  !active && !complete && 'text-slate-300'
                )}
              >
                <span className="h-2 w-2 rounded-full bg-white/60" />
                <span>{item.title}</span>
              </div>
            );
          })}
        </div>
      </GlassCardHeader>
      <GlassCardContent className="gap-6">
        <AnimatePresence mode="wait">{
          <motion.div
            key={step}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={stepVariants}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="space-y-5"
          >
            {step === 'room' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="room-id" className="text-sm text-slate-100">
                    Room ID
                  </Label>
                  <Input
                    id="room-id"
                    value={roomId}
                    onChange={event => onRoomIdChange(event.target.value)}
                    placeholder="Enter or paste a room identifier"
                    className="bg-white/10 text-white placeholder:text-slate-400"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200">
                  <Button
                    type="button"
                    onClick={handleCreateRoom}
                    disabled={creatingRoom || !canCreateRoom}
                    className="h-10 bg-sky-500 px-4 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-400/60"
                  >
                    {creatingRoom ? 'Creating…' : 'Create room'}
                  </Button>
                  {!canCreateRoom && <span>Only facilitators can create rooms.</span>}
                  {roomId && (
                    <span className="font-mono text-xs text-slate-200/80">Current room: {roomId}</span>
                  )}
                </div>
              </div>
            )}
            {step === 'password' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="room-password" className="text-sm text-slate-100">
                    Room password
                  </Label>
                  <Input
                    id="room-password"
                    type="password"
                    value={joinPassword}
                    autoComplete="current-password"
                    onChange={event => onJoinPasswordChange(event.target.value)}
                    placeholder="Enter the room password if required"
                    className="bg-white/10 text-white placeholder:text-slate-400"
                  />
                </div>
                <p className="text-xs text-slate-200/80">
                  Leave blank if the room does not require a password. You can always update it later.
                </p>
              </div>
            )}
            {step === 'participant' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-100">Participants</p>
                    <p className="text-xs text-slate-300">{participants.length} total in this room.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={handleRefreshClick}
                      disabled={loadingParticipants || !roomId}
                      className="bg-white/10 text-slate-100 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingParticipants ? 'Refreshing…' : 'Refresh now'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setAutoRefresh(prev => !prev)}
                      disabled={!roomId}
                      className={cn(
                        'bg-white/10 text-slate-100 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60',
                        autoRefresh && 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                      )}
                    >
                      {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
                    </Button>
                  </div>
                </div>
                {loadingParticipants ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, index) => (
                      <div
                        key={index}
                        className="animate-pulse rounded-2xl border border-white/10 bg-white/10 p-4"
                      >
                        <div className="h-4 w-1/2 rounded bg-white/20" />
                        <div className="mt-3 h-3 w-1/3 rounded bg-white/20" />
                        <div className="mt-4 h-6 w-full rounded bg-white/10" />
                      </div>
                    ))}
                  </div>
                ) : availableTargets.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {availableTargets.map(participant => {
                      const status = participant.connected ? 'connected' : 'offline';
                      const isSelected = participant.id === targetId;
                      return (
                        <button
                          key={participant.id}
                          type="button"
                          onClick={() => onTargetChange(participant.id)}
                          className={cn(
                            'flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 text-left transition-colors hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300',
                            isSelected && 'border-emerald-300/70 bg-emerald-500/10'
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <Badge variant="info">{formatRole(participant.role)}</Badge>
                            <Badge variant={statusBadgeVariant[status]}>{statusCopy[status]}</Badge>
                          </div>
                          <div className="space-y-1 text-sm text-slate-200">
                            <p className="font-mono text-xs text-slate-300">{participant.id}</p>
                            <p>
                              {participant.connected
                                ? 'Ready for a live connection.'
                                : 'Waiting to come online.'}
                            </p>
                          </div>
                          {isSelected && (
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                              Selected target
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/20 bg-white/10 p-6 text-sm text-slate-200">
                    No available participants to connect with yet. Refresh once the room is active.
                  </div>
                )}
              </div>
            )}
            {step === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-sm font-semibold text-slate-100">Summary</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-200">
                    <li>
                      <span className="font-medium text-slate-100">Room ID:</span>{' '}
                      <span className="font-mono text-xs text-slate-300">{roomId}</span>
                    </li>
                    <li>
                      <span className="font-medium text-slate-100">Password:</span>{' '}
                      {joinPassword ? 'Provided' : 'Not required'}
                    </li>
                    <li>
                      <span className="font-medium text-slate-100">Target participant:</span>{' '}
                      {selectedTarget ? (
                        <span className="font-mono text-xs text-slate-300">{selectedTarget.id}</span>
                      ) : (
                        'Not selected'
                      )}
                    </li>
                    <li>
                      <span className="font-medium text-slate-100">Participants online:</span>{' '}
                      {participants.filter(p => p.connected).length}
                    </li>
                  </ul>
                </div>
                {participantId ? (
                  <p className="text-xs text-slate-200/80">
                    Currently connected as <span className="font-mono">{participantId}</span>. Connecting again will
                    re-establish the session.
                  </p>
                ) : (
                  <p className="text-xs text-slate-200/80">No active participant connection yet.</p>
                )}
              </div>
            )}
          </motion.div>
        }</AnimatePresence>
        {(stepMessage || error) && (
          <div className="rounded-xl border border-rose-300/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {stepMessage || error}
          </div>
        )}
      </GlassCardContent>
      <GlassCardFooter className="flex flex-col gap-3 border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-200">
          Step {currentIndex + 1} of {stepOrder.length}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={handleBack}
            disabled={currentIndex === 0 || connecting}
            className="bg-white/10 text-slate-100 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={handleNext}
            disabled={(step !== 'confirm' && !canGoNext()) || connecting}
            className="bg-emerald-500 text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300/60"
          >
            {step === 'confirm' ? (connecting ? 'Connecting…' : STEP_BUTTON_COPY[step]) : STEP_BUTTON_COPY[step]}
          </Button>
        </div>
      </GlassCardFooter>
    </GlassCard>
  );
}
