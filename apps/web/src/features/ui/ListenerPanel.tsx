import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';

export default function ListenerPanel() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-slate-50/70">
        <CardTitle>Listener overview</CardTitle>
        <CardDescription>Connect to the facilitator to monitor the shared program mix in real time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-600">
        <p>
          Join a room, pick the facilitator, and audio will begin automatically once the connection status reports
          <span className="font-semibold text-slate-700"> connected</span>.
        </p>
        <p>Listeners stay receive-only—no microphone or control data is sent back to the room.</p>
        <p className="rounded-2xl bg-slate-100/70 p-3 text-xs text-slate-500">
          Tip: keep this tab focused to minimise playback interruptions, especially on mobile devices.
        </p>
      </CardContent>
    </Card>
  );
}
