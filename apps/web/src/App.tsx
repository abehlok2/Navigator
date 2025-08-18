import React, { useRef } from 'react';
import ConnectionStatus from './features/session/ConnectionStatus';
import { connectWithReconnection } from './features/webrtc/connection';
import AssetDropZone from './features/ui/AssetDropZone';
import FacilitatorControls from './features/ui/FacilitatorControls';
import TelemetryDisplay from './features/ui/TelemetryDisplay';
import { useAudioContextUnlock } from './features/audio/context';

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  useAudioContextUnlock(rootRef);
  const handleConnect = () => {
    connectWithReconnection({
      roomId: 'demo',
      participantId: 'p1',
      targetId: 'p2',
      token: 'token',
      turn: [],
      role: 'facilitator',
      version: '1',
      onTrack: () => {},
    });
  };

  return (
    <div ref={rootRef}>
      <h1>Explorer Sessions</h1>
      <ConnectionStatus />
      <AssetDropZone />
      <FacilitatorControls />
      <TelemetryDisplay />
      <button onClick={handleConnect}>Connect</button>
    </div>
  );
}
