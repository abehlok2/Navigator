import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  GlassCard,
  type GlassCardGlowColor,
  GlassCardContent,
  GlassCardHeader,
} from '../../../components/ui/glass-card';
import { Select } from '../../../components/ui/select';
import { StatusIndicator, type StatusIndicatorStatus } from '../../../components/ui/status-indicator';
import { cn } from '../../../lib/utils';
import type { ParticipantSummary, Role } from '../../session/api';

const ROLE_LABELS: Record<Role, string> = {
  facilitator: 'Facilitator',
  explorer: 'Explorer',
  listener: 'Listener',
};

const ROLE_GLOW: Record<Role, GlassCardGlowColor> = {
  facilitator: 'blue',
  explorer: 'green',
  listener: 'purple',
};

const ROLE_ICONS: Record<Role, (props: React.SVGProps<SVGSVGElement>) => JSX.Element> = {
  facilitator: props => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3.5 14.5 9l5.5.4-4.2 3.3 1.4 5.3L12 14.8 6.8 18l1.4-5.3L4 9.4 9.5 9 12 3.5z"
      />
    </svg>
  ),
  explorer: props => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4c4.418 0 8 3.134 8 7s-3.582 7-8 7-8-3.134-8-7 3.582-7 8-7z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v6l3 1" />
    </svg>
  ),
  listener: props => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12c0-4.142 3.358-7.5 7.5-7.5S19.5 7.858 19.5 12c0 2.485-1.145 4.694-2.924 6.119a2.25 2.25 0 0 1-3.576-1.789v-1.83c0-.966.784-1.75 1.75-1.75h.5"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a5.25 5.25 0 0 1 10.5 0" />
    </svg>
  ),
};

const ROLE_OPTIONS: Role[] = ['facilitator', 'explorer', 'listener'];

type ParticipantMeta = {
  connectionQuality?: string;
  connectionStatus?: StatusIndicatorStatus;
};

type PendingAction = { id: string; type: 'role' | 'remove' };

export interface ParticipantGridProps {
  participants: Array<ParticipantSummary & ParticipantMeta>;
  currentParticipantId?: string | null;
  selectedParticipantId?: string | null;
  selectableParticipantIds?: string[];
  onSelectParticipant?: (participantId: string) => void;
  canModerate?: boolean;
  onChangeRole?: (participantId: string, role: Role) => void;
  onRemoveParticipant?: (participantId: string) => void;
  pendingModeration?: PendingAction | null;
}

const formatQuality = (quality: string) => {
  if (!quality) return '';
  const lower = quality.toLowerCase();
  switch (lower) {
    case 'excellent':
      return 'Excellent connection';
    case 'good':
      return 'Good connection';
    case 'fair':
      return 'Fair connection';
    case 'poor':
      return 'Poor connection';
    default:
      return quality.charAt(0).toUpperCase() + quality.slice(1);
  }
};

const getStatusLabel = (status: StatusIndicatorStatus): string => {
  switch (status) {
    case 'connected':
      return 'Online';
    case 'connecting':
      return 'Connecting';
    case 'error':
      return 'Error';
    default:
      return 'Offline';
  }
};

interface ParticipantActionMenuProps {
  participantId: string;
  currentRole: Role;
  disabled?: boolean;
  pending?: PendingAction | null;
  onChangeRole?: (participantId: string, role: Role) => void;
  onRemoveParticipant?: (participantId: string) => void;
}

