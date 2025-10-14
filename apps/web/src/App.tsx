import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConnectionStatus from './features/session/ConnectionStatus';
import { connectWithReconnection } from './features/webrtc/connection';
import AssetDropZone from './features/ui/AssetDropZone';
import AssetAvailability from './features/ui/AssetAvailability';
import FacilitatorControls from './features/ui/FacilitatorControls';
import RecordingControls from './features/ui/RecordingControls';
import TelemetryDisplay from './features/ui/TelemetryDisplay';
import { useAudioContextUnlock } from './features/audio/context';
import { attachRemoteFacilitatorStream, resetRemoteFacilitatorStreams } from './features/audio/speech';
import AuthForm from './features/auth/AuthForm';
import { useAuthStore } from './state/auth';
import { useSessionStore } from './state/session';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select } from './components/ui/select';
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
} from './features/session/api';
import ListenerPanel from './features/ui/ListenerPanel';

const isRole = (value: string | null): value is Role =>
  value === 'facilitator' || value === 'explorer' || value === 'listener';

const formatRole = (value: Role): string => value.charAt(0).toUpperCase() + value.slice(1);

const ROLE_OPTIONS: Role[] = ['facilitator', 'explorer', 'listener'];
type ModerationNotice = { type: 'success' | 'error'; message: string };
type PendingModeration = { id: string; type: 'role' | 'remove' };

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

