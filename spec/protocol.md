# Protocol

The control-plane runs over a reliable ordered WebRTC DataChannel. Messages are UTF-8 encoded JSON structures.

## Envelope

```ts
interface WireMessage {
  type: string;             // "hello", "ack", "clock.ping", "cmd.play", ...
  txn?: string;             // optional client generated id for pairing with acks
  payload?: unknown;        // type specific body
  sentAt?: number;          // sender's performance.now() timestamp in ms
}
```

## Session and Presence

`hello` — exchanged when DataChannel opens.

```ts
interface Hello {
  role: "facilitator" | "explorer";
  roomId: string;
  version: string;
}
```

`ack` — generic acknowledgement.

```ts
interface Ack {
  ok: boolean;
  error?: string;
  forTxn: string;
}
```

## Clock synchronisation

Facilitator initiates pings every few seconds to estimate the Explorer's clock.

```ts
// Facilitator -> Explorer
interface ClockPing { pingId: string; }
// Explorer -> Facilitator
interface ClockPong { pingId: string; responderNow: number; }
```

When sending `ClockPing` the `sentAt` field holds the initiator time. On
receiving the paired `ClockPong` both sides derive RTT and offset.

## Asset manifest and presence

```ts
interface AssetEntry { id: string; sha256: string; bytes: number; }
interface AssetManifest { entries: AssetEntry[]; }
interface AssetPresence { have: string[]; missing: string[]; }
```

Facilitator sends `asset.manifest`. Explorer replies with `asset.presence`
whenever local files are added.

## Playback commands

All commands flow from Facilitator to Explorer and use the envelope `type`
prefix `cmd.*`.

```ts
interface CmdPlay {
  id: string;
  atPeerTime?: number; // facilitator clock estimate
  offset?: number;     // seconds into asset
  gainDb?: number;
}

interface CmdStop { id: string; }

interface CmdCrossfade {
  fromId: string;
  toId: string;
  duration: number; // seconds
}

interface CmdSetGain { id: string; gainDb: number; }

interface CmdDucking {
  enabled: boolean;
  thresholdDb: number;
  reduceDb: number;
  attackMs: number;
  releaseMs: number;
}
```

## Telemetry

Explorer periodically reports metering information.

```ts
interface TelemetryLevels {
  mic: number;     // dBFS
  program: number; // dBFS
}
```

Sent as `telemetry.levels` from Explorer to Facilitator.
