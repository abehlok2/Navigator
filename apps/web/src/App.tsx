import React, { useRef } from 'react';
import ConnectionStatus from './features/session/ConnectionStatus';
import { connectWithReconnection } from './features/webrtc/connection';
import AssetDropZone from './features/ui/AssetDropZone';
import AssetAvailability from './features/ui/AssetAvailability';
import FacilitatorControls from './features/ui/FacilitatorControls';
import TelemetryDisplay from './features/ui/TelemetryDisplay';
import { useAudioContextUnlock } from './features/audio/context';
import AuthForm from './features/auth/AuthForm';
import { useAuthStore } from './state/auth';

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  useAudioContextUnlock(rootRef);
  const { token, logout, username } = useAuthStore(s => ({
    token: s.token,
    logout: s.logout,
    username: s.username,
  }));

  const handleConnect = () => {
    connectWithReconnection({
      roomId: 'demo',
      participantId: 'p1',
      targetId: 'p2',
      token: token ?? 'token',
      turn: [],
      role: 'facilitator',
      version: '1',
      onTrack: () => {},
    });
  };

  if (!token) {
    return <AuthForm />;
  }

  return (

    <div ref={rootRef} className="container">
      <h1>Explorer Sessions</h1>

    <div ref={rootRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>Explorer Sessions</h1>
        <div>
          {username} <button onClick={logout}>Logout</button>
        </div>
      </div>

      <ConnectionStatus />
      <AssetDropZone />
      <AssetAvailability />
      <FacilitatorControls />
      <TelemetryDisplay />
      <button onClick={handleConnect}>Connect</button>
    </div>
  );
}
