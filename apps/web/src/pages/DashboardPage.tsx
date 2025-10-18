import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../components/ui/glass-card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { StatusIndicator } from '../components/ui/status-indicator';
import { Input } from '../components/ui/input';
import { useAuthStore } from '../state/auth';
import { useSessionStore } from '../state/session';
import {
  createRoom,
  listParticipants,
  type ParticipantSummary,
  type Role,
} from '../features/session/api';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'navigator-dashboard-sessions';

type SessionStatus = 'active' | 'scheduled' | 'ended';

interface StoredSession {
  roomId: string;
  label: string;
  createdAt: string;
  lastAccessed: string;
  status: SessionStatus;
  scheduledFor: string | null;
}

interface DiscoverableSession {
  id: string;
  title: string;
  description: string;
  host: string;
  status: SessionStatus;
  scheduledFor: string | null;
  allowedRoles: Role[];
  participants: number;
}

const PUBLIC_ROOMS: DiscoverableSession[] = [
  {
    id: 'orion-lounge',
    title: 'Orion Lounge',
    description: 'Drop in for mission planning office hours with the command team.',
    host: 'Mission Control',
    status: 'active',
    scheduledFor: null,
    allowedRoles: ['explorer', 'listener'],
    participants: 12,
  },
  {
    id: 'deep-dive-briefing',
    title: 'Deep Dive Briefing',
    description: 'Public rehearsal for the Europa approach sequence.',
    host: 'Public Relations',
    status: 'active',
    scheduledFor: null,
    allowedRoles: ['facilitator', 'explorer', 'listener'],
    participants: 27,
  },
];

const SCHEDULED_ROOMS: DiscoverableSession[] = [
  {
    id: 'eva-dry-run',
    title: 'EVA Dry Run',
    description: 'Practice the timeline for tomorrow\'s surface EVA.',
    host: 'Suit Ops',
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString(),
    allowedRoles: ['facilitator', 'explorer'],
    participants: 6,
  },
  {
    id: 'media-sync',
    title: 'Media Sync',
    description: 'Align talking points ahead of the press availability.',
    host: 'Outreach Team',
    status: 'scheduled',
    scheduledFor: new Date(Date.now() + 1000 * 60 * 60 * 26).toISOString(),
    allowedRoles: ['listener', 'explorer'],
    participants: 18,
  },
];

const SESSION_STATUS_CONFIG: Record<
  SessionStatus,
  { indicator: 'connected' | 'connecting' | 'disconnected'; label: string }
> = {
  active: { indicator: 'connected', label: 'Active' },
  scheduled: { indicator: 'connecting', label: 'Scheduled' },
  ended: { indicator: 'disconnected', label: 'Archived' },
};

const isRole = (value: string | null): value is Role =>
  value === 'facilitator' || value === 'explorer' || value === 'listener';

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

const formatDateTime = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const parseInviteValue = (value: string | null | undefined): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.searchParams.has('invite')) {
      return url.searchParams.get('invite')?.trim() ?? '';
    }
    const joinMatch = url.pathname.match(/\/?join\/([\w-]+)/i);
    if (joinMatch) {
      return joinMatch[1];
    }
    return url.pathname.replace(/\//g, '');
  } catch {
    const inviteMatch = trimmed.match(/invite=([\w-]+)/i);
    if (inviteMatch) {
      return inviteMatch[1];
    }
    const joinMatch = trimmed.match(/join\/([\w-]+)/i);
    if (joinMatch) {
      return joinMatch[1];
    }
    return trimmed;
  }
};

const readStoredSessions = (): StoredSession[] => {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Partial<StoredSession> & { roomId?: string };
        if (!record.roomId) return null;
        const now = new Date().toISOString();
        return {
          roomId: record.roomId,
          label:
            typeof record.label === 'string' && record.label.trim().length > 0
              ? record.label
              : `Room ${record.roomId.slice(0, 6).toUpperCase()}`,
          createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
          lastAccessed: typeof record.lastAccessed === 'string' ? record.lastAccessed : now,
          status: record.status === 'scheduled' || record.status === 'ended' ? record.status : 'active',
          scheduledFor: typeof record.scheduledFor === 'string' ? record.scheduledFor : null,
        } satisfies StoredSession;
      })
      .filter((item): item is StoredSession => item !== null);
  } catch {
    return [];
  }
};

const avatarColor = (role: Role): string => {
  switch (role) {
    case 'facilitator':
      return 'bg-violet-600';
    case 'explorer':
      return 'bg-sky-600';
    case 'listener':
      return 'bg-emerald-600';
    default:
      return 'bg-slate-600';
  }
};

