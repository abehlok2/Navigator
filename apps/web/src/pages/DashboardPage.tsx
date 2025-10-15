import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';

import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardFooter,
  GlassCardHeader,
  GlassCardTitle,
} from '../components/ui/glass-card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { StatusIndicator, type StatusIndicatorStatus } from '../components/ui/status-indicator';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import RoomJoiner from '../features/room/components/RoomJoiner';
import AuthForm from '../features/auth/AuthForm';
import { useAuthStore } from '../state/auth';
import { useSessionStore } from '../state/session';
import {
  createRoom,
  leaveRoom,
  listParticipants,
  setRoomPassword,
  type ParticipantSummary,
  type Role,
} from '../features/session/api';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'navigator-dashboard-sessions';

const isRole = (value: string | null): value is Role =>
  value === 'facilitator' || value === 'explorer' || value === 'listener';

const normalizeRole = (value: unknown): Role | null => {
  if (value === 'facilitator' || value === 'explorer' || value === 'listener') {
    return value;
  }
  return null;
};

interface ActiveSession {
  roomId: string;
  label: string;
  createdAt: string;
  lastAccessed: string;
  participantId: string | null;
  role: Role | null;
  passwordEnabled: boolean;
  scenario: string | null;
  autoRecord: boolean;
  allowObservers: boolean;
}

type SessionStats = Record<string, { participants: number; online: number }>;

const SCENARIO_LABELS: Record<string, string> = {
  mission: 'Mission rehearsal',
  workshop: 'Collaboration workshop',
  review: 'Post-mission review',
};

const readStoredSessions = (): ActiveSession[] => {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Partial<ActiveSession> & { roomId?: string };
        if (!record.roomId || typeof record.roomId !== 'string') return null;
        const now = new Date().toISOString();
        return {
          roomId: record.roomId,
          label:
            typeof record.label === 'string' && record.label.trim().length > 0
              ? record.label
              : `Room ${record.roomId.slice(0, 6).toUpperCase()}`,
          createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
          lastAccessed: typeof record.lastAccessed === 'string' ? record.lastAccessed : now,
          participantId: record.participantId ?? null,
          role: normalizeRole(record.role) ?? null,
          passwordEnabled: Boolean(record.passwordEnabled),
          scenario: typeof record.scenario === 'string' ? record.scenario : null,
          autoRecord: Boolean(record.autoRecord),
          allowObservers: Boolean(record.allowObservers),
        } satisfies ActiveSession;
      })
      .filter((value): value is ActiveSession => value !== null);
  } catch {
    return [];
  }
};

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes <= 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const formatRole = (role: Role | null): string =>
  role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Unknown';

const getInitials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('') || 'NV';

