import React from 'react';
import ConnectionStatus from './features/session/ConnectionStatus';
import { connectWithReconnection } from './features/webrtc/connection';
import AssetDropZone from './features/ui/AssetDropZone';
import AssetAvailability from './features/ui/AssetAvailability';
import FacilitatorControls from './features/ui/FacilitatorControls';
import TelemetryDisplay from './features/ui/TelemetryDisplay';

export default function App() {
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
    <div>
      <h1>Explorer Sessions</h1>
      <ConnectionStatus />
      <AssetDropZone />
      <AssetAvailability />
      <FacilitatorControls />
      <TelemetryDisplay />
      <button onClick={handleConnect}>Connect</button>
    </div>
  );
}