const getShareLink = (roomId: string): string => {
  if (typeof window === 'undefined') return `/join/${roomId}`;
  return `${window.location.origin}/join/${roomId}`;
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const joinMatch = useMatch('/join/:roomId');

  const { token, username, role: authRole } = useAuthStore(state => ({
    token: state.token,
    username: state.username,
    role: state.role,
  }));

  const { role: sessionRole } = useSessionStore(state => ({
    role: state.role,
  }));

  const effectiveRole = useMemo<Role | null>(() => {
    if (sessionRole) return sessionRole;
    return isRole(authRole) ? authRole : null;
  }, [authRole, sessionRole]);

  const canCreateRoom = effectiveRole === 'facilitator';

  const [sessions, setSessions] = useState<StoredSession[]>(() => readStoredSessions());
  const [presence, setPresence] = useState<Record<string, ParticipantSummary[]>>({});
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinValue, setJoinValue] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');

  const inviteFromLocation = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const inviteParam = searchParams.get('invite');
    const matchRoomId = joinMatch?.params.roomId ?? null;
    return parseInviteValue(matchRoomId ?? inviteParam ?? undefined);
  }, [joinMatch, location.search]);

  useEffect(() => {
    if (inviteFromLocation && inviteFromLocation !== joinValue) {
      setJoinValue(inviteFromLocation);
    }
  }, [inviteFromLocation, joinValue]);

  const upsertSession = useCallback((session: Partial<StoredSession> & { roomId: string }) => {
    setSessions(prev => {
      const now = new Date().toISOString();
      const existing = prev.find(item => item.roomId === session.roomId);
      const base: StoredSession = existing ?? {
        roomId: session.roomId,
        label: `Room ${session.roomId.slice(0, 6).toUpperCase()}`,
        createdAt: now,
        lastAccessed: now,
        status: 'active',
        scheduledFor: null,
      };
      const merged: StoredSession = {
        ...base,
        ...session,
        label:
          session.label && session.label.trim().length > 0
            ? session.label
            : base.label,
        lastAccessed: session.lastAccessed ?? base.lastAccessed ?? now,
        status: session.status ?? base.status,
        scheduledFor:
          session.scheduledFor === undefined ? base.scheduledFor : session.scheduledFor,
      };
      const rest = prev.filter(item => item.roomId !== session.roomId);
      return [merged, ...rest];
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (!token || !sessions.length) {
      if (!sessions.length) setPresence({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        sessions
          .filter(session => session.status !== 'ended')
          .map(async session => {
            try {
              const participants = await listParticipants(session.roomId, token);
              return [session.roomId, participants] as const;
            } catch (err) {
              console.error('Failed to load participants for session', session.roomId, err);
              return [session.roomId, []] as const;
            }
          }),
      );
      if (cancelled) return;
      setPresence(current => {
        const next = { ...current };
        entries.forEach(([roomId, participants]) => {
          next[roomId] = participants;
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [sessions, token]);

  const totalParticipants = useMemo(
    () =>
      sessions.reduce((acc, session) => {
        const list = presence[session.roomId] ?? [];
        return acc + list.length;
      }, 0),
    [presence, sessions],
  );

  const onlineParticipants = useMemo(
    () =>
      sessions.reduce((acc, session) => {
        const list = presence[session.roomId] ?? [];
        return acc + list.filter(participant => participant.connected).length;
      }, 0),
    [presence, sessions],
  );

  const activeSessions = useMemo(
    () =>
      [...sessions]
        .filter(session => session.status === 'active')
        .sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()),
    [sessions],
  );

  const archivedSessions = useMemo(
    () =>
      sessions
        .filter(session => session.status === 'ended')
        .sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()),
    [sessions],
  );

  const scheduledSessions = useMemo(
    () =>
      sessions
        .filter(session => session.status === 'scheduled' || (!!session.scheduledFor && new Date(session.scheduledFor).getTime() > Date.now()))
        .sort((a, b) => new Date(a.scheduledFor ?? a.createdAt).getTime() - new Date(b.scheduledFor ?? b.createdAt).getTime()),
    [sessions],
  );

  const filteredPublicRooms = useMemo(() => {
    if (roleFilter === 'all') return PUBLIC_ROOMS;
    return PUBLIC_ROOMS.filter(room => room.allowedRoles.includes(roleFilter));
  }, [roleFilter]);

  const filteredScheduledRooms = useMemo(() => {
    const base = [...SCHEDULED_ROOMS, ...scheduledSessions.map(session => ({
      id: session.roomId,
      title: session.label,
      description: 'Scheduled session created by your team.',
      host: username ?? 'Navigator Team',
      status: 'scheduled' as SessionStatus,
      scheduledFor: session.scheduledFor,
      allowedRoles: ['facilitator', 'explorer', 'listener'] as Role[],
      participants: (presence[session.roomId] ?? []).length,
    }))];
    if (roleFilter === 'all') return base;
    return base.filter(room => room.allowedRoles.includes(roleFilter));
  }, [presence, roleFilter, scheduledSessions, username]);

  const handleCreateRoom = useCallback(async () => {
    if (!canCreateRoom) {
      setCreateError('Only facilitators can create rooms.');
      return;
    }
    if (!token) {
      setCreateError('You need to be signed in to create a room.');
      return;
    }
    setCreatingRoom(true);
    setCreateError(null);
    try {
      const roomId = await createRoom(token, 'facilitator');
      const now = new Date().toISOString();
      const label = `Mission Room ${roomId.slice(0, 6).toUpperCase()}`;
      upsertSession({
        roomId,
        label,
        createdAt: now,
        lastAccessed: now,
        status: 'active',
      });
      setJoinValue(roomId);
      setCopiedRoomId(roomId);
      if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.clipboard) {
        const shareLink = getShareLink(roomId);
        void navigator.clipboard.writeText(shareLink).catch(() => {
          // Ignore clipboard failures; the UI will still show the link.
        });
      }
    } catch (err) {
      console.error('Failed to create room', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreatingRoom(false);
    }
  }, [canCreateRoom, token, upsertSession]);

  const handleJoin = useCallback(
    (roomId?: string) => {
      const value = roomId ?? parseInviteValue(joinValue);
      if (!value) {
        setJoinError('Enter a valid invite link or room ID.');
        return;
      }
      setJoinError(null);
      const now = new Date().toISOString();
      upsertSession({ roomId: value, lastAccessed: now, status: 'active' });
      navigate(`/session/${value}`);
    },
    [joinValue, navigate, upsertSession],
  );

  const handleArchive = useCallback(
    (roomId: string) => {
      const now = new Date().toISOString();
      upsertSession({ roomId, status: 'ended', lastAccessed: now });
    },
    [upsertSession],
  );

  const handleShareLink = useCallback((roomId: string) => {
    const shareLink = getShareLink(roomId);
    setCopiedRoomId(roomId);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(shareLink).catch(() => {
        // ignore clipboard errors
      });
    }
  }, []);

  const handleOpenSettings = useCallback(
    (roomId: string) => {
      navigate(`/session/${roomId}`, { state: { focus: 'settings' } });
    },
    [navigate],
  );

  useEffect(() => {
    if (!copiedRoomId || typeof window === 'undefined') return undefined;
    const timer = window.setTimeout(() => {
      setCopiedRoomId(null);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [copiedRoomId]);

  const displayName = username ?? 'Navigator Operator';

  return (
    <div className="flex flex-1 flex-col bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 space-y-10">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">Mission Dashboard</h1>
            <p className="mt-2 text-base text-slate-300">
              Welcome back, {displayName}. Manage your sessions, share invites, and discover new rooms.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-400">
              <span>Total sessions: {sessions.length}</span>
              <span className="hidden sm:inline">•</span>
              <span>Participants: {totalParticipants}</span>
              <span className="hidden sm:inline">•</span>
              <span>Online now: {onlineParticipants}</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button
              onClick={handleCreateRoom}
              loading={creatingRoom}
              disabled={!canCreateRoom}
              className="w-full sm:w-auto"
            >
              Create Room
            </Button>
            <Badge variant={canCreateRoom ? 'success' : 'muted'}>
              {canCreateRoom ? 'Facilitator access' : 'Invite-only creation'}
            </Badge>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <GlassCard className="lg:col-span-2">
            <GlassCardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <GlassCardTitle>Join with an invite</GlassCardTitle>
                  <GlassCardDescription>
                    Paste an invite link or room ID. Links like /join/&lt;roomId&gt; and ?invite=&lt;roomId&gt; are detected automatically.
                  </GlassCardDescription>
                </div>
                <StatusIndicator status="connecting" label="Link ready" size="sm" />
              </div>
            </GlassCardHeader>
            <GlassCardContent>
              <div className="flex flex-col gap-4 md:flex-row">
                <Input
                  value={joinValue}
                  onChange={event => {
                    setJoinValue(event.target.value);
                    setJoinError(null);
                  }}
                  placeholder="Paste invite URL or room ID"
                  className="bg-white/5 text-white placeholder:text-slate-400 md:flex-1"
                />
                <Button onClick={() => handleJoin()} className="md:w-40">
                  Join Room
                </Button>
              </div>
              {joinError ? (
                <p className="mt-3 text-sm text-rose-300">{joinError}</p>
              ) : inviteFromLocation ? (
                <p className="mt-3 text-sm text-slate-300">Invite detected for room <span className="font-semibold">{inviteFromLocation}</span>.</p>
              ) : null}
            </GlassCardContent>
          </GlassCard>

          <GlassCard>
            <GlassCardHeader>
              <GlassCardTitle>Role filter</GlassCardTitle>
              <GlassCardDescription>See sessions that match your preferred role.</GlassCardDescription>
            </GlassCardHeader>
            <GlassCardContent>
              <div className="flex flex-wrap gap-2">
                {(['all', 'facilitator', 'explorer', 'listener'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRoleFilter(option)}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm font-medium transition',
                      roleFilter === option
                        ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    )}
                  >
                    {option === 'all' ? 'All roles' : option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            </GlassCardContent>
          </GlassCard>
        </section>

        {createError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {createError}
          </div>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-white">Your active sessions</h2>
            <span className="text-sm text-slate-400">Last updated moments ago</span>
          </div>
          {activeSessions.length === 0 ? (
            <GlassCard>
              <GlassCardContent>
                <p className="text-sm text-slate-300">
                  No active sessions yet. Create a room to get started or join an invite link.
                </p>
              </GlassCardContent>
            </GlassCard>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <AnimatePresence>
                {activeSessions.map(session => {
                  const participants = presence[session.roomId] ?? [];
                  const online = participants.filter(participant => participant.connected).length;
                  const shareLink = getShareLink(session.roomId);
                  const statusConfig = SESSION_STATUS_CONFIG[session.status];
                  return (
                    <motion.div
                      key={session.roomId}
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -16 }}
                      transition={{ duration: 0.2 }}
                    >
                      <GlassCard className="h-full">
                        <GlassCardHeader className="flex flex-col gap-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <GlassCardTitle>{session.label}</GlassCardTitle>
                              <GlassCardDescription>
                                Last opened {formatRelativeTime(session.lastAccessed)}
                              </GlassCardDescription>
                            </div>
                            <StatusIndicator
                              status={statusConfig.indicator}
                              label={statusConfig.label}
                              size="sm"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                            <span>ID: {session.roomId}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>Created {formatRelativeTime(session.createdAt)}</span>
                          </div>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-4">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-400">Participants</p>
                            <div className="mt-2 flex items-center gap-3">
                              <div className="flex -space-x-2">
                                {participants.slice(0, 5).map(participant => (
                                  <span
                                    key={participant.id}
                                    className={cn(
                                      'inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-900 text-sm font-semibold text-white shadow-lg',
                                      avatarColor(participant.role)
                                    )}
                                  >
                                    {participant.role.charAt(0).toUpperCase()}
                                  </span>
                                ))}
                                {participants.length === 0 && (
                                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-white/30 text-xs text-slate-400">
                                    None
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-slate-300">
                                {participants.length} total • {online} online
                              </div>
                            </div>
                          </div>
                          <div className="rounded-xl bg-white/5 p-4 text-sm text-slate-300">
                            <p className="font-semibold text-white">Invite link</p>
                            <p className="mt-1 break-all text-slate-300">{shareLink}</p>
                            {copiedRoomId === session.roomId ? (
                              <p className="mt-2 text-sm text-emerald-300">Link copied to clipboard</p>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="mt-3"
                                onClick={() => handleShareLink(session.roomId)}
                              >
                                Share link
                              </Button>
                            )}
                          </div>
                        </GlassCardContent>
                        <div className="flex flex-wrap gap-2 border-t border-white/10 px-6 py-4">
                          <Button size="sm" onClick={() => handleJoin(session.roomId)}>
                            Join
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => handleShareLink(session.roomId)}>
                            Share Link
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleOpenSettings(session.roomId)}>
                            Settings
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleArchive(session.roomId)}>
                            Archive
                          </Button>
                        </div>
                      </GlassCard>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-white">Public rooms</h2>
            <span className="text-sm text-slate-400">Open rooms that match your filter</span>
          </div>
          {filteredPublicRooms.length === 0 ? (
            <GlassCard>
              <GlassCardContent>
                <p className="text-sm text-slate-300">No public rooms available for the selected role.</p>
              </GlassCardContent>
            </GlassCard>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {filteredPublicRooms.map(room => {
                const statusConfig = SESSION_STATUS_CONFIG[room.status];
                return (
                  <GlassCard key={room.id}>
                    <GlassCardHeader className="flex items-start justify-between gap-4">
                      <div>
                        <GlassCardTitle>{room.title}</GlassCardTitle>
                        <GlassCardDescription>{room.description}</GlassCardDescription>
                        <p className="mt-3 text-sm text-slate-300">Hosted by {room.host}</p>
                      </div>
                      <StatusIndicator status={statusConfig.indicator} label={statusConfig.label} size="sm" />
                    </GlassCardHeader>
                    <GlassCardContent className="space-y-3 text-sm text-slate-300">
                      <p>Participants: {room.participants}</p>
                      <p>Invite link: {getShareLink(room.id)}</p>
                      <div className="flex flex-wrap gap-2">
                        {room.allowedRoles.map(role => (
                          <Badge key={role} variant="muted">
                            {role.charAt(0).toUpperCase() + role.slice(1)}
                          </Badge>
                        ))}
                      </div>
                    </GlassCardContent>
                    <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
                      <span className="text-sm text-slate-400">Room ID: {room.id}</span>
                      <Button size="sm" onClick={() => handleJoin(room.id)}>
                        Join
                      </Button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4 pb-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-white">Scheduled sessions</h2>
            <span className="text-sm text-slate-400">Plan ahead and jump in when it\'s time</span>
          </div>
          {filteredScheduledRooms.length === 0 ? (
            <GlassCard>
              <GlassCardContent>
                <p className="text-sm text-slate-300">
                  No scheduled sessions match your filters. Create a room and mark it as scheduled from the session settings.
                </p>
              </GlassCardContent>
            </GlassCard>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {filteredScheduledRooms.map(room => {
                const statusConfig = SESSION_STATUS_CONFIG[room.status];
                const scheduledTime = formatDateTime(room.scheduledFor);
                return (
                  <GlassCard key={room.id}>
                    <GlassCardHeader className="flex items-start justify-between gap-4">
                      <div>
                        <GlassCardTitle>{room.title}</GlassCardTitle>
                        <GlassCardDescription>{room.description}</GlassCardDescription>
                        {scheduledTime && (
                          <p className="mt-3 text-sm text-slate-300">Starts {scheduledTime}</p>
                        )}
                        <p className="mt-1 text-sm text-slate-400">Hosted by {room.host}</p>
                      </div>
                      <StatusIndicator status={statusConfig.indicator} label={statusConfig.label} size="sm" />
                    </GlassCardHeader>
                    <GlassCardContent className="space-y-3 text-sm text-slate-300">
                      <p>Expected participants: {room.participants}</p>
                      <div className="flex flex-wrap gap-2">
                        {room.allowedRoles.map(role => (
                          <Badge key={role} variant="muted">
                            {role.charAt(0).toUpperCase() + role.slice(1)}
                          </Badge>
                        ))}
                      </div>
                    </GlassCardContent>
                    <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
                      <span className="text-sm text-slate-400">Room ID: {room.id}</span>
                      <Button size="sm" variant="secondary" onClick={() => handleJoin(room.id)}>
                        Preview
                      </Button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </section>

        {archivedSessions.length > 0 && (
          <section className="space-y-4 pb-10">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-white">Archived sessions</h2>
              <span className="text-sm text-slate-400">Stored locally for quick reference</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {archivedSessions.map(session => (
                <GlassCard key={session.roomId}>
                  <GlassCardHeader className="flex items-start justify-between gap-4">
                    <div>
                      <GlassCardTitle>{session.label}</GlassCardTitle>
                      <GlassCardDescription>
                        Archived {formatRelativeTime(session.lastAccessed)}
                      </GlassCardDescription>
                    </div>
                    <StatusIndicator status="disconnected" label="Archived" size="sm" />
                  </GlassCardHeader>
                  <GlassCardContent className="space-y-2 text-sm text-slate-300">
                    <p>Room ID: {session.roomId}</p>
                    <p>Created {formatRelativeTime(session.createdAt)}</p>
                  </GlassCardContent>
                  <div className="flex gap-2 border-t border-white/10 px-6 py-4">
                    <Button size="sm" variant="ghost" onClick={() => handleJoin(session.roomId)}>
                      Reopen
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleShareLink(session.roomId)}>
                      Share
                    </Button>
                  </div>
                </GlassCard>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
