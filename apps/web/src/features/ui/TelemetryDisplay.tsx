import React from 'react';
import { useSessionStore } from '../../state/session';

export default function TelemetryDisplay() {
  const telemetry = useSessionStore(s => s.telemetry);
  if (!telemetry) return <div className="section">No telemetry</div>;
  return (
    <div className="section">
      <h3>Telemetry</h3>
      <div>RMS: {telemetry.rms.toFixed(3)}</div>
      <div>Peak: {telemetry.peak.toFixed(3)}</div>
      <div>Playing: {telemetry.playing.join(', ') || 'none'}</div>
    </div>
  );
}
