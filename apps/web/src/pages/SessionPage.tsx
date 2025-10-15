import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { connectWithReconnection } from '../features/webrtc/connection';
import { useAudioContextUnlock } from '../features/audio/context';
import { attachRemoteFacilitatorStream, resetRemoteFacilitatorStreams } from '../features/audio/speech';
import AuthForm from '../features/auth/AuthForm';
import { useAuthStore } from '../state/auth';
import { useSessionStore, type ConnectionStatus as SessionConnectionStatus } from '../state/session';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  listParticipants,
  setRoomPassword,
  updateParticipantRole,
  removeRoomParticipant,
  type ParticipantSummary,
  type Role,
} from '../features/session/api';
import ExplorerView from '../features/session/views/ExplorerView';
import FacilitatorView from '../features/session/views/FacilitatorView';
import ListenerView from '../features/session/views/ListenerView';
import RoomJoiner from '../features/room/components/RoomJoiner';

const isRole = (value: string | null): value is Role =>
  value === 'facilitator' || value === 'explorer' || value === 'listener';

const formatRole = (value: Role): string => value.charAt(0).toUpperCase() + value.slice(1);

type ModerationNotice = { type: 'success' | 'error'; message: string };
type PendingModeration = { id: string; type: 'role' | 'remove' };

const CONNECTION_STATUS_META: Record<
  SessionConnectionStatus,
  { label: string; badgeClass: string; description: string }
> = {
  connected: {
    label: 'Connected',
    badgeClass: 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
    description: 'Live session link established.',
  },
  connecting: {
    label: 'Connecting…',
    badgeClass: 'border border-amber-400/40 bg-amber-500/15 text-amber-200',
    description: 'Attempting to establish the session link.',
  },
  disconnected: {
    label: 'Disconnected',
    badgeClass: 'border border-rose-400/40 bg-rose-500/15 text-rose-200',
    description: 'No active transport yet.',
  },
};

const ChevronDownIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    {...props}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 8.5 10 12.5 14 8.5" />
  </svg>
);

