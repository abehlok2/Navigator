import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { createRoom, joinRoom, type Role } from './features/session/api';

const isRole = (value: string | null): value is Role =>
  value === 'facilitator' || value === 'explorer' || value === 'listener';

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
  const [connecting, setConnecting] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRole = useSessionStore(state => state.role);

  const cleanupRemoteAudio = useCallback(() => {
    remoteStreamCleanups.current.forEach(cleanup => cleanup());
    remoteStreamCleanups.current.clear();
    resetRemoteFacilitatorStreams();
  }, []);

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
      setError('Target participant ID is required');
      return;
    }
    setConnecting(true);
    setError(null);
    setParticipantId(null);
    disconnectRef.current?.();
    cleanupRemoteAudio();
    try {
      const join = await joinRoom(roomId, role, token);
      setParticipantId(join.participantId);
      const disconnect = connectWithReconnection({
        roomId,
        participantId: join.participantId,
        targetId,
        token,
        turn: join.turn,
        role,
        version: '1',
        onTrack: handleTrack,
      });
      disconnectRef.current = () => {
        disconnect();
        cleanupRemoteAudio();
      };
    } catch (err) {
      console.error(err);
      setError('Failed to connect to room');
    } finally {
      setConnecting(false);
    }
  }, [cleanupRemoteAudio, handleTrack, roomId, role, targetId, token]);

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
      <AssetDropZone />
      <AssetAvailability />
      {sessionRole === 'facilitator' ? <FacilitatorControls /> : <RecordingControls />}
      <TelemetryDisplay />
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            placeholder="Room ID"
            className="flex-1 rounded border border-gray-300 p-2"
          />
          <Button type="button" onClick={handleCreateRoom} disabled={creatingRoom}>
            {creatingRoom ? 'Creating…' : 'Create Room'}
          </Button>
        </div>
        <input
          type="text"
          value={targetId}
          onChange={e => setTargetId(e.target.value)}
          placeholder="Target participant ID"
          className="rounded border border-gray-300 p-2"
        />
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect'}
          </Button>
          {participantId && <span>Participant ID: {participantId}</span>}
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}
