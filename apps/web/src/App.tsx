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
      const join = await joinRoom(roomId, role, token);
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
    <div ref={rootRef} className="container">
      <div className="mb-4 flex justify-between">
        <h1>Explorer Sessions</h1>
        <div className="flex items-center gap-2">
          {username} <Button onClick={logout}>Logout</Button>
        </div>
      </div>

      <ConnectionStatus />
      {!isListenerSession && (
        <>
          <AssetDropZone />
          <AssetAvailability />
        </>
      )}
      {isFacilitatorSession && <FacilitatorControls />}
      {isExplorerSession && <RecordingControls />}
      {isListenerSession && <ListenerPanel />}
      {!isListenerSession && <TelemetryDisplay />}
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            placeholder="Room ID"
            className="flex-1 rounded border border-gray-300 p-2"
          />
          <Button
            type="button"
            onClick={handleCreateRoom}
            disabled={creatingRoom || !canCreateRoom}
            title={canCreateRoom ? undefined : 'Only facilitators can create rooms'}
          >
            {creatingRoom ? 'Creating…' : 'Create Room'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={targetId}
            onChange={e => setTargetId(e.target.value)}
            className="flex-1 min-w-[200px] rounded border border-gray-300 p-2"
            disabled={availableTargets.length === 0}
          >
            <option value="">Select participant…</option>
            {availableTargets.map(participant => (
              <option key={participant.id} value={participant.id}>
                {`${formatRole(participant.role)} — ${participant.id}`}
              </option>
            ))}
          </select>
          <Button
            type="button"
            onClick={loadParticipants}
            disabled={loadingParticipants || !roomId}
          >
            {loadingParticipants ? 'Loading…' : 'Refresh Participants'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handleConnect} disabled={connecting || !targetId}>
            {connecting ? 'Connecting…' : 'Connect'}
          </Button>
          {participantId && <span>Participant ID: {participantId}</span>}
        </div>
        {(participants.length > 0 || canModerateParticipants) && (
          <div className="rounded border border-gray-200 p-3 text-xs text-gray-600 sm:text-sm">
            <div className="text-sm font-medium text-gray-800">Participants</div>
            {canModerateParticipants && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="password"
                    value={roomPassword}
                    onChange={e => setRoomPasswordInput(e.target.value)}
                    placeholder="Set room password"
                    className="flex-1 rounded border border-gray-300 p-2"
                    disabled={settingPassword}
                  />
                  <Button
                    type="button"
                    onClick={handleSetRoomPassword}
                    disabled={settingPassword || !roomId}
                    className="px-3 py-2"
                  >
                    {settingPassword ? 'Saving…' : 'Save Password'}
                  </Button>
                </div>
                <div className="text-[11px] text-gray-500">Leave blank to clear the room password.</div>
              </div>
            )}
            {canModerateParticipants && moderationNotice && (
              <div
                className={`mt-2 text-sm ${
                  moderationNotice.type === 'error' ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {moderationNotice.message}
              </div>
            )}
            {participants.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {participants.map(participant => {
                  const isSelfParticipant = participantId === participant.id;
                  const isPending = pendingModeration?.id === participant.id;
                  const isRemoving = isPending && pendingModeration?.type === 'remove';
                  const isUpdatingRole = isPending && pendingModeration?.type === 'role';
                  return (
                    <li key={participant.id} className="rounded border border-gray-100 p-2">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium capitalize">{participant.role}</span>
                          <span className="font-mono text-[11px] text-gray-500">{participant.id}</span>
                          {isSelfParticipant && (
                            <span className="text-[10px] font-semibold uppercase text-blue-600">You</span>
                          )}
                        </div>
                        <span className={participant.connected ? 'text-green-600' : 'text-gray-500'}>
                          {participant.connected ? 'connected' : 'offline'}
                        </span>
                      </div>
                      {canModerateParticipants && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-2 text-xs text-gray-600 sm:text-sm">
                            <span>Role</span>
                            <select
                              value={participant.role}
                              onChange={e => {
                                const nextRole = e.target.value as Role;
                                if (nextRole !== participant.role && !isSelfParticipant) {
                                  handleParticipantRoleChange(participant.id, nextRole);
                                }
                              }}
                              className="rounded border border-gray-300 p-1 text-xs sm:text-sm"
                              disabled={isPending || isSelfParticipant}
                            >
                              {ROLE_OPTIONS.map(option => (
                                <option key={option} value={option}>
                                  {formatRole(option)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveParticipant(participant.id)}
                            className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            disabled={isPending || isSelfParticipant}
                          >
                            {isRemoving ? 'Removing…' : 'Remove'}
                          </button>
                          {isUpdatingRole && (
                            <span className="text-[11px] text-gray-500">Updating role…</span>
                          )}
                          {isSelfParticipant && (
                            <span className="text-[11px] text-gray-500">You cannot modify your own entry.</span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-3 text-xs text-gray-500">No participants in this room yet.</div>
            )}
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}
