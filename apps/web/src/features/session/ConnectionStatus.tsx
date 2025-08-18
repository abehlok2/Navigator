import React from 'react';
import { useSessionStore } from '../../state/session';

export default function ConnectionStatus() {
  const { connection, lastHeartbeat } = useSessionStore(s => ({
    connection: s.connection,
    lastHeartbeat: s.lastHeartbeat,
  }));
  const heartbeatAge = lastHeartbeat ? ((Date.now() - lastHeartbeat) / 1000).toFixed(1) : 'n/a';
  return (
    <div>
      <div>Connection: {connection}</div>
      <div>Heartbeat: {heartbeatAge}s ago</div>
    </div>
  );
}