export default function SessionPage() {
  const { roomId: routeRoomId } = useParams<{ roomId?: string }>();
  const rootRef = useRef<HTMLDivElement>(null);
  useAudioContextUnlock(rootRef);
  const remoteStreamCleanups = useRef(new Map<string, () => void>());
  const disconnectRef = useRef<(() => void) | null>(null);
  const { token, logout, username, role } = useAuthStore(s => ({
    token: s.token,
    logout: s.logout,
    username: s.username,
    role: s.role,
  }));
  const [roomId, setRoomId] = useState(routeRoomId ?? '');
  const [targetId, setTargetId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resetError = useCallback(() => setError(null), []);
  const [roomPassword, setRoomPasswordInput] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);
  const [moderationNotice, setModerationNotice] = useState<ModerationNotice | null>(null);
  const [pendingModeration, setPendingModeration] = useState<PendingModeration | null>(null);
  const { role: sessionRole, connection: sessionConnection } = useSessionStore(state => ({
    role: state.role,
    connection: state.connection,
  }));
  const isListenerSession = sessionRole === 'listener';
  const isFacilitatorSession = sessionRole === 'facilitator';
  const isExplorerSession = sessionRole === 'explorer';
  const canCreateRoom = role === 'facilitator';
  const canModerateParticipants = role === 'facilitator';
  const sessionRoleLabel = sessionRole ? formatRole(sessionRole) : 'No active role';
  const connectionInfo = CONNECTION_STATUS_META[sessionConnection];

  const viewMeta = useMemo(() => {
    if (isFacilitatorSession) {
      return {
        title: 'Facilitator command center',
        description: 'Direct the mission flow, balance the mix, and keep the explorer supplied with every cue.',
      };
    }
    if (isExplorerSession) {
      return {
        title: 'Explorer field console',
        description: 'Capture and monitor the mission feed while tracking asset readiness in real time.',
      };
    }
    if (isListenerSession) {
      return {
        title: 'Listener monitoring',
        description: 'Stay aligned with the facilitator mix and keep an eye on live transport status.',
      };
    }
    return {
      title: 'Explorer Sessions',
      description: 'Coordinate real-time exploration audio, manage manifests, and stay ahead of connection issues.',
    };
  }, [isFacilitatorSession, isExplorerSession, isListenerSession]);

  const availableTargets = useMemo(() => {
    const others = participants.filter(p => p.id !== participantId);
    if (!role) return others;
    switch (role) {
      case 'listener':
        return others.filter(p => p.role === 'facilitator');
      case 'explorer':
        return others.filter(p => p.role === 'facilitator');
      case 'facilitator':
        return others.filter(p => p.role !== 'facilitator');
      default:
        return others;
    }
  }, [participants, participantId, role]);

  useEffect(() => {
    if (typeof routeRoomId === 'string') {
      setRoomId(routeRoomId);
    }
  }, [routeRoomId]);

  useEffect(() => {
    if (!availableTargets.length) {
      if (targetId) setTargetId('');
      return;
    }
    if (!availableTargets.some(p => p.id === targetId)) {
      setTargetId(availableTargets[0].id);
    }
  }, [availableTargets, targetId]);

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
      setModerationNotice({ type: 'error', message: 'Authentication token is missing' });
      return;
    }
    if (!roomId) {
      setModerationNotice({ type: 'error', message: 'Room ID is required to update the password' });
      return;
    }
    setSettingPassword(true);
    setModerationNotice(null);
    try {
      const nextPassword = roomPassword === '' ? undefined : roomPassword;
      await setRoomPassword(roomId, token, nextPassword);
      setRoomPasswordInput('');
      setModerationNotice({
        type: 'success',
        message: nextPassword ? 'Room password updated' : 'Room password cleared',
      });
    } catch (err) {
      console.error(err);
      setModerationNotice({ type: 'error', message: 'Failed to update room password' });
    } finally {
      setSettingPassword(false);
    }
  }, [roomId, roomPassword, token]);

  useEffect(() => {
    if (!token) {
      setParticipants([]);
      setTargetId('');
      setParticipantId(null);
    }
  }, [token]);

  const cleanupRemoteAudio = useCallback(() => {
    remoteStreamCleanups.current.forEach(cleanup => cleanup());
    remoteStreamCleanups.current.clear();
    resetRemoteFacilitatorStreams();
  }, []);

  const handleParticipantRoleChange = useCallback(
    async (id: string, nextRole: Role) => {
      if (!token) {
        setModerationNotice({ type: 'error', message: 'Authentication token is missing' });
        return;
      }
      if (!roomId) {
        setModerationNotice({ type: 'error', message: 'Room ID is required to manage participants' });
        return;
      }
      setPendingModeration({ id, type: 'role' });
      setModerationNotice(null);
      try {
        await updateParticipantRole(roomId, id, nextRole, token);
        setParticipants(prev => prev.map(p => (p.id === id ? { ...p, role: nextRole } : p)));
        setModerationNotice({ type: 'success', message: 'Participant role updated' });
      } catch (err) {
        console.error(err);
        setModerationNotice({ type: 'error', message: 'Failed to update participant role' });
      } finally {
        setPendingModeration(null);
      }
    },
    [roomId, token]
  );

  const handleRemoveParticipant = useCallback(
    async (id: string) => {
      if (!token) {
        setModerationNotice({ type: 'error', message: 'Authentication token is missing' });
        return;
      }
      if (!roomId) {
        setModerationNotice({ type: 'error', message: 'Room ID is required to manage participants' });
        return;
      }
      setPendingModeration({ id, type: 'remove' });
      setModerationNotice(null);
      try {
        await removeRoomParticipant(roomId, id, token);
        setParticipants(prev => prev.filter(p => p.id !== id));
        if (targetId === id) {
          setTargetId('');
          disconnectRef.current?.();
          cleanupRemoteAudio();
          setParticipantId(null);
        }
        setModerationNotice({ type: 'success', message: 'Participant removed from room' });
      } catch (err) {
        console.error(err);
        setModerationNotice({ type: 'error', message: 'Failed to remove participant' });
      } finally {
        setPendingModeration(null);
      }
    },
    [cleanupRemoteAudio, roomId, targetId, token]
  );

  const handleTrack = useCallback(
    (event: RTCTrackEvent) => {
      if (event.track.kind !== 'audio') return;
      const streams = event.streams.length
        ? event.streams
        : [new MediaStream([event.track])];
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
    },
    []
  );

  const handleCreateRoom = useCallback(async () => {
    if (!token) return;
    setCreatingRoom(true);
    setError(null);
    try {
      const id = await createRoom(token);
      setRoomId(id);
    } catch (err) {
      console.error(err);
      setError('Failed to create room');
    } finally {
      setCreatingRoom(false);
    }
  }, [token]);

  const handleConnect = useCallback(async () => {
    if (!token) {
      setError('Authentication token is missing');
      return;
    }
    if (!isRole(role)) {
      setError('User role is unavailable');
      return;
    }
    if (!roomId) {
      setError('Room ID is required');
      return;
    }
    if (!targetId) {
      setError('Select a participant to connect to');
      return;
    }
    const selectedTarget = participants.find(p => p.id === targetId);
    if (!selectedTarget) {
      setError('Target participant is not available');
      return;
    }
    setConnecting(true);
    setError(null);
    setParticipantId(null);
    const previousDisconnect = disconnectRef.current;
    disconnectRef.current = null;
    previousDisconnect?.();
    cleanupRemoteAudio();
    let joinedParticipantId: string | null = null;
    let hasLeft = false;
    const leaveIfNeeded = () => {
      if (hasLeft || !joinedParticipantId) {
        return;
      }
      hasLeft = true;
      void leaveRoom(roomId, joinedParticipantId, token).catch(() => {});
    };
    try {
      const join = await joinRoom(roomId, role, token, joinPassword || undefined);
      const remoteList = join.participants;
      setParticipants(remoteList);
      const resolvedTarget = remoteList.find(p => p.id === selectedTarget.id);
      if (!resolvedTarget || resolvedTarget.id === join.participantId) {
        joinedParticipantId = join.participantId;
        leaveIfNeeded();
        throw new Error('target-unavailable');
      }
      joinedParticipantId = join.participantId;
      setParticipantId(join.participantId);
      const disconnect = connectWithReconnection({
        roomId,
        participantId: join.participantId,
        targetId: resolvedTarget.id,
        token,
        turn: join.turn,
        role,
        targetRole: resolvedTarget.role,
        version: '1',
        onTrack: handleTrack,
      });
      let disconnected = false;
      disconnectRef.current = () => {
        if (disconnected) return;
        disconnected = true;
        disconnect();
        cleanupRemoteAudio();
        setParticipantId(null);
        useSessionStore.getState().resetRemotePresence();
        leaveIfNeeded();
        disconnectRef.current = null;
      };
    } catch (err) {
      console.error(err);
      leaveIfNeeded();
      if (err instanceof Error && err.message === 'target-unavailable') {
        setError('Selected participant is no longer available');
      } else {
        setError('Failed to connect to room');
      }
    } finally {
      setConnecting(false);
    }
  }, [
    cleanupRemoteAudio,
    handleTrack,
    joinPassword,
    participants,
    roomId,
    role,
    targetId,
    token,
  ]);

  useEffect(() => {
    return () => {
      disconnectRef.current?.();
      cleanupRemoteAudio();
    };
  }, [cleanupRemoteAudio]);

  const handleParticipantCardSelect = useCallback(
    (id: string) => {
      if (!availableTargets.some(target => target.id === id)) {
        return;
      }
      setTargetId(id);
    },
    [availableTargets]
  );

  const selectableParticipantIds = useMemo(
    () => availableTargets.map(participant => participant.id),
    [availableTargets]
  );

  const roleViewContent = useMemo(() => {
    if (isFacilitatorSession) {
      return (
        <FacilitatorView
          participants={participants}
          currentParticipantId={participantId}
          selectedParticipantId={targetId || null}
          selectableParticipantIds={selectableParticipantIds}
          onSelectParticipant={handleParticipantCardSelect}
          canModerate={canModerateParticipants}
          onChangeRole={handleParticipantRoleChange}
          onRemoveParticipant={handleRemoveParticipant}
          pendingModeration={pendingModeration}
        />
      );
    }
    if (isExplorerSession) {
      return <ExplorerView />;
    }
    if (isListenerSession) {
      return (
        <ListenerView
          participants={participants}
          participantId={participantId}
          facilitatorId={targetId || null}
          username={username}
        />
      );
    }
    return (
      <Card className="shadow-lg shadow-slate-200/60">
        <CardHeader className="border-none pb-0">
          <CardTitle>Waiting for session</CardTitle>
          <CardDescription>Join a room to activate the appropriate session workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-sm text-slate-600">
          <p>Use the controls on the right to join a room and select a target participant.</p>
          <p>Once connected your session role will determine which workspace loads here automatically.</p>
        </CardContent>
      </Card>
    );
  }, [
    canModerateParticipants,
    handleParticipantCardSelect,
    handleParticipantRoleChange,
    handleRemoveParticipant,
    isExplorerSession,
    isFacilitatorSession,
    isListenerSession,
    participantId,
    participants,
    pendingModeration,
    selectableParticipantIds,
    targetId,
    username,
  ]);

  if (!token) {
    return <AuthForm />;
  }

  return (
    <div ref={rootRef} className="relative min-h-screen overflow-hidden bg-slate-100 text-slate-900">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[280px] bg-gradient-to-t from-white to-transparent" />
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 lg:px-12">
        <header className="rounded-3xl border border-slate-200/80 bg-white/85 p-8 shadow-xl shadow-sky-100/60 backdrop-blur">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-slate-500">
                  <Badge variant="info" className="tracking-[0.3em] text-[10px]">Session Console</Badge>
                  <span className="text-xs font-medium uppercase tracking-[0.35em] text-slate-400">Navigator Control Surface</span>
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">{viewMeta.title}</h1>
                  <p className="max-w-2xl text-base leading-relaxed text-slate-600">{viewMeta.description}</p>
                </div>
              </div>
              <div className="flex w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:w-auto sm:min-w-[260px]">
                <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                  <span className="font-medium text-slate-900">{username}</span>
                  {role && isRole(role) && <Badge variant="muted">{formatRole(role)}</Badge>}
                </div>
                <div className="flex flex-col gap-2 text-xs text-slate-500">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                      Session role • {sessionRoleLabel}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${connectionInfo.badgeClass}`}
                    >
                      {connectionInfo.label}
                    </span>
                  </div>
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{connectionInfo.description}</p>
                </div>
                <Button
                  onClick={logout}
                  className="h-10 w-full bg-slate-900 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Logout
                </Button>
              </div>
            </div>
            {!sessionRole && (
              <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/80 p-4 text-sm text-slate-600">
                Connect to a room to activate a workspace tailored to your mission role.
              </div>
            )}
          </div>
        </header>
        <div className="grid flex-1 gap-8 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
          <section className="space-y-8">
            {roleViewContent}
          </section>
          <aside className="space-y-8">
            <RoomJoiner
              roomId={roomId}
              onRoomIdChange={setRoomId}
              canCreateRoom={canCreateRoom}
              creatingRoom={creatingRoom}
              onCreateRoom={handleCreateRoom}
              joinPassword={joinPassword}
              onJoinPasswordChange={setJoinPassword}
              participants={participants}
              availableTargets={availableTargets}
              loadingParticipants={loadingParticipants}
              onRefreshParticipants={loadParticipants}
              targetId={targetId}
              onTargetChange={setTargetId}
              onConnect={handleConnect}
              connecting={connecting}
              participantId={participantId}
              error={error}
              onResetError={resetError}
              role={isRole(role) ? role : null}
            />
            {canModerateParticipants && (
              <Card className="space-y-0 shadow-lg shadow-slate-200/60">
                <CardHeader className="border-none pb-0">
                  <CardTitle>Room access</CardTitle>
                  <CardDescription>Update credentials and review session-wide moderation notices.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-0">
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="space-y-2">
                      <Label htmlFor="room-password" className="text-sm font-semibold text-slate-600">
                        Room password
                      </Label>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Input
                          id="room-password"
                          type="text"
                          value={roomPassword}
                          onChange={e => setRoomPasswordInput(e.target.value)}
                          placeholder="Set or clear the room password"
                          disabled={settingPassword}
                        />
                        <Button
                          type="button"
                          onClick={handleSetRoomPassword}
                          disabled={settingPassword || !roomId}
                          className="h-10 bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-sky-400/60"
                        >
                          {settingPassword ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500">Leave the field blank and save to remove the password.</p>
                    </div>
                    {moderationNotice && (
                      <div
                        className={
                          moderationNotice.type === 'error'
                            ? 'rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700'
                            : 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700'
                        }
                      >
                        {moderationNotice.message}
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-dashed border-slate-300/70 bg-slate-50/70 p-4 text-xs text-slate-600">
                    Manage participant roles and actions directly from the facilitator workspace once connected.
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
