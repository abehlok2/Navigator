import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { cn } from '../../../lib/utils';
import type { ParticipantSummary, Role } from '../../session/api';

const STEPS = ['room', 'password', 'participant', 'confirm'] as const;
type Step = typeof STEPS[number];

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
  canLeaveRoom: boolean;
  onLeaveRoom: () => Promise<void> | void;
  leavingRoom: boolean;
}

function formatRole(role: Role): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

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
  canLeaveRoom,
  onLeaveRoom,
  leavingRoom,
}: RoomJoinerProps) {
  const [step, setStep] = useState<Step>('room');
  const [stepMessage, setStepMessage] = useState<string | null>(null);

  const selectedTarget = useMemo(
    () => participants.find(p => p.id === targetId) ?? null,
    [participants, targetId]
  );

  useEffect(() => {
    if (!roomId) setStep('room');
  }, [roomId]);

  useEffect(() => {
    onResetError?.();
    setStepMessage(null);
  }, [step, onResetError]);

  useEffect(() => {
    if (!targetId && availableTargets.length > 0) {
      onTargetChange(availableTargets[0].id);
    }
  }, [availableTargets, onTargetChange, targetId]);

  const currentIndex = STEPS.indexOf(step);

  const canProgress = () => {
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
    if (!canProgress()) {
      setStepMessage(
        step === 'room' 
          ? 'Enter a room ID to continue'
          : 'Select a participant to continue'
      );
      return;
    }

    setStepMessage(null);

    if (step === 'confirm') {
      void onConnect();
      return;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1]);
    }
  };

  const handleCreateRoom = async () => {
    setStepMessage(null);
    const created = await onCreateRoom();
    if (created) {
      setStep('password');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleNext();
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Room Access</h2>
          {role && (
            <Badge variant="info">{formatRole(role)}</Badge>
          )}
        </div>
        <p className="text-sm text-slate-400">
          Step {currentIndex + 1} of {STEPS.length}
        </p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-2 flex-1 rounded-full transition-colors',
                i <= currentIndex ? 'bg-violet-500' : 'bg-white/10'
              )}
            />
          ))}
        </div>
      </div>

      {/* Content - wrapped in form only for steps with inputs */}
      <form onSubmit={handleFormSubmit}>
        <div className="mb-6 min-h-[200px]">
          {step === 'room' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="room-id" className="text-white mb-2 block">
                  Room ID
                </Label>
                <Input
                  id="room-id"
                  value={roomId}
                  onChange={e => onRoomIdChange(e.target.value)}
                  placeholder="Enter room ID"
                  className="bg-white/5 border-white/10 text-white"
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                onClick={handleCreateRoom}
                disabled={creatingRoom || !canCreateRoom}
                loading={creatingRoom}
                variant="secondary"
                className="w-full"
              >
                Create New Room
              </Button>
              {!canCreateRoom && (
                <p className="text-xs text-slate-400">
                  Only facilitators can create rooms
                </p>
              )}
            </div>
          )}

          {step === 'password' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="room-password" className="text-white mb-2 block">
                  Room Password (Optional)
                </Label>
                <Input
                  id="room-password"
                  type="password"
                  value={joinPassword}
                  onChange={e => onJoinPasswordChange(e.target.value)}
                  placeholder="Leave blank if none"
                  className="bg-white/5 border-white/10 text-white"
                  autoComplete="current-password"
                />
              </div>
              <p className="text-xs text-slate-400">
                Enter the password if this room is protected
              </p>
            </div>
          )}

          {step === 'participant' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-white">
                  Select Participant ({availableTargets.length} available)
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onRefreshParticipants()}
                  disabled={loadingParticipants}
                  loading={loadingParticipants}
                >
                  Refresh
                </Button>
              </div>

              {availableTargets.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableTargets.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onTargetChange(p.id)}
                      className={cn(
                        'w-full rounded-xl border p-4 text-left transition-colors',
                        targetId === p.id
                          ? 'border-violet-400 bg-violet-500/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white">{p.id}</div>
                          <div className="text-sm text-slate-400">
                            {formatRole(p.role)}
                          </div>
                        </div>
                        <Badge variant={p.connected ? 'success' : 'muted'}>
                          {p.connected ? 'Online' : 'Offline'}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center">
                  <p className="text-sm text-slate-300">No participants available</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Refresh once others join the room
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white mb-3">Review Details</h3>
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Room ID:</span>
                  <span className="text-white font-mono">{roomId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Password:</span>
                  <span className="text-white">
                    {joinPassword ? 'Provided' : 'None'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Target:</span>
                  <span className="text-white font-mono">
                    {selectedTarget?.id || 'None'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Role:</span>
                  <span className="text-white">
                    {selectedTarget ? formatRole(selectedTarget.role) : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {(stepMessage || error) && (
          <div className="mb-4 rounded-xl border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {stepMessage || error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={currentIndex === 0 || connecting}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={(step !== 'confirm' && !canProgress()) || connecting}
            loading={step === 'confirm' && connecting}
            className="flex-1"
          >
            {step === 'confirm' ? 'Connect' : 'Next'}
          </Button>
        </div>
      </form>
      {canLeaveRoom && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void onLeaveRoom();
          }}
          loading={leavingRoom}
          disabled={leavingRoom}
          className="mt-4 w-full text-rose-200 hover:bg-rose-500/10 hover:text-rose-100"
        >
          Leave room
        </Button>
      )}
    </div>
  );
}
