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
import { StatusIndicator } from '../components/ui/status-indicator';
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
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

const formatRole = (role: Role | null): string =>
  role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Unknown';

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
  const resetWizard = useCallback(() => {
    setWizardName('');
    setWizardTemplate('mission');
    setWizardPassword('');
    setWizardAutoRecord(true);
    setWizardAllowObservers(false);
    setWizardStartNow(true);
    setWizardSaving(false);
    setWizardError(null);
  }, []);

  const openRoomWizard = useCallback(() => {
    resetWizard();
    setCreateWizardOpen(true);
  }, [resetWizard]);

  useEffect(() => {
    if (createWizardOpen) return;
    resetWizard();
  }, [createWizardOpen, resetWizard]);

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
      return false;
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
      return true;
    } catch (err) {
      console.error(err);
      setJoinError('Failed to create room.');
      return false;
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
  const canCreateRoom = effectiveRole === 'facilitator';

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 py-12">
        <AuthForm />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Header */}
        <header className="mb-12">
          <div className="mb-4">
            <h1 className="text-4xl font-bold text-white mb-2">
              Welcome back, {displayName.split(' ')[0]}
            </h1>
            <p className="text-lg text-slate-400">
              {formatRole(effectiveRole)} • {sortedActiveSessions.length} active rooms
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-6 sm:grid-cols-3 mt-8">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-sm text-slate-400 mb-1">Active Rooms</div>
              <div className="text-3xl font-bold text-white">{sortedActiveSessions.length}</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-sm text-slate-400 mb-1">Total Participants</div>
              <div className="text-3xl font-bold text-white">{totalParticipants}</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-sm text-slate-400 mb-1">Currently Online</div>
              <div className="text-3xl font-bold text-emerald-400">{onlineParticipants}</div>
            </div>
          </div>
        </header>

        {/* Quick Actions */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-white">Quick Actions</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={openRoomWizard}
              className="group rounded-2xl bg-violet-600 p-8 text-left transition-all hover:bg-violet-500 hover:scale-[1.02]"
            >
              <div className="text-sm font-medium text-violet-200 mb-2">CREATE</div>
              <div className="text-xl font-bold text-white mb-1">New Mission Room</div>
              <div className="text-sm text-violet-100/80">Launch a new collaborative session</div>
            </button>
            <button
              onClick={() => setJoinModalOpen(true)}
              className="group rounded-2xl bg-white/5 border-2 border-white/10 p-8 text-left transition-all hover:bg-white/10 hover:border-white/20"
            >
              <div className="text-sm font-medium text-slate-400 mb-2">JOIN</div>
              <div className="text-xl font-bold text-white mb-1">Existing Room</div>
              <div className="text-sm text-slate-400">Connect to an active session</div>
            </button>
          </div>
        </section>

        {/* Active Sessions */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-white">Your Sessions</h2>
          </div>

          {sortedActiveSessions.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-white/20 bg-white/5 p-12 text-center">
              <p className="text-lg text-slate-300 mb-4">No active sessions</p>
              <p className="text-sm text-slate-400 mb-6">Create a new room to get started</p>
              <Button onClick={openRoomWizard} variant="primary">
                Create Room
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {sortedActiveSessions.map(session => {
                  const stats = sessionStats[session.roomId] ?? { participants: 0, online: 0 };
                  const isActive = stats.online > 0;
                  
                  return (
                    <motion.div
                      key={session.roomId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="rounded-2xl bg-white/5 border border-white/10 p-6 hover:bg-white/[0.07] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-3">
                            <h3 className="text-lg font-semibold text-white truncate">
                              {session.label}
                            </h3>
                            {isActive && (
                              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                Active
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-3 text-sm text-slate-400 mb-3">
                            <span>Room {session.roomId.slice(0, 8)}</span>
                            <span>•</span>
                            <span>{stats.participants} participants</span>
                            <span>•</span>
                            <span>{stats.online} online</span>
                            <span>•</span>
                            <span>{formatRelativeTime(session.lastAccessed)}</span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Badge variant="info">
                              {SCENARIO_LABELS[session.scenario ?? ''] ?? 'Custom'}
                            </Badge>
                            <Badge variant={session.passwordEnabled ? 'success' : 'muted'}>
                              {session.passwordEnabled ? 'Secured' : 'Open'}
                            </Badge>
                            {session.autoRecord && (
                              <Badge variant="muted">Recording</Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleContinueSession(session.roomId)}
                            variant="primary"
                            size="sm"
                          >
                            Continue
                          </Button>
                          <Button
                            onClick={() => handleLeaveSession(session)}
                            variant="ghost"
                            size="sm"
                          >
                            Leave
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>
      </div>

      {/* Modals remain the same */}
      <Dialog.Root open={createWizardOpen} onOpenChange={setCreateWizardOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-white/10 p-8"
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <Dialog.Title className="text-2xl font-bold text-white mb-2">
                    Create Mission Room
                  </Dialog.Title>
                  <Dialog.Description className="text-slate-400">
                    Configure your new collaborative session
                  </Dialog.Description>
                </div>
                <Dialog.Close className="rounded-lg p-2 hover:bg-white/10 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Dialog.Close>
              </div>

              <div className="space-y-6">
                <div>
                  <Label htmlFor="wizard-name" className="text-white mb-2 block">Room Name</Label>
                  <Input
                    id="wizard-name"
                    value={wizardName}
                    onChange={e => setWizardName(e.target.value)}
                    placeholder="Europa Mission Briefing"
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>

                <div>
                  <Label htmlFor="wizard-template" className="text-white mb-2 block">Format</Label>
                  <Select
                    id="wizard-template"
                    value={wizardTemplate}
                    onChange={e => setWizardTemplate(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  >
                    <option value="mission">Mission Rehearsal</option>
                    <option value="workshop">Collaboration Workshop</option>
                    <option value="review">Post-Mission Review</option>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="wizard-password" className="text-white mb-2 block">Password (Optional)</Label>
                  <Input
                    id="wizard-password"
                    type="password"
                    value={wizardPassword}
                    onChange={e => setWizardPassword(e.target.value)}
                    placeholder="Leave blank for open access"
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10">
                    <div>
                      <div className="text-white font-medium">Auto-record sessions</div>
                      <div className="text-sm text-slate-400">Start recording automatically</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={wizardAutoRecord}
                      onChange={e => setWizardAutoRecord(e.target.checked)}
                      className="w-5 h-5 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10">
                    <div>
                      <div className="text-white font-medium">Allow observers</div>
                      <div className="text-sm text-slate-400">Permit listen-only participants</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={wizardAllowObservers}
                      onChange={e => setWizardAllowObservers(e.target.checked)}
                      className="w-5 h-5 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10">
                    <div>
                      <div className="text-white font-medium">Start immediately</div>
                      <div className="text-sm text-slate-400">Jump to session after creation</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={wizardStartNow}
                      onChange={e => setWizardStartNow(e.target.checked)}
                      className="w-5 h-5 rounded"
                    />
                  </label>
                </div>

                {wizardError && (
                  <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                    {wizardError}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleWizardStart}
                    loading={wizardSaving}
                    variant="primary"
                    className="flex-1"
                  >
                    Create Room
                  </Button>
                  <Dialog.Close asChild>
                    <Button variant="ghost" className="flex-1">
                      Cancel
                    </Button>
                  </Dialog.Close>
                </div>
              </div>
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={joinModalOpen} onOpenChange={setJoinModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Dialog.Title className="sr-only">Join Room</Dialog.Title>
            <Dialog.Description className="sr-only">Connect to an existing session</Dialog.Description>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl"
            >
              <Dialog.Close asChild>
                <button className="absolute right-5 top-5 z-10 rounded-lg p-2 hover:bg-white/10">
                  <span className="sr-only">Close</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Dialog.Close>
              <RoomJoiner
                roomId={joinRoomId}
                onRoomIdChange={setJoinRoomId}
                canCreateRoom={canCreateRoom}
                creatingRoom={joinCreatingRoom}
                onCreateRoom={handleJoinCreateRoom}
                joinPassword={joinPassword}
                onJoinPasswordChange={setJoinPassword}
                participants={joinParticipants}
                availableTargets={availableJoinTargets}
                loadingParticipants={joinLoadingParticipants}
                onRefreshParticipants={handleRefreshParticipants}
                targetId={joinTargetId}
                onTargetChange={setJoinTargetId}
                onConnect={handleJoinConnect}
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
