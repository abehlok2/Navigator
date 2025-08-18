import React from 'react';
import ConnectionStatus from './features/session/ConnectionStatus';
import { connectWithReconnection } from './features/webrtc/connection';

export default function App() {
  const handleConnect = () => {
    connectWithReconnection({
      roomId: 'demo',
      participantId: 'p1',
      targetId: 'p2',
      token: 'token',
      turn: [],
      role: 'explorer',
      version: '1',
      onTrack: () => {},
    });
  };

  return (
    <div>
      <h1>Explorer Sessions</h1>
      <ConnectionStatus />
      <button onClick={handleConnect}>Connect</button>
    </div>
  );
}