const greetingForNow = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { token, username, role: authRole } = useAuthStore(state => ({
    token: state.token,
    username: state.username,
    role: state.role,
  }));
  const { role: sessionRole, connection } = useSessionStore(state => ({
    role: state.role,
    connection: state.connection,
  }));

  const effectiveRole = useMemo<Role | null>(() => {
    if (sessionRole) return sessionRole;
    return isRole(authRole) ? authRole : null;
  }, [authRole, sessionRole]);

  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>(() => readStoredSessions());
  const [sessionStats, setSessionStats] = useState<SessionStats>({});

  const upsertSession = useCallback((session: Partial<ActiveSession> & { roomId: string }) => {
    setActiveSessions(prev => {
      const existing = prev.find(item => item.roomId === session.roomId);
      const now = new Date().toISOString();
      const baseCreatedAt = existing?.createdAt ?? now;
      const merged: ActiveSession = {
        roomId: session.roomId,
        label:
          session.label && session.label.trim().length > 0
            ? session.label
            : existing?.label ?? `Room ${session.roomId.slice(0, 6).toUpperCase()}`,
        createdAt: baseCreatedAt,
        lastAccessed: session.lastAccessed ?? existing?.lastAccessed ?? now,
        participantId:
          session.participantId === undefined
            ? existing?.participantId ?? null
            : session.participantId,
        role:
          session.role === undefined
            ? existing?.role ?? null
            : normalizeRole(session.role) ?? null,
        passwordEnabled:
          session.passwordEnabled === undefined
            ? existing?.passwordEnabled ?? false
            : session.passwordEnabled,
        scenario:
          session.scenario === undefined ? existing?.scenario ?? null : session.scenario ?? null,
        autoRecord: session.autoRecord === undefined ? existing?.autoRecord ?? false : session.autoRecord,
        allowObservers:
          session.allowObservers === undefined ? existing?.allowObservers ?? false : session.allowObservers,
      };
      const filtered = prev.filter(item => item.roomId !== session.roomId);
      return [merged, ...filtered];
    });
  }, []);

  const removeSession = useCallback((roomId: string) => {
    setActiveSessions(prev => prev.filter(item => item.roomId !== roomId));
  }, []);

  const touchSession = useCallback(
    (roomId: string) => {
      upsertSession({ roomId, lastAccessed: new Date().toISOString() });
    },
    [upsertSession],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = activeSessions.map(session => ({
      roomId: session.roomId,
      label: session.label,
      createdAt: session.createdAt,
      lastAccessed: session.lastAccessed,
      participantId: session.participantId ?? null,
      role: session.role ?? null,
      passwordEnabled: session.passwordEnabled ?? false,
      scenario: session.scenario ?? null,
      autoRecord: session.autoRecord ?? false,
      allowObservers: session.allowObservers ?? false,
    }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [activeSessions]);

  useEffect(() => {
    if (!token || !activeSessions.length) {
      if (!activeSessions.length) {
        setSessionStats({});
      }
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        activeSessions.map(async session => {
          try {
            const list = await listParticipants(session.roomId, token);
            return [
              session.roomId,
              {
                participants: list.length,
                online: list.filter(participant => participant.connected).length,
              },
            ] as const;
          } catch (err) {
            console.error(err);
            return [session.roomId, { participants: 0, online: 0 }] as const;
          }
        }),
      );
      if (cancelled) return;
      setSessionStats(current => {
        const next = { ...current };
        entries.forEach(([roomId, stats]) => {
          next[roomId] = stats;
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSessions, token]);

  const sortedActiveSessions = useMemo(
    () =>
      [...activeSessions].sort((a, b) => {
        const aTime = new Date(a.lastAccessed).getTime();
        const bTime = new Date(b.lastAccessed).getTime();
        return bTime - aTime;
      }),
    [activeSessions],
  );

  const totalParticipants = useMemo(
    () =>
      sortedActiveSessions.reduce((acc, session) => acc + (sessionStats[session.roomId]?.participants ?? 0), 0),
    [sessionStats, sortedActiveSessions],
  );

  const onlineParticipants = useMemo(
    () =>
      sortedActiveSessions.reduce((acc, session) => acc + (sessionStats[session.roomId]?.online ?? 0), 0),
    [sessionStats, sortedActiveSessions],
  );

  const recentSessions = useMemo(() => sortedActiveSessions.slice(0, 4), [sortedActiveSessions]);

  const recentRecordings = useMemo(
    () =>
      sortedActiveSessions.slice(0, 3).map((session, index) => {
        const minutes = 14 + index * 3;
        const seconds = (index * 17) % 60;
        return {
          id: `${session.roomId}-recording-${index}`,
          title: `${session.label} — Capture ${index + 1}`,
          timestamp: session.lastAccessed,
          duration: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
        };
      }),
    [sortedActiveSessions],
  );

  const [createWizardOpen, setCreateWizardOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);

  const [wizardName, setWizardName] = useState('');
  const [wizardTemplate, setWizardTemplate] = useState('mission');
  const [wizardPassword, setWizardPassword] = useState('');
  const [wizardAutoRecord, setWizardAutoRecord] = useState(true);
  const [wizardAllowObservers, setWizardAllowObservers] = useState(false);
  const [wizardStartNow, setWizardStartNow] = useState(true);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinParticipants, setJoinParticipants] = useState<ParticipantSummary[]>([]);
  const [joinTargetId, setJoinTargetId] = useState('');
  const [joinLoadingParticipants, setJoinLoadingParticipants] = useState(false);
  const [joinCreatingRoom, setJoinCreatingRoom] = useState(false);
  const [joinConnecting, setJoinConnecting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!joinModalOpen) {
      setJoinError(null);
      setJoinLoadingParticipants(false);
      setJoinConnecting(false);
      return;
    }
    setJoinParticipants([]);
  }, [joinModalOpen]);

  const availableJoinTargets = useMemo(() => {
    if (!effectiveRole) return joinParticipants;
    switch (effectiveRole) {
      case 'listener':
      case 'explorer':
        return joinParticipants.filter(participant => participant.role === 'facilitator');
      case 'facilitator':
        return joinParticipants.filter(participant => participant.role !== 'facilitator');
      default:
        return joinParticipants;
    }
  }, [effectiveRole, joinParticipants]);

  useEffect(() => {
    if (!availableJoinTargets.length) {
      if (joinTargetId) setJoinTargetId('');
      return;
    }
    if (!availableJoinTargets.some(participant => participant.id === joinTargetId)) {
      setJoinTargetId(availableJoinTargets[0].id);
    }
  }, [availableJoinTargets, joinTargetId]);

  const handleWizardStart = useCallback(async () => {
    if (!token) {
      setWizardError('Authentication token is missing.');
      return;
    }
    setWizardSaving(true);
    setWizardError(null);
    try {
      const roomId = await createRoom(token);
      if (wizardPassword.trim().length > 0) {
        await setRoomPassword(roomId, token, wizardPassword.trim());
      }
      const label = wizardName.trim().length > 0 ? wizardName.trim() : `Mission Room ${roomId.slice(0, 6).toUpperCase()}`;
      const now = new Date().toISOString();
      upsertSession({
        roomId,
        label,
        lastAccessed: now,
        role: effectiveRole,
        passwordEnabled: wizardPassword.trim().length > 0,
        scenario: wizardTemplate,
        autoRecord: wizardAutoRecord,
        allowObservers: wizardAllowObservers,
      });
      setCreateWizardOpen(false);
      setWizardName('');
      setWizardPassword('');
      if (wizardStartNow) {
        navigate(`/session/${roomId}`);
      }
    } catch (err) {
      console.error(err);
      setWizardError('Failed to create room.');
    } finally {
      setWizardSaving(false);
    }
  }, [
    effectiveRole,
    navigate,
    token,
    upsertSession,
    wizardAllowObservers,
    wizardAutoRecord,
    wizardName,
    wizardPassword,
    wizardStartNow,
    wizardTemplate,
  ]);

  const handleJoinCreateRoom = useCallback(async () => {
    if (!token) {
      setJoinError('Authentication token is missing.');
      return;
    }
    setJoinCreatingRoom(true);
    setJoinError(null);
    try {
      const roomId = await createRoom(token);
      setJoinRoomId(roomId);
      const now = new Date().toISOString();
      upsertSession({
        roomId,
        lastAccessed: now,
        role: effectiveRole,
        passwordEnabled: false,
      });
    } catch (err) {
      console.error(err);
      setJoinError('Failed to create room.');
    } finally {
      setJoinCreatingRoom(false);
    }
  }, [effectiveRole, token, upsertSession]);

  const handleRefreshParticipants = useCallback(async () => {
    if (!token) {
      setJoinError('Authentication token is missing.');
      return;
    }
    if (!joinRoomId.trim()) {
      setJoinError('Enter a room ID first.');
      return;
    }
    setJoinLoadingParticipants(true);
    setJoinError(null);
    try {
      const list = await listParticipants(joinRoomId.trim(), token);
      setJoinParticipants(list);
    } catch (err) {
      console.error(err);
      setJoinError('Failed to load participants.');
    } finally {
      setJoinLoadingParticipants(false);
    }
  }, [joinRoomId, token]);

  const handleJoinConnect = useCallback(async () => {
    if (!token) {
      setJoinError('Authentication token is missing.');
      return;
    }
    if (!joinRoomId.trim()) {
      setJoinError('Room ID is required.');
      return;
    }
    if (!joinTargetId) {
      setJoinError('Select a participant to connect with.');
      return;
    }
    const target = joinParticipants.find(participant => participant.id === joinTargetId);
    if (!target) {
      setJoinError('Selected participant is no longer available.');
      return;
    }
    setJoinConnecting(true);
    setJoinError(null);
    try {
      const now = new Date().toISOString();
      upsertSession({
        roomId: joinRoomId.trim(),
        lastAccessed: now,
        role: effectiveRole,
        passwordEnabled: joinPassword.trim().length > 0,
      });
      setJoinModalOpen(false);
      navigate(`/session/${joinRoomId.trim()}`, {
        state: { targetId: joinTargetId, joinPassword: joinPassword.trim() || undefined },
      });
    } catch (err) {
      console.error(err);
      setJoinError('Failed to start session.');
    } finally {
      setJoinConnecting(false);
    }
  }, [effectiveRole, joinParticipants, joinPassword, joinRoomId, joinTargetId, navigate, token, upsertSession]);

  const handleContinueSession = useCallback(
    (roomId: string) => {
      touchSession(roomId);
      navigate(`/session/${roomId}`);
    },
    [navigate, touchSession],
  );

  const handleLeaveSession = useCallback(
    async (session: ActiveSession) => {
      if (token && session.participantId) {
        try {
          await leaveRoom(session.roomId, session.participantId, token);
        } catch (err) {
          console.error(err);
        }
      }
      removeSession(session.roomId);
    },
    [removeSession, token],
  );

  const displayName = username ?? 'Navigator Operator';
  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const greeting = useMemo(() => greetingForNow(), []);
  const connectionStatus: StatusIndicatorStatus = connection === 'connected'
    ? 'connected'
    : connection === 'connecting'
      ? 'connecting'
      : 'disconnected';
  const connectionLabel =
    connection === 'connected'
      ? 'Live session link'
      : connection === 'connecting'
        ? 'Negotiating link'
        : 'Idle';
  const canCreateRoom = effectiveRole === 'facilitator';

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 py-12">
        <AuthForm />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_55%)]" aria-hidden />
        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
          <header className="flex flex-col gap-6">
            <GlassCard variant="elevated" glowColor="blue" className="border-white/10 bg-white/[0.04]">
              <GlassCardContent className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-col gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.4em] text-sky-200/80">Mission control</span>
                  <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                    {greeting}, {displayName.split(' ')[0] ?? 'Operator'}
                  </h1>
                  <p className="max-w-xl text-sm text-slate-300 sm:text-base">
                    Monitor active rooms, launch new collaborations, and jump back into live sessions without losing momentum.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[{
                      label: 'Active rooms',
                      value: sortedActiveSessions.length,
                    }, {
                      label: 'Participants tracked',
                      value: totalParticipants,
                    }, {
                      label: 'Online right now',
                      value: onlineParticipants,
                    }].map(stat => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner"
                      >
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-300/90">{stat.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
                <div className="flex min-w-[18rem] flex-col gap-4 rounded-3xl border border-white/10 bg-white/10 p-5 text-sm text-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/20 text-lg font-semibold text-white shadow-inner">
                      {initials}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-base font-semibold text-white">{displayName}</span>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200/80">
                        <Badge variant="info">{formatRole(effectiveRole)}</Badge>
                        <StatusIndicator status={connectionStatus} label={connectionLabel} size="sm" className="bg-white/5 px-2 py-1" />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-200/90 shadow-inner">
                    <p className="font-semibold uppercase tracking-[0.35em] text-slate-200">Latest sync</p>
                    <p className="mt-2 font-mono text-sm text-white/90">{formatTimestamp(sortedActiveSessions[0]?.lastAccessed ?? new Date().toISOString())}</p>
                    <p className="mt-1 text-xs text-slate-300">
                      Stay within this dashboard to track updates across every mission room in real time.
                    </p>
                  </div>
                </div>
              </GlassCardContent>
            </GlassCard>
          </header>

          <main className="grid gap-6 xl:grid-cols-[2fr,1fr]">
            <div className="flex flex-col gap-6">
              <GlassCard variant="elevated" glowColor="purple" className="overflow-hidden border-white/10 bg-white/[0.05]">
                <GlassCardHeader className="flex flex-col gap-3 border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <GlassCardTitle className="text-2xl text-white">Quick start</GlassCardTitle>
                    <GlassCardDescription className="text-slate-200/80">
                      Launch a new room or join an existing session with guided controls and smart defaults.
                    </GlassCardDescription>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-200/80">
                    <span className="rounded-full border border-emerald-300/40 bg-emerald-500/10 px-3 py-1 font-semibold uppercase tracking-[0.3em] text-emerald-100">
                      {canCreateRoom ? 'Facilitator' : 'Guest'} access
                    </span>
                  </div>
                </GlassCardHeader>
                <GlassCardContent className="gap-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="primary"
                      glass
                      size="lg"
                      className="h-16 justify-between rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 text-left text-white shadow-[0_24px_60px_-30px_rgba(59,130,246,0.9)]"
                      onClick={() => {
                        setWizardError(null);
                        setCreateWizardOpen(true);
                      }}
                    >
                      <span className="flex flex-col text-left">
                        <span className="text-sm uppercase tracking-[0.35em] text-white/80">Create</span>
                        <span className="text-lg font-semibold">Launch room wizard</span>
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        stroke="currentColor"
                        strokeWidth={1.6}
                      >
                        <path d="M5 12h14" strokeLinecap="round" />
                        <path d="M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      glass
                      size="lg"
                      className="h-16 justify-between rounded-2xl border border-white/15 bg-white/10 text-left text-white shadow-[0_20px_45px_-30px_rgba(148,163,184,0.8)]"
                      onClick={() => setJoinModalOpen(true)}
                    >
                      <span className="flex flex-col text-left">
                        <span className="text-sm uppercase tracking-[0.35em] text-white/70">Join</span>
                        <span className="text-lg font-semibold">Open room joiner</span>
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        stroke="currentColor"
                        strokeWidth={1.6}
                      >
                        <path d="M12 5v14" strokeLinecap="round" />
                        <path d="M19 12l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Button>
                  </div>
                </GlassCardContent>
                <GlassCardFooter className="flex flex-col gap-4 border-white/10 text-xs text-slate-200/80 sm:flex-row sm:items-center sm:justify-between">
                  <span>Use the wizard for advanced room presets or jump straight into the Room Joiner to validate access credentials.</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 uppercase tracking-[0.3em] text-slate-200">
                      Secure by design
                    </span>
                  </div>
                </GlassCardFooter>
              </GlassCard>

              <GlassCard variant="default" glowColor="blue" className="border-white/10 bg-white/[0.04]">
                <GlassCardHeader className="flex flex-col gap-2 border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <GlassCardTitle className="text-2xl text-white">Active sessions</GlassCardTitle>
                    <GlassCardDescription className="text-slate-200/80">
                      Track the rooms you’ve recently prepared. Continue where you left off or retire inactive sessions.
                    </GlassCardDescription>
                  </div>
                  <Button type="button" variant="ghost" className="border border-white/15 bg-white/10 text-white hover:bg-white/20" onClick={() => setCreateWizardOpen(true)}>
                    New room
                  </Button>
                </GlassCardHeader>
                <GlassCardContent className="gap-5">
                  {sortedActiveSessions.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-sm text-slate-200">
                      <p className="text-base font-semibold text-white">No active rooms yet</p>
                      <p className="mt-2 text-sm text-slate-200/80">
                        Use the quick start controls above to create a mission room or connect to an existing session.
                      </p>
                      <div className="mt-5 flex justify-center">
                        <Button type="button" variant="primary" onClick={() => setCreateWizardOpen(true)}>
                          Launch room wizard
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <ul className="space-y-4">
                      <AnimatePresence initial={false}>
                        {sortedActiveSessions.map(session => {
                          const stats = sessionStats[session.roomId] ?? { participants: 0, online: 0 };
                          const scenarioLabel = session.scenario ? SCENARIO_LABELS[session.scenario] ?? 'Custom mission' : 'Custom mission';
                          const status: StatusIndicatorStatus = stats.online > 0 ? 'connected' : 'disconnected';
                          return (
                            <motion.li
                              key={session.roomId}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -12 }}
                              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                              className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_45px_-35px_rgba(59,130,246,0.6)]"
                            >
                              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <h2 className="text-xl font-semibold text-white">{session.label}</h2>
                                    <Badge variant="info" className="bg-sky-100/90 text-sky-700">
                                      Room {session.roomId.slice(0, 8)}
                                    </Badge>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-200/80">
                                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">{scenarioLabel}</span>
                                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">{formatRole(session.role ?? effectiveRole)}</span>
                                    <span className={cn(
                                      'rounded-full border px-3 py-1',
                                      session.passwordEnabled
                                        ? 'border-emerald-300/50 bg-emerald-500/10 text-emerald-100'
                                        : 'border-white/15 bg-white/5 text-slate-200/80',
                                    )}>
                                      {session.passwordEnabled ? 'Password enabled' : 'Open access'}
                                    </span>
                                    <span className={cn(
                                      'rounded-full border px-3 py-1',
                                      session.autoRecord
                                        ? 'border-emerald-300/50 bg-emerald-500/10 text-emerald-100'
                                        : 'border-white/15 bg-white/5 text-slate-200/80',
                                    )}>
                                      {session.autoRecord ? 'Auto record on' : 'Manual capture'}
                                    </span>
                                    {session.allowObservers ? (
                                      <span className="rounded-full border border-emerald-300/50 bg-emerald-500/10 px-3 py-1 text-emerald-100">
                                        Observers enabled
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-200/80">
                                    <span>Participants: {stats.participants}</span>
                                    <span>Online: {stats.online}</span>
                                    <span>Last accessed: {formatRelativeTime(session.lastAccessed)}</span>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-3 md:items-end">
                                  <StatusIndicator status={status} label={status === 'connected' ? 'Participants online' : 'Waiting for attendees'} size="sm" />
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <Button type="button" variant="primary" glass onClick={() => handleContinueSession(session.roomId)}>
                                      Continue session
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="danger"
                                      onClick={() => {
                                        void handleLeaveSession(session);
                                      }}
                                    >
                                      Leave session
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </motion.li>
                          );
                        })}
                      </AnimatePresence>
                    </ul>
                  )}
                </GlassCardContent>
              </GlassCard>
            </div>

            <div className="flex flex-col gap-6">
              <GlassCard variant="default" glowColor="green" className="border-white/10 bg-white/[0.04]">
                <GlassCardHeader className="border-white/10 pb-4">
                  <GlassCardTitle className="text-2xl text-white">Recent activity</GlassCardTitle>
                  <GlassCardDescription className="text-slate-200/80">
                    Quick snapshots of the latest recordings and sessions you’ve touched.
                  </GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="gap-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-white/80">Recent recordings</p>
                        <Badge variant="muted" className="bg-white/15 text-slate-200">Beta</Badge>
                      </div>
                      <div className="mt-4 space-y-4">
                        {recentRecordings.length === 0 ? (
                          <p className="text-sm text-slate-200/80">Recording archives will appear here after your first capture.</p>
                        ) : (
                          recentRecordings.map(item => (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, x: -12 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                              className="rounded-2xl border border-white/10 bg-white/10 p-4"
                            >
                              <p className="text-sm font-semibold text-white">{item.title}</p>
                              <p className="mt-1 text-xs text-slate-200/80">Captured {formatRelativeTime(item.timestamp)} • {item.duration}</p>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-white/80">Recent sessions</p>
                        <Badge variant="success" className="bg-emerald-200 text-emerald-900">Live</Badge>
                      </div>
                      <div className="mt-4 space-y-4">
                        {recentSessions.length === 0 ? (
                          <p className="text-sm text-slate-200/80">Your latest sessions will appear after you join or create a room.</p>
                        ) : (
                          recentSessions.map(session => (
                            <motion.div
                              key={`recent-${session.roomId}`}
                              initial={{ opacity: 0, x: 12 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                              className="rounded-2xl border border-white/10 bg-white/10 p-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-white">{session.label}</p>
                                <Badge variant="info" className="bg-sky-100/90 text-sky-700">
                                  {sessionStats[session.roomId]?.online ?? 0} online
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-slate-200/80">Last touched {formatRelativeTime(session.lastAccessed)}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-slate-200/80">
                                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">{SCENARIO_LABELS[session.scenario ?? ''] ?? 'Custom mission'}</span>
                                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Room {session.roomId.slice(0, 6)}</span>
                              </div>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCardContent>
              </GlassCard>
            </div>
          </main>
        </div>
      </div>

      <Dialog.Root open={createWizardOpen} onOpenChange={setCreateWizardOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-3xl"
            >
              <GlassCard variant="elevated" glowColor="purple" className="border-white/10 bg-white/[0.06]">
                <GlassCardHeader className="flex flex-col gap-2 border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Dialog.Title asChild>
                      <GlassCardTitle className="text-2xl text-white">Create a mission room</GlassCardTitle>
                    </Dialog.Title>
                    <Dialog.Description asChild>
                      <GlassCardDescription className="text-slate-200/80">
                        Configure room presets, optional passwords, and participation rules before launching.
                      </GlassCardDescription>
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-slate-100 transition hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                    >
                      <span className="sr-only">Close</span>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" stroke="currentColor" strokeWidth={1.6}>
                        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </Dialog.Close>
                </GlassCardHeader>
                <GlassCardContent className="gap-6">
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="wizard-name" className="text-sm text-slate-100">
                          Room name
                        </Label>
                        <Input
                          id="wizard-name"
                          value={wizardName}
                          onChange={event => setWizardName(event.target.value)}
                          placeholder="e.g. Europa Mission Briefing"
                          className="bg-white/10 text-white placeholder:text-slate-300"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="wizard-template" className="text-sm text-slate-100">
                          Collaboration format
                        </Label>
                        <Select
                          id="wizard-template"
                          value={wizardTemplate}
                          onChange={event => setWizardTemplate(event.target.value)}
                          className="rounded-xl border-white/15 bg-white/10 text-white"
                        >
                          <option value="mission">Mission rehearsal</option>
                          <option value="workshop">Collaboration workshop</option>
                          <option value="review">Post-mission review</option>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="wizard-password" className="text-sm text-slate-100">
                          Optional password
                        </Label>
                        <Input
                          id="wizard-password"
                          type="password"
                          value={wizardPassword}
                          onChange={event => setWizardPassword(event.target.value)}
                          placeholder="Leave blank for open access"
                          className="bg-white/10 text-white placeholder:text-slate-300"
                        />
                        <p className="text-xs text-slate-200/70">Passwords encrypt session entry requirements for invited participants.</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm font-semibold text-white">Room settings</p>
                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div>
                            <p className="text-sm text-white">Auto start recording</p>
                            <p className="text-xs text-slate-200/70">Capture audio logs as soon as the room goes live.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setWizardAutoRecord(value => !value)}
                            className={cn(
                              'relative h-9 w-16 rounded-full border transition-colors',
                              wizardAutoRecord ? 'border-emerald-400 bg-emerald-500/30' : 'border-white/20 bg-white/10',
                            )}
                          >
                            <span
                              className={cn(
                                'absolute top-1/2 h-7 w-7 -translate-y-1/2 transform rounded-full bg-white transition-transform',
                                wizardAutoRecord ? 'translate-x-8' : 'translate-x-1',
                              )}
                            />
                            <span className="sr-only">Toggle auto record</span>
                          </button>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div>
                            <p className="text-sm text-white">Allow observers</p>
                            <p className="text-xs text-slate-200/70">Permit listen-only attendees without participant controls.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setWizardAllowObservers(value => !value)}
                            className={cn(
                              'relative h-9 w-16 rounded-full border transition-colors',
                              wizardAllowObservers ? 'border-emerald-400 bg-emerald-500/30' : 'border-white/20 bg-white/10',
                            )}
                          >
                            <span
                              className={cn(
                                'absolute top-1/2 h-7 w-7 -translate-y-1/2 transform rounded-full bg-white transition-transform',
                                wizardAllowObservers ? 'translate-x-8' : 'translate-x-1',
                              )}
                            />
                            <span className="sr-only">Toggle observers</span>
                          </button>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div>
                            <p className="text-sm text-white">Auto-open session workspace</p>
                            <p className="text-xs text-slate-200/70">Jump straight to the live session after creation.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setWizardStartNow(value => !value)}
                            className={cn(
                              'relative h-9 w-16 rounded-full border transition-colors',
                              wizardStartNow ? 'border-emerald-400 bg-emerald-500/30' : 'border-white/20 bg-white/10',
                            )}
                          >
                            <span
                              className={cn(
                                'absolute top-1/2 h-7 w-7 -translate-y-1/2 transform rounded-full bg-white transition-transform',
                                wizardStartNow ? 'translate-x-8' : 'translate-x-1',
                              )}
                            />
                            <span className="sr-only">Toggle auto open</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {wizardError && (
                    <div className="rounded-2xl border border-rose-400/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {wizardError}
                    </div>
                  )}
                </GlassCardContent>
                <GlassCardFooter className="flex flex-col gap-3 border-white/10 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-200/80">You can adjust these settings later from within the session controls.</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Dialog.Close asChild>
                      <Button type="button" variant="ghost" className="border border-white/15 bg-white/10 text-white hover:bg-white/20">
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Button
                      type="button"
                      variant="primary"
                      glass
                      loading={wizardSaving}
                      spinnerLabel="Creating room"
                      onClick={() => {
                        void handleWizardStart();
                      }}
                    >
                      {wizardSaving ? 'Creating…' : 'Start session'}
                    </Button>
                  </div>
                </GlassCardFooter>
              </GlassCard>
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={joinModalOpen} onOpenChange={setJoinModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/75 backdrop-blur" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Dialog.Title className="sr-only">Join a mission room</Dialog.Title>
            <Dialog.Description className="sr-only">
              Step through the room setup to connect with the right participant.
            </Dialog.Description>
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-3xl"
            >
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-slate-100 transition hover:border-white/30 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  <span className="sr-only">Close joiner</span>
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" stroke="currentColor" strokeWidth={1.6}>
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </Dialog.Close>
              <RoomJoiner
                roomId={joinRoomId}
                onRoomIdChange={setJoinRoomId}
                canCreateRoom={canCreateRoom}
                creatingRoom={joinCreatingRoom}
                onCreateRoom={() => handleJoinCreateRoom()}
                joinPassword={joinPassword}
                onJoinPasswordChange={setJoinPassword}
                participants={joinParticipants}
                availableTargets={availableJoinTargets}
                loadingParticipants={joinLoadingParticipants}
                onRefreshParticipants={() => handleRefreshParticipants()}
                targetId={joinTargetId}
                onTargetChange={setJoinTargetId}
                onConnect={() => handleJoinConnect()}
                connecting={joinConnecting}
                participantId={null}
                error={joinError}
                onResetError={() => setJoinError(null)}
                role={effectiveRole}
              />
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