const ParticipantActionMenu: React.FC<ParticipantActionMenuProps> = ({
  participantId,
  currentRole,
  disabled,
  pending,
  onChangeRole,
  onRemoveParticipant,
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const pendingType = pending?.id === participantId ? pending.type : null;

  return (
    <div className="relative" ref={menuRef}>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-8 rounded-full bg-white/10 p-0 text-slate-100 hover:bg-white/20"
        onClick={event => {
          event.stopPropagation();
          if (disabled) return;
          setOpen(prev => !prev);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        disabled={disabled}
      >
        <span className="sr-only">Open participant actions</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 10h.01M10 10h.01M14 10h.01" />
        </svg>
      </Button>
      {open && (
        <div
          className="absolute right-0 top-9 z-20 w-56 space-y-3 rounded-2xl border border-white/10 bg-slate-950/95 p-4 text-sm text-slate-100 shadow-xl backdrop-blur-xl"
          role="menu"
        >
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Change role</span>
            <Select
              value={currentRole}
              onClick={event => event.stopPropagation()}
              onChange={event => {
                event.stopPropagation();
                const nextRole = event.target.value as Role;
                if (nextRole !== currentRole) {
                  onChangeRole?.(participantId, nextRole);
                }
                setOpen(false);
              }}
              onKeyDown={event => {
                event.stopPropagation();
              }}
              disabled={pendingType === 'role'}
              aria-label="Change participant role"
            >
              {ROLE_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </Select>
            {pendingType === 'role' && (
              <span className="text-xs text-slate-400">Updating role…</span>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <p className="text-xs text-slate-300">Remove this participant from the room.</p>
            <Button
              type="button"
              variant="danger"
              className="mt-3 h-9 w-full bg-rose-500 text-xs font-semibold text-white hover:bg-rose-600"
              disabled={pendingType === 'remove'}
              onClick={event => {
                event.stopPropagation();
                onRemoveParticipant?.(participantId);
                setOpen(false);
              }}
            >
              {pendingType === 'remove' ? 'Removing…' : 'Remove from room'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

interface ParticipantCardProps {
  participant: ParticipantSummary & ParticipantMeta;
  isSelf: boolean;
  isSelected: boolean;
  isSelectable: boolean;
  canModerate?: boolean;
  pendingModeration?: PendingAction | null;
  onSelectParticipant?: (participantId: string) => void;
  onChangeRole?: (participantId: string, role: Role) => void;
  onRemoveParticipant?: (participantId: string) => void;
}

const ParticipantCard: React.FC<ParticipantCardProps> = ({
  participant,
  isSelf,
  isSelected,
  isSelectable,
  canModerate,
  pendingModeration,
  onSelectParticipant,
  onChangeRole,
  onRemoveParticipant,
}) => {
  const status: StatusIndicatorStatus = participant.connectionStatus
    ? participant.connectionStatus
    : participant.connected
      ? 'connected'
      : 'disconnected';
  const statusLabel = getStatusLabel(status);
  const roleIcon = ROLE_ICONS[participant.role];
  const qualityLabel = participant.connectionQuality ? formatQuality(participant.connectionQuality) : null;
  const pendingType = pendingModeration?.id === participant.id ? pendingModeration.type : null;

  const isOnline = status === 'connected' || status === 'connecting';

  const cardClassName = cn(
    'relative flex h-full flex-col gap-4 transition-all duration-300',
    isSelected && 'ring-2 ring-offset-2 ring-offset-slate-900/60 ring-sky-400/70',
    isSelf && 'border-white/30',
    !isSelectable && 'cursor-default',
    !isOnline && 'opacity-75 grayscale-[40%]'
  );

  const glowColor = ROLE_GLOW[participant.role];

  return (
    <GlassCard
      variant="interactive"
      glowColor={glowColor}
      className={cardClassName}
      role={isSelectable ? 'button' : undefined}
      tabIndex={isSelectable ? 0 : -1}
      onClick={() => {
        if (isSelectable) {
          onSelectParticipant?.(participant.id);
        }
      }}
      onKeyDown={event => {
        if (!isSelectable) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectParticipant?.(participant.id);
        }
      }}
      aria-pressed={isSelectable ? isSelected : undefined}
      aria-disabled={!isSelectable}
    >
      <GlassCardHeader className="mb-0 flex flex-row items-start gap-3 border-none pb-0">
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="info"
              className="flex items-center gap-2 bg-white/10 text-slate-100 backdrop-blur-sm"
            >
              {roleIcon({ className: 'h-4 w-4' })}
              <span>{ROLE_LABELS[participant.role]}</span>
            </Badge>
            <span className="font-mono text-xs text-slate-300">{participant.id}</span>
            {isSelf && <Badge variant="muted">You</Badge>}
            {isSelected && !isSelf && <Badge variant="success">Target</Badge>}
            {!isSelectable && !isSelf && (
              <Badge variant="muted" className="bg-white/5 text-slate-300">
                Locked
              </Badge>
            )}
          </div>
        </div>
        {canModerate && !isSelf && (
          <ParticipantActionMenu
            participantId={participant.id}
            currentRole={participant.role}
            disabled={pendingType === 'remove'}
            pending={pendingModeration}
            onChangeRole={onChangeRole}
            onRemoveParticipant={onRemoveParticipant}
          />
        )}
      </GlassCardHeader>
      <GlassCardContent className="gap-5 text-sm text-slate-200">
        <div className="flex items-center justify-between gap-3">
          <StatusIndicator status={status} label={statusLabel} size="sm" />
          {qualityLabel && (
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
              {qualityLabel}
            </span>
          )}
        </div>
        {pendingType === 'role' && (
          <div className="rounded-xl border border-sky-200/30 bg-sky-500/15 px-3 py-2 text-xs text-sky-100">
            Updating role…
          </div>
        )}
        {pendingType === 'remove' && (
          <div className="rounded-xl border border-rose-200/30 bg-rose-500/15 px-3 py-2 text-xs text-rose-100">
            Removing participant…
          </div>
        )}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-200">
          <p className="font-semibold uppercase tracking-[0.2em] text-slate-400">Role</p>
          <p className="mt-2 text-base font-medium text-white">{ROLE_LABELS[participant.role]}</p>
          <p className="mt-3 text-xs text-slate-300">{isOnline ? 'Ready for connection' : 'Participant is offline'}</p>
        </div>
      </GlassCardContent>
    </GlassCard>
  );
};

export const ParticipantGrid: React.FC<ParticipantGridProps> = ({
  participants,
  currentParticipantId,
  selectedParticipantId,
  selectableParticipantIds,
  onSelectParticipant,
  canModerate = false,
  onChangeRole,
  onRemoveParticipant,
  pendingModeration,
}) => {
  const selectableSet = useMemo(
    () => new Set(selectableParticipantIds ?? []),
    [selectableParticipantIds]
  );

  if (!participants.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-6 text-center text-sm text-slate-300">
        <p>No participants in this room yet.</p>
        <p className="mt-1 text-xs text-slate-400">They will appear here once they join the session.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {participants.map(participant => {
        const isSelf = participant.id === currentParticipantId;
        const isSelected = participant.id === selectedParticipantId;
        const isSelectable = selectableParticipantIds
          ? selectableSet.has(participant.id)
          : Boolean(onSelectParticipant);

        return (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            isSelf={Boolean(isSelf)}
            isSelected={Boolean(isSelected)}
            isSelectable={isSelectable}
            canModerate={canModerate}
            pendingModeration={pendingModeration ?? null}
            onSelectParticipant={onSelectParticipant}
            onChangeRole={onChangeRole}
            onRemoveParticipant={onRemoveParticipant}
          />
        );
      })}
    </div>
  );
};

export default ParticipantGrid;
