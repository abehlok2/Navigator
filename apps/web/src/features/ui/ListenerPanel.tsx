import React from 'react';

export default function ListenerPanel() {
  return (
    <div className="section space-y-2">
      <h2 className="text-lg font-semibold">Listener</h2>
      <p className="text-sm text-gray-600">
        Join a room and connect to the facilitator to hear the shared program mix. Audio will begin automatically once the
        connection status reports “connected”.
      </p>
      <p className="text-sm text-gray-600">
        Listeners remain receive-only: no microphone or control data is sent to the room.
      </p>
    </div>
  );
}
