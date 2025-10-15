import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import AppLayout from '../layouts/AppLayout';
import ExplorerView from '../features/session/views/ExplorerView';
import FacilitatorView from '../features/session/views/FacilitatorView';
import ListenerView from '../features/session/views/ListenerView';
import RoomJoiner from '../features/room/components/RoomJoiner';
import { useAudioContextUnlock } from '../features/audio/context';
import { attachRemoteFacilitatorStream, resetRemoteFacilitatorStreams } from '../features/audio/speech';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  listParticipants,
  removeRoomParticipant,
  setRoomPassword,
  updateParticipantRole,
  type ParticipantSummary,
  type Role,
} from '../features/session/api';
import { connectWithReconnection } from '../features/webrtc/connection';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import {
  GlassCard,
  GlassCardContent,
  GlassCardDescription,
  GlassCardHeader,
  GlassCardTitle,
} from '../components/ui/glass-card';
import AuthForm from '../features/auth/AuthForm';
import { useAuthStore } from '../state/auth';
import { useSessionStore } from '../state/session';
import type { StatusIndicatorStatus } from '../components/ui/status-indicator';

const isRole = (value: string | null): value is Role =>
  value === 'facilitator' || value === 'explorer' || value === 'listener';

const formatRole = (value: Role | null): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown';

type PendingModeration = { id: string; type: 'role' | 'remove' };

type SessionPhase = 'idle' | 'connecting' | 'ready' | 'error';

