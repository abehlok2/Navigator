import React from 'react';
import { useSessionStore } from '../../state/session';

export default function TelemetryDisplay() {
  const telemetry = useSessionStore(s => s.telemetry);
  if (!telemetry) return <div className="section">No telemetry</div>;
  return (
    <div className="section">
      <h3>Telemetry</h3>
      <div>Mic: {telemetry.mic.toFixed(1)} dBFS</div>
      <div>Program: {telemetry.program.toFixed(1)} dBFS</div>
    </div>
  );
}
