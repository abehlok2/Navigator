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
  RoomNotFoundError,
  createRoom,
  listParticipants,
  type ParticipantSummary,
  type Role,
} from '../features/session/api';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'navigator-dashboard-sessions';

interface StoredSession {
  roomId: string;
  label: string;
  createdAt: string;
  lastAccessed: string;
}

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

const SAMPLE_STATUS = new Set(['sample', 'demo', 'example', 'mock']);

const isTruthy = (value: unknown): boolean => value === true || value === 'true';

const isSampleSession = (record: Partial<StoredSession> & {
  status?: unknown;
  source?: unknown;
  isSample?: unknown;
  sample?: unknown;
  roomId?: unknown;
  label?: unknown;
}): boolean => {
  const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : null;
  if (status && (status !== 'active' || SAMPLE_STATUS.has(status))) {
    return true;
  }

  const source = typeof record.source === 'string' ? record.source.trim().toLowerCase() : null;
  if (source && (source !== 'active' || SAMPLE_STATUS.has(source))) {
    return true;
  }

  if (isTruthy(record.isSample) || isTruthy(record.sample)) {
    return true;
  }

  const roomId = typeof record.roomId === 'string' ? record.roomId.trim() : null;
  if (!roomId) {
    return true;
  }
  if (SAMPLE_STATUS.has(roomId.toLowerCase())) {
    return true;
  }

  const label = typeof record.label === 'string' ? record.label.trim().toLowerCase() : null;
  if (label && SAMPLE_STATUS.has(label)) {
    return true;
  }

  return false;
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
        const record = item as Partial<StoredSession> & {
          roomId?: string;
          status?: string;
          source?: string;
          isSample?: boolean | string;
          sample?: boolean | string;
          label?: string;
        };
        if (!record.roomId) return null;
        if (record.status === 'ended') return null;
        if (isSampleSession(record)) return null;
        const now = new Date().toISOString();
        return {
          roomId: record.roomId,
          label:
            typeof record.label === 'string' && record.label.trim().length > 0
              ? record.label
              : `Room ${record.roomId.slice(0, 6).toUpperCase()}`,
          createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
          lastAccessed: typeof record.lastAccessed === 'string' ? record.lastAccessed : now,
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
  const [notification, setNotification] = useState<string | null>(null);
  

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
      };
      const merged: StoredSession = {
        ...base,
        ...session,
        label:
          session.label && session.label.trim().length > 0
            ? session.label
            : base.label,
        lastAccessed: session.lastAccessed ?? base.lastAccessed ?? now,
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
      const expiredRooms = new Set<string>();
      const entries = (await Promise.all(
        sessions.map(async session => {
          try {
            const participants = await listParticipants(session.roomId, token);
            return [session.roomId, participants] as const;
          } catch (err) {
            if (err instanceof RoomNotFoundError) {
              expiredRooms.add(session.roomId);
              return null;
            }
            console.error('Failed to load participants for session', session.roomId, err);
            return [session.roomId, []] as const;
          }
        }),
      ))
        .filter((entry): entry is readonly [string, ParticipantSummary[]] => entry !== null);
      if (cancelled) return;
      if (expiredRooms.size > 0) {
        const expiredLabels = sessions
          .filter(session => expiredRooms.has(session.roomId))
          .map(session => session.label);
        setSessions(prev => prev.filter(session => !expiredRooms.has(session.roomId)));
        setNotification(() => {
          if (expiredLabels.length === 1) {
            return `${expiredLabels[0]} has expired and was removed from your dashboard.`;
          }
          if (expiredLabels.length > 1) {
            const labelList = expiredLabels.join(', ');
            return `The following sessions expired and were removed: ${labelList}.`;
          }
          return 'One or more sessions expired and were removed from your dashboard.';
        });
      }
      setPresence(current => {
        const next = { ...current };
        expiredRooms.forEach(roomId => {
          delete next[roomId];
        });
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
      [...sessions].sort(
        (a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime(),
      ),
    [sessions],
  );

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
      const created = await createRoom(token, 'facilitator');
      const roomId = created.roomId;
      const now = new Date().toISOString();
      const label = `Mission Room ${roomId.slice(0, 6).toUpperCase()}`;
      upsertSession({
        roomId,
        label,
        createdAt: now,
        lastAccessed: now,
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
      upsertSession({ roomId: value, lastAccessed: now });
      navigate(`/session/${value}`);
    },
    [joinValue, navigate, upsertSession],
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

  const handleDeleteSession = useCallback((roomId: string) => {
    setSessions(prev => prev.filter(session => session.roomId !== roomId));
    setPresence(prev => {
      const { [roomId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

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
        {notification ? (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>{notification}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-amber-100/90 hover:text-amber-50"
                onClick={() => setNotification(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">Mission Dashboard</h1>
            <p className="mt-2 text-base text-slate-300">
              Welcome back, {displayName}. Manage your sessions and share invites.
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

        <section className="grid gap-6">
          <GlassCard>
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
                            <StatusIndicator status="connected" label="Active" size="sm" />
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                            <span>ID: {session.roomId}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>Created {formatRelativeTime(session.createdAt)}</span>
                          </div>
                        </GlassCardHeader>
                        <GlassCardContent className="space-y-5">
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-xs uppercase tracking-wide text-slate-400">Participants</p>
                            <div className="mt-3 flex items-center gap-3">
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
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                            <p className="font-semibold text-white">Invite link</p>
                            <p className="mt-1 break-all text-slate-300">{shareLink}</p>
                            {copiedRoomId === session.roomId ? (
                              <p className="mt-3 text-sm text-emerald-300">Link copied to clipboard</p>
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
                          <Button size="sm" variant="danger" onClick={() => handleDeleteSession(session.roomId)}>
                            Delete
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






        <div className="pb-10" />
      </div>
    </div>
  );
}