function LoadingState({ roomId }: { roomId: string }) {
  return (
    <GlassCard variant="elevated" glowColor="blue" className="border-white/10 bg-white/[0.04]">
      <GlassCardHeader className="gap-3 border-white/10 pb-4">
        <GlassCardTitle className="text-2xl text-white">Connecting to session</GlassCardTitle>
        <GlassCardDescription className="text-slate-200/80">
          Establishing a secure link to room {roomId || '—'}. This may take a few seconds while we negotiate media
          channels and telemetry streams.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent className="flex flex-col items-center gap-6 py-10">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <motion.span
            className="absolute h-full w-full rounded-full border-2 border-sky-400/60"
            initial={{ scale: 0.75, opacity: 0.8 }}
            animate={{ scale: 1.2, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            aria-hidden
          />
          <span className="h-12 w-12 animate-spin rounded-full border-2 border-slate-200/70 border-t-transparent" aria-hidden />
        </div>
        <p className="text-sm text-slate-200/80">
          Negotiating transport and waiting for remote acknowledgement…
        </p>
      </GlassCardContent>
    </GlassCard>
  );
}

function ErrorState({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <GlassCard variant="elevated" glowColor="purple" className="border-rose-400/30 bg-rose-500/10">
      <GlassCardHeader className="gap-2 border-rose-400/20 pb-4">
        <GlassCardTitle className="text-2xl text-white">Connection issue</GlassCardTitle>
        <GlassCardDescription className="text-rose-100/80">
          We couldn’t complete the handshake. Double-check the room credentials or try connecting again.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent className="flex flex-col gap-4">
        <p className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100/90">{message}</p>
        <Button type="button" onClick={onReset} variant="secondary" className="self-start bg-white/15 text-white hover:bg-white/25">
          Dismiss and retry
        </Button>
      </GlassCardContent>
    </GlassCard>
  );
}

function IdleState() {
  return (
    <GlassCard variant="elevated" glowColor="blue" className="border-white/10 bg-white/[0.03]">
      <GlassCardHeader className="gap-3 border-white/10 pb-4">
        <GlassCardTitle className="text-2xl text-white">Ready when you are</GlassCardTitle>
        <GlassCardDescription className="text-slate-200/80">
          Use the session access steps in the sidebar to create or join a room. Once connected, we’ll display the
          control surface tailored to your role.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent className="flex flex-col gap-4 text-sm text-slate-200/80">
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          You’ll see live telemetry, asset status, and participant controls as soon as a connection is established.
        </p>
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          Facilitators can moderate participants, explorers can manage capture, and listeners stay in receive-only
          mode—each view activates automatically based on your authenticated role.
        </p>
      </GlassCardContent>
    </GlassCard>
  );
}

export default function SessionPage() {
  const { roomId: routeRoomId } = useParams<{ roomId?: string }>();
  const rootRef = useRef<HTMLDivElement>(null);
  useAudioContextUnlock(rootRef);
  const remoteStreamCleanups = useRef(new Map<string, () => void>());
  const disconnectRef = useRef<(() => void) | null>(null);

  const { token, logout, username, role: authRole } = useAuthStore(state => ({
    token: state.token,
    logout: state.logout,
    username: state.username,
    role: state.role,
  }));

  const { role: sessionRole, connection } = useSessionStore(state => ({
    role: state.role,
    connection: state.connection,
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
  const [pendingModeration, setPendingModeration] = useState<PendingModeration | null>(null);
  const [roomPassword, setRoomPasswordInput] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);

  const resetError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (typeof routeRoomId === 'string') {
      setRoomId(routeRoomId);
    }
  }, [routeRoomId]);

  useEffect(() => {
    if (!token) {
      setParticipants([]);
      setTargetId('');
      setParticipantId(null);
    }
  }, [token]);

  const effectiveRole = useMemo<Role | null>(() => {
    if (sessionRole) return sessionRole;
    return isRole(authRole) ? authRole : null;
  }, [authRole, sessionRole]);

  const isFacilitatorSession = effectiveRole === 'facilitator';
  const isExplorerSession = effectiveRole === 'explorer';
  const isListenerSession = effectiveRole === 'listener';
  const canCreateRoom = isFacilitatorSession;
  const canModerateParticipants = isFacilitatorSession;

  const availableTargets = useMemo(() => {
    const others = participants.filter(p => p.id !== participantId);
    if (!effectiveRole) return others;
    switch (effectiveRole) {
      case 'listener':
        return others.filter(p => p.role === 'facilitator');
      case 'explorer':
        return others.filter(p => p.role === 'facilitator');
      case 'facilitator':
        return others.filter(p => p.role !== 'facilitator');
      default:
        return others;
    }
  }, [effectiveRole, participantId, participants]);

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
      setError('Authentication token is missing');
      return;
    }
    if (!roomId) {
      setError('Room ID is required to update the password');
      return;
    }
    setSettingPassword(true);
    setError(null);
    try {
      const nextPassword = roomPassword === '' ? undefined : roomPassword;
      await setRoomPassword(roomId, token, nextPassword);
      setRoomPasswordInput('');
    } catch (err) {
      console.error(err);
      setError('Failed to update room password');
    } finally {
      setSettingPassword(false);
    }
  }, [roomId, roomPassword, token]);

  const cleanupRemoteAudio = useCallback(() => {
    remoteStreamCleanups.current.forEach(cleanup => cleanup());
    remoteStreamCleanups.current.clear();
    resetRemoteFacilitatorStreams();
  }, []);

  const handleTrack = useCallback((event: RTCTrackEvent) => {
    if (event.track.kind !== 'audio') return;
    const streams = event.streams.length ? event.streams : [new MediaStream([event.track])];
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
  }, []);

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
    if (!isRole(authRole)) {
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
      const join = await joinRoom(roomId, authRole, token, joinPassword || undefined);
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
        role: authRole,
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
  }, [authRole, cleanupRemoteAudio, handleTrack, joinPassword, participants, roomId, targetId, token]);

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
    [availableTargets],
  );

  const handleParticipantRoleChange = useCallback(
    async (id: string, nextRole: Role) => {
      if (!token) {
        setError('Authentication token is missing');
        return;
      }
      if (!roomId) {
        setError('Room ID is required to manage participants');
        return;
      }
      setPendingModeration({ id, type: 'role' });
      setError(null);
      try {
        await updateParticipantRole(roomId, id, nextRole, token);
        setParticipants(prev => prev.map(p => (p.id === id ? { ...p, role: nextRole } : p)));
      } catch (err) {
        console.error(err);
        setError('Failed to update participant role');
      } finally {
        setPendingModeration(null);
      }
    },
    [roomId, token],
  );

  const handleRemoveParticipant = useCallback(
    async (id: string) => {
      if (!token) {
        setError('Authentication token is missing');
        return;
      }
      if (!roomId) {
        setError('Room ID is required to manage participants');
        return;
      }
      setPendingModeration({ id, type: 'remove' });
      setError(null);
      try {
        await removeRoomParticipant(roomId, id, token);
        setParticipants(prev => prev.filter(p => p.id !== id));
        if (targetId === id) {
          setTargetId('');
          disconnectRef.current?.();
          cleanupRemoteAudio();
          setParticipantId(null);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to remove participant');
      } finally {
        setPendingModeration(null);
      }
    },
    [cleanupRemoteAudio, roomId, targetId, token],
  );

  if (!token) {
    return <AuthForm />;
  }

  const connectionPhase: SessionPhase = error
    ? 'error'
    : connecting || connection === 'connecting'
      ? 'connecting'
      : connection === 'connected' && participantId
        ? 'ready'
        : 'idle';

  const indicatorStatus: StatusIndicatorStatus = error
    ? 'error'
    : connection === 'connected'
      ? 'connected'
      : connection === 'connecting' || connecting
        ? 'connecting'
        : 'disconnected';

  const indicatorLabel = error
    ? 'Connection error'
    : connection === 'connected'
      ? 'Live session'
      : connection === 'connecting' || connecting
        ? 'Negotiating link'
        : 'Idle';

  const handleLogout = useCallback(async () => {
    disconnectRef.current?.();
    cleanupRemoteAudio();
    await logout();
  }, [cleanupRemoteAudio, logout]);

  let mainContent: React.ReactNode;
  let contentKey = 'idle';

  if (connectionPhase === 'error' && error) {
    mainContent = <ErrorState message={error} onReset={resetError} />;
    contentKey = 'error';
  } else if (connectionPhase === 'connecting') {
    mainContent = <LoadingState roomId={roomId} />;
    contentKey = 'connecting';
  } else if (connectionPhase === 'ready' && sessionRole) {
    contentKey = `role-${sessionRole}`;
    if (sessionRole === 'facilitator') {
      mainContent = (
        <FacilitatorView
          participants={participants}
          currentParticipantId={participantId ?? undefined}
          selectedParticipantId={targetId || undefined}
          selectableParticipantIds={availableTargets.map(participant => participant.id)}
          onSelectParticipant={handleParticipantCardSelect}
          canModerate={canModerateParticipants}
          onChangeRole={handleParticipantRoleChange}
          onRemoveParticipant={handleRemoveParticipant}
          pendingModeration={pendingModeration}
        />
      );
    } else if (sessionRole === 'explorer') {
      mainContent = <ExplorerView />;
    } else if (sessionRole === 'listener') {
      mainContent = (
        <ListenerView
          participants={participants}
          participantId={participantId}
          facilitatorId={targetId || null}
          username={username}
        />
      );
    }
  } else {
    mainContent = <IdleState />;
    contentKey = 'idle';
  }

  return (
    <div ref={rootRef} className="min-h-screen bg-slate-950">
      <AppLayout
        user={{ name: username ?? 'Navigator Operator', role: formatRole(effectiveRole) }}
        connection={{ indicatorStatus, label: indicatorLabel, ariaLabel: indicatorLabel }}
        title="Navigator Session"
        subtitle="Real-time mission orchestration"
        sidebar={
          <div className="flex flex-col gap-6">
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
              role={effectiveRole}
            />
            {canModerateParticipants ? (
              <GlassCard variant="default" className="border-white/10 bg-white/5">
                <GlassCardHeader className="border-white/10 pb-4">
                  <GlassCardTitle className="text-lg text-white">Room password</GlassCardTitle>
                  <GlassCardDescription className="text-slate-200/80">
                    Update or clear the shared password for this room.
                  </GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={roomPassword}
                    onChange={event => setRoomPasswordInput(event.target.value)}
                    placeholder="Set or clear the room password"
                    disabled={settingPassword}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-300/70 focus:border-sky-400/60 focus:outline-none"
                  />
                  <Button
                    type="button"
                    onClick={handleSetRoomPassword}
                    disabled={settingPassword || !roomId}
                    className="h-10 bg-sky-600 text-sm font-semibold text-white hover:bg-sky-500 disabled:bg-slate-500/60"
                  >
                    {settingPassword ? 'Saving…' : 'Save password'}
                  </Button>
                </GlassCardContent>
              </GlassCard>
            ) : null}
          </div>
        }
        onLogout={() => {
          void handleLogout();
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={contentKey}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-6"
          >
            {mainContent}
          </motion.div>
        </AnimatePresence>
      </AppLayout>
    </div>
  );
}
