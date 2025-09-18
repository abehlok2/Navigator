import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { useSessionStore } from '../../state/session';

export default function TelemetryDisplay() {
  const telemetry = useSessionStore(s => s.telemetry);
  if (!telemetry) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-slate-50/70">
          <CardTitle>Telemetry</CardTitle>
          <CardDescription>Awaiting explorer signal…</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-slate-50/70">
        <CardTitle>Telemetry</CardTitle>
        <CardDescription>Live mix levels from the explorer client.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-600">
        <TelemetryRow label="Speech input" value={telemetry.mic} description="Includes facilitator audio and local mic." />
        <TelemetryRow label="Program" value={telemetry.program} description="Raw program feed before ducking." />
      </CardContent>
    </Card>
  );
}

function TelemetryRow({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
        <span>{label}</span>
        <span>{value.toFixed(1)} dBFS</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">{description}</div>
    </div>
  );
}