export default function App() {
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
  const [roomId, setRoomId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomPassword, setRoomPasswordInput] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);
  const [moderationNotice, setModerationNotice] = useState<ModerationNotice | null>(null);
  const [pendingModeration, setPendingModeration] = useState<PendingModeration | null>(null);
  const sessionRole = useSessionStore(state => state.role);
  const isListenerSession = sessionRole === 'listener';
  const isFacilitatorSession = sessionRole === 'facilitator';
  const isExplorerSession = sessionRole === 'explorer';
  const canCreateRoom = role === 'facilitator';
  const canModerateParticipants = role === 'facilitator';

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

  if (!token) {
    return <AuthForm />;
  }

  return (
    <div ref={rootRef} className="relative min-h-screen overflow-hidden bg-slate-100 text-slate-900">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[280px] bg-gradient-to-t from-white to-transparent" />
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 lg:px-12">
        <header className="rounded-3xl border border-slate-200/80 bg-white/80 p-8 shadow-xl shadow-sky-100/60 backdrop-blur">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-slate-500">
                  <Badge variant="info" className="tracking-[0.3em] text-[10px]">Explorer Ops</Badge>
                  <span className="text-xs font-medium uppercase tracking-[0.35em] text-slate-400">Navigator Control Surface</span>
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">Explorer Sessions</h1>
                  <p className="max-w-2xl text-base leading-relaxed text-slate-600">
                    Coordinate real-time exploration audio, manage manifests, and stay ahead of connection issues.
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:w-auto sm:min-w-[240px]">
                <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                  <span className="font-medium text-slate-900">{username}</span>
                  {role && isRole(role) && <Badge variant="muted">{formatRole(role)}</Badge>}
                </div>
                <Button
                  onClick={logout}
                  className="h-10 w-full bg-slate-900 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Logout
                </Button>
              </div>
            </div>
            <ConnectionStatus />
          </div>
        </header>
        <main className="grid flex-1 gap-8 xl:grid-cols-[1.75fr_1fr]">
          <section className="space-y-8">
            {!isListenerSession && (
              <Card className="shadow-lg shadow-slate-200/60">
                <CardHeader className="border-none pb-0">
                  <CardTitle>Asset preparation</CardTitle>
                  <CardDescription>
                    Drop facilitator audio files and confirm that the explorer has every asset required for the session.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-0">
                  <AssetDropZone />
                  <AssetAvailability />
                </CardContent>
              </Card>
            )}
            {isFacilitatorSession && <FacilitatorControls />}
            {isExplorerSession && <RecordingControls />}
            {isListenerSession && <ListenerPanel />}
            {!isListenerSession && <TelemetryDisplay />}
          </section>
          <section className="space-y-8">
            <Card className="sticky top-8 shadow-lg shadow-slate-200/60">
              <CardHeader className="border-none pb-0">
                <CardTitle>Room access</CardTitle>
                <CardDescription>
                  Create rooms, join with a password, and connect to the right participant before streaming audio.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-0">
                <div className="space-y-2">
                  <Label htmlFor="room-id">Room ID</Label>
                  <Input
                    id="room-id"
                    type="text"
                    value={roomId}
                    onChange={e => setRoomId(e.target.value)}
                    placeholder="Enter or paste a room identifier"
                  />
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <Button
                      type="button"
                      onClick={handleCreateRoom}
                      disabled={creatingRoom || !canCreateRoom}
                      title={canCreateRoom ? undefined : 'Only facilitators can create rooms'}
                      className="h-10 bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-sky-400/60"
                    >
                      {creatingRoom ? 'Creating…' : 'Create Room'}
                    </Button>
                    {!canCreateRoom && <span>Only facilitators can create new rooms.</span>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-password">Join password</Label>
                  <Input
                    id="join-password"
                    type="password"
                    value={joinPassword}
                    onChange={e => setJoinPassword(e.target.value)}
                    placeholder="Optional room password"
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-id">Connect to</Label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative w-full">
                      <Select
                        id="target-id"
                        value={targetId}
                        onChange={e => setTargetId(e.target.value)}
                        disabled={availableTargets.length === 0}
                      >
                        <option value="">Select participant…</option>
                        {availableTargets.map(participant => (
                          <option key={participant.id} value={participant.id}>
                            {`${formatRole(participant.role)} — ${participant.id}`}
                          </option>
                        ))}
                      </Select>
                      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                    <Button
                      type="button"
                      onClick={loadParticipants}
                      disabled={loadingParticipants || !roomId}
                      className="h-10 bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400/70"
                    >
                      {loadingParticipants ? 'Loading…' : 'Refresh'}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Participants appear once they have joined the room. Facilitators can connect to any explorer or listener.
                  </p>
                </div>
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                  <Button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting || !targetId}
                    className="h-11 w-full justify-center bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-emerald-300/70"
                  >
                    {connecting ? 'Connecting…' : 'Connect'}
                  </Button>
                  <div className="flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      {participantId ? `Participant ID: ${participantId}` : 'No active participant connection yet.'}
                    </span>
                    {error && <span className="font-medium text-rose-600">{error}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
            {(participants.length > 0 || canModerateParticipants) && (
              <Card className="space-y-0 shadow-lg shadow-slate-200/60">
                <CardHeader className="border-none pb-0">
                  <CardTitle>Participants</CardTitle>
                  <CardDescription>Review the room roster and update roles or access in real time.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-0">
                  {canModerateParticipants && (
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
                  )}
                  {participants.length > 0 ? (
                    <ul className="space-y-4">
                      {participants.map(participant => {
                        const isSelfParticipant = participantId === participant.id;
                        const isPending = pendingModeration?.id === participant.id;
                        const isRemoving = isPending && pendingModeration?.type === 'remove';
                        const isUpdatingRole = isPending && pendingModeration?.type === 'role';
                        const selectId = `participant-${participant.id}-role`;
                        return (
                          <li
                            key={participant.id}
                            className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                                <Badge variant="info">{formatRole(participant.role)}</Badge>
                                <span className="font-mono text-xs text-slate-500">{participant.id}</span>
                                {isSelfParticipant && <Badge variant="muted">You</Badge>}
                              </div>
                              <Badge variant={participant.connected ? 'success' : 'muted'}>
                                {participant.connected ? 'Connected' : 'Offline'}
                              </Badge>
                            </div>
                            {canModerateParticipants && (
                              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                  <Label htmlFor={selectId}>Role</Label>
                                  <div className="relative w-full sm:w-[200px]">
                                    <Select
                                      id={selectId}
                                      value={participant.role}
                                      onChange={e => {
                                        const nextRole = e.target.value as Role;
                                        if (nextRole !== participant.role && !isSelfParticipant) {
                                          handleParticipantRoleChange(participant.id, nextRole);
                                        }
                                      }}
                                      disabled={isPending || isSelfParticipant}
                                    >
                                      {ROLE_OPTIONS.map(option => (
                                        <option key={option} value={option}>
                                          {formatRole(option)}
                                        </option>
                                      ))}
                                    </Select>
                                    <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                  <Button
                                    type="button"
                                    onClick={() => handleRemoveParticipant(participant.id)}
                                    disabled={isPending || isSelfParticipant}
                                    className="h-9 bg-rose-500 px-3 text-xs font-semibold text-white hover:bg-rose-600 disabled:bg-rose-300/70"
                                  >
                                    {isRemoving ? 'Removing…' : 'Remove'}
                                  </Button>
                                  {isUpdatingRole && <span className="text-xs text-slate-500">Updating role…</span>}
                                  {isSelfParticipant && (
                                    <span className="text-xs text-slate-500">You cannot modify your own entry.</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-500">
                      No participants in this room yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
