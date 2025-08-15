0) Objectives & Non-Goals

Objectives

Two roles: Facilitator and Explorer.

Voice chat (full-duplex, low latency) via WebRTC.

Remote control of local program audio on the Explorer (playlists, play/pause/seek, fades, levels, binaural generators, noise beds).

Self-hosted signaling + TURN. No third-party SaaS.

Privacy and consent toggles (recording optional and local-only).

Non-Goals (MVP)

Multi-party conferencing (SFU) beyond 1:1.

Cloud storage or user accounts beyond a simple room/role code.

Sample-accurate DAW features. We target reliable WebAudio scheduling with small drift correction.

1) Repository Layout (monorepo)
explorer-sessions/
  package.json                  # workspace root
  pnpm-workspace.yaml
  .editorconfig
  .prettierrc
  .eslint.cjs
  .gitignore
  /apps
    /web                        # Vite + React + TypeScript SPA
      index.html
      vite.config.ts
      package.json
      /src
        main.tsx
        App.tsx
        /components
        /features
          /session
          /webrtc
          /audio
          /assets
          /ui
        /lib
        /styles
        /types
        /state
    /signal                     # Node.js signaling server (WebSocket)
      package.json
      tsconfig.json
      src/server.ts
      src/types.ts
      src/rooms.ts
      src/auth.ts
  /ops
    docker-compose.yml          # coturn + reverse proxy optional
    turnserver.conf.example
    caddy.json.example
  /spec
    protocol.md                 # control-plane spec (this doc’s schemas)
    test-plans.md               # acceptance tests, network tests, UX checks


Workspace toolchain

Node.js 20 LTS, pnpm 9.x, TypeScript 5.x.

Vite + React + Zustand (simple state) + Zod (runtime data validation).

No external media servers; only WebRTC P2P + self-hosted signaling + TURN.

2) Networking & Roles

Roles

Facilitator: Controls audio parameters; speaks; views Explorer meters.

Explorer: Hears program audio locally; speaks; consents to optional local recording.

Connections

WebSocket to signaling server (room join, SDP/ICE exchange).

WebRTC PeerConnection with:

Media: Facilitator mic → Explorer; Explorer mic → Facilitator.

DataChannel: Reliable, ordered; all control messages and telemetry.

Self-hosting

signal: a tiny Node WebSocket server on your box/VPS.

coturn: TURN with long-term credentials. Use a domain + TLS via Caddy/nginx.

3) Control-Plane Protocol (DataChannel)

All messages are JSON with a top-level type and payload. Validate with Zod.

3.1 Top-level envelope
type WireMessage = {
  type: string;          // e.g., "hello", "clockSync", "cmd.play"
  txn?: string;          // client-generated id for acks
  payload?: unknown;     // per-type schema
  sentAt?: number;       // sender performance.now() ms
};

3.2 Session / Presence
type Hello = { role: "facilitator" | "explorer"; roomId: string; version: string };
type Ack = { ok: boolean; error?: string; forTxn: string };

3.3 Clock Sync (for scheduled playback)
// Initiator → Responder
type ClockPing = { pingId: string };
// Responder → Initiator
type ClockPong = { pingId: string; responderNow: number };
/*
Procedure:
- Every 3s: send ClockPing with sentAt=performance.now()
- On ClockPong, compute RTT and offset:
  rtt = now - pingSentAt; oneWay = rtt/2;
  offset = responderNow - (now - oneWay);
Maintain EMA of offset, stddev; expose "peerClock.now()" helper.
*/

3.4 Asset Manifests (MVP: local preload or lightweight push)
// Facilitator describes expected assets by stable id
type AssetManifest = {
  assets: Array<{
    id: string;                 // "theta_intro_001"
    kind: "file" | "generator"; // "file" for audio files, "generator" for binaural/noise
    sha256?: string;            // optional integrity check
    meta?: { duration?: number; sampleRate?: number; loop?: boolean };
  }>;
};

// Explorer replies with which ids it can satisfy locally (preloaded by user)
type AssetPresence = {
  have: string[];               // asset ids available in browser memory/FS
  missing: string[];            // not present; could be pushed or replaced by generators
};

3.5 Commands (Explorer executes)
type CmdLoad = { id: string; mode: "fromLocal" | "fromURL" | "generator"; url?: string; gen?: GenSpec };
type CmdUnload = { id: string };
type CmdPlay = { id: string; atPeerTime?: number; offset?: number; gainDb?: number };
type CmdStop = { id: string; atPeerTime?: number };
type CmdSeek = { id: string; position: number };
type CmdGain = { id?: string; bus?: string; targetDb: number; rampMs: number };
type CmdCrossfade = { fromId: string; toId: string; durationMs: number; align?: "beat" | "now" };

// Generators (binaural/noise) spec
type GenSpec = {
  type: "binaural" | "noise";
  binaural?: { carrierHz: number; beatHz: number; depthDb?: number };
  noise?: { color: "white" | "pink" | "brown"; bandwidthHz?: [number, number] };
};

// Ducking control (Explorer applies based on Facilitator voice level)
type CmdDucking = { enabled: boolean; amountDb: number; attackMs: number; releaseMs: number; thresholdDb: number };

3.6 Telemetry (Explorer → Facilitator)
type Telemetry = {
  clockOffsetMs: number;
  audio: { peakDb: number; rmsDb: number; playing: Array<{ id: string; position: number; gainDb: number }> };
  webrtc?: { rttMs?: number; inboundBitrate?: number; outboundBitrate?: number; packetsLost?: number };
};


Message type strings (examples)

"hello", "ack"

"clock.ping", "clock.pong"

"manifest.set", "manifest.presence"

"cmd.load", "cmd.unload", "cmd.play", "cmd.stop", "cmd.seek", "cmd.gain", "cmd.crossfade", "cmd.ducking"

"telemetry"

4) Signaling Server (apps/signal)

Purpose: room creation, role validation, and WebRTC signaling relay (WebSocket messages: offer, answer, ice).

4.1 Minimal features

Endpoint: wss://yourdomain.example/ws

Messages:

{type:"join", roomId, role}

{type:"offer"|"answer"|"ice", roomId, fromRole, toRole, sdp/candidate}

{type:"leave"}

Room state: {roomId, facilitator?: ws, explorer?: ws}. Only 1:1 allowed.

Auth: accept a 6–8 digit room code; optionally a shared passphrase.

TLS termination via Caddy/nginx.

4.2 Server skeleton (TypeScript hints)

src/server.ts: create ws server, parse JSON, route by roomId, check roles, relay SDP/ICE to counterpart.

Heartbeats: ping/pong every 30s; clean up dead sockets.

Log events (structured JSON).

Acceptance

Can join as both roles; offer/answer/ICE relayed; counterpart receives messages within < 50 ms locally.

5) TURN (ops)

Use coturn with static user/pass or REST auth.

Open UDP 3478 (+ TCP 3478 as fallback) and TLS 5349 if desired.

Add TURN URLs to RTCIceServers config.

Confirm connectivity across different NATs.

Acceptance

Under symmetric NAT scenarios, WebRTC still connects (verified via peerConnection.connectionState === "connected").

6) Web App (apps/web)
6.1 Project setup

Vite + React + TS.

Libraries:

zustand for app state

zod for schema validation

simple-peer not used; use native RTCPeerConnection for control.

UI: your choice (e.g., Tailwind) — not essential.

Build outputs static files; host via any static server (or same Node as signal).

6.2 Feature slices
/features/webrtc

peer/createPeerConnection.ts

Creates RTCPeerConnection with iceServers (STUN + TURN).

Creates two transceivers: "audio" sendrecv for local mic; "audio" recvonly for remote? (In practice, add local mic and await remote track.)

Creates reliable ordered DataChannel named "control".

Hooks: onicecandidate, ontrack, onconnectionstatechange, ondatachannel.

peer/signalingClient.ts

WebSocket wrapper: join room, send offer|answer|ice, receive counterpart messages.

Re-emit events to the webrtc feature.

peer/clockSync.ts

Implements ping/pong and offset estimation (EMA).

Expose peerClock.now() and getOffsetStats().

/features/audio (Explorer-side engine)

engine/AudioEngine.ts

Singleton per Explorer session: manages AudioContext, Destination, mixers (buses), and registries of Players (file and generator).

Provides load(id, source), unload(id), play({id, atPeerTime, offset, gainDb}), stop({id, atPeerTime}), seek({id, position}), setGain({id|bus, targetDb, rampMs}), crossfade({fromId,toId,durationMs}).

Scheduling: Convert atPeerTime → local audio time using clockSync.offset. Use audioCtx.currentTime + a fixed SCHEDULE_AHEAD_SEC (e.g., 0.2 s). Use setTimeout loop every 50 ms to schedule events within the window.

Ducking: accepts RMS envelope (from facilitator’s remote voice stream) and applies GainNode reduction on the program bus with attack/release.

engine/players/FilePlayer.ts

Holds decoded AudioBuffer, constructs AudioBufferSourceNode on play, connects to per-track GainNode, supports start(when, offset), stop(when), linearRampToValueAtTime.

engine/players/BinauralPlayer.ts

Two OscillatorNodes (L/R) → GainNodes → channel merger → main bus.

Set frequency.value = carrierHz ± beatHz/2 (or keep same carrier and modulate with StereoPannerNode — simpler approach is detuned left/right).

Depth via amplitude modulation or channel gains; expose live param updates.

engine/players/NoisePlayer.ts

Use AudioWorklet (preferred) or ScriptProcessor fallback to generate noise; optional biquad filters to color (pink/brown). Connect to bus.

engine/ducking/VoiceRMS.ts

MediaStreamAudioSourceNode from remote facilitator voice.

AnalyserNode or AudioWorklet to compute RMS in dBFS at ~20–30 Hz rate.

Emits events or updates shared store; AudioEngine reads and applies gain reduction when threshold exceeded.

assets/AssetStore.ts

Keeps map {id -> {type: "file"|"generator", buffer?:AudioBuffer, genSpec?:GenSpec, meta}}.

ingestFiles(FileList) to preload local assets (Explorer UI).

Optional URL fetcher for self-hosted files (if permitted).

/features/session (shared)

Command router: on DataChannel "message", parse JSON → validate with Zod → route to engine methods.

Outbound telemetry timer (Explorer → Facilitator) every 500 ms.

/features/ui

Role gate: choose Facilitator/Explorer and enter room code/passphrase.

Device setup: select mic and output device; test tone; VU meters.

Facilitator view:

Playlist table (rows: id, type, duration, status(have/missing)).

Transport: Play/Stop/Seek, Crossfade, Gain, Ducking toggles/params.

Binaural/noise generators editor + “Add as track” button.

Remote meters: Explorer program bus RMS/peak.

Connection status: ICE state, RTT, clock offset.

Explorer view:

“Load local assets” zone (drag-drop).

Device selectors, headphone check, consent toggles (recording optional).

Local meters; health panel; connect/disconnect.

7) WebRTC Media Pipeline Details

getUserMedia constraints (voice)

{ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 }, video: false }

Route remote facilitator voice to:

AudioContext.createMediaStreamSource(remoteStream) → RMS analyzer (for ducking), and

<audio autoplay> element (or MediaStreamAudioDestinationNode into an <audio>), so Explorer hears facilitator.

Program audio: stays entirely in AudioContext, separate from WebRTC.

ICE servers

Provide iceServers: [{ urls: ["stun:...","turn:..."], username, credential }].

Stats

Poll pc.getStats() every 2 s; map to telemetry.

Acceptance

Round-trip voice latency under typical home networks < 200 ms.

Remote voice audible even during program audio (ducking works).

8) Scheduling & Drift Control

Goal: When Facilitator sends cmd.play with atPeerTime, Explorer starts within ±30 ms of target.

Procedure

Maintain offset (ExplorerNow − FacilitatorNow) via clockSync.

On cmd.play:

Compute targetLocalTime = audioCtx.currentTime + (atPeerTime - FacilitatorNow - networkOneWay).

In practice use atPeerTime folded through offset:
targetLocalTime = audioCtx.currentTime + ((atPeerTime + offsetMs/1000) - ExplorerNow).

If targetLocalTime < audioCtx.currentTime + 0.05, clamp to +0.05.

For long-running material, resync only at region boundaries (avoid mid-buffer retimes). If drift > 20 ms, stop/start next region at corrected time.

Acceptance

Repeated play/stop/seek shows start time error (median) < 20 ms, worst-case < 50 ms under normal networks.

9) Ducking

Explorer applies sidechain ducking to program bus using facilitator’s voice RMS.

Algorithm:

Convert RMS to dBFS. If above thresholdDb, apply amountDb reduction on program bus GainNode with linearRamp using attackMs/releaseMs.

Default: amountDb = -9 dB, attack=60 ms, release=500 ms, threshold=-45 dBFS.

Acceptance

While facilitator speaks, program drops audibly; recovers smoothly after.

10) Asset Handling

MVP recommended flow

Facilitator provides an Asset Manifest (ids and metadata) to Explorer.

Explorer preloads matching local files (drag-drop). They are decoded into AudioBuffers and registered under the requested ids.

Missing assets may be replaced with generators (binaural/noise) or, optionally, fetched from a self-hosted URL if permitted.

Optional small-file push (post-MVP)

Implement chunked transfer over DataChannel:

asset.offer {id, size, sha256}

asset.chunk {id, idx, Uint8Array}

asset.complete {id}

Limit to small files (< 25 MB) due to DataChannel buffering.

Acceptance

Explorer shows have/missing. After local load, missing becomes have. cmd.play succeeds.

11) Recording (Optional, Local-Only)

Toggle in Explorer UI: “Record my mic + program” (consent required).

Implement with MediaRecorder on a mixed MediaStream:

programBus → MediaStreamAudioDestinationNode

Combine with Explorer mic + facilitator remote voice via MediaStream.

Save to local Blob → download. Never uploads.

Acceptance

With consent toggled, “Start Recording” produces a playable .webm or .wav download. When off, no recording is possible.

12) Security & Privacy

All signaling over WSS (TLS).

Room codes are short-lived; single facilitator and single explorer per room.

No server-side media. All media is E2E via WebRTC.

No persistent storage unless Explorer explicitly downloads a recording or saves a local asset directory.

13) Implementation Steps (Task Graph)
Phase A — Ops & Skeleton

Bootstrap monorepo (pnpm init -w, workspaces for apps/web, apps/signal).

Create signaling server stub with ws (WebSocket), TypeScript, JSON routing.

Add docker-compose in /ops with coturn service and (optional) Caddy reverse proxy.

Environment: .env with TURN creds, allowed origins.

Acceptance: wss reachable, coturn logs allocations, basic join works.

Phase B — WebRTC Wiring

In apps/web, implement role selection + room join UI.

Implement signaling client (WebSocket) and PeerConnection builder:

Add local mic track.

Handle ontrack (remote audio).

Open DataChannel "control" (Facilitator creates; Explorer listens).

Exchange offer/answer/ICE through signaling.

Autoplay remote audio (ensure user gesture to enable audio context).

Acceptance: Both sides can speak & hear. DataChannel open.

Phase C — Control Protocol & Clock Sync

Add message schemas (Zod) and router.

Implement hello, ack, clock.ping/pong with offset EMA.

Show live stats: RTT, offset, connection state.

Acceptance: offset stabilizes within ±10 ms on LAN, ±30–50 ms over WAN.

Phase D — Explorer Audio Engine

Implement AudioEngine singleton with:

AudioContext + master bus (GainNode).

Program bus GainNode (for ducking).

Implement FilePlayer with decodeAudioData and AudioBufferSourceNode.

Implement generators: BinauralPlayer (two oscillators), NoisePlayer (AudioWorklet).

Implement command handlers:

cmd.load, cmd.unload, cmd.play, cmd.stop, cmd.seek, cmd.gain, cmd.crossfade, cmd.ducking.

Implement scheduler: schedule events relative to audioCtx.currentTime using atPeerTime + offset.

Acceptance: Commands received produce correct audible results; crossfade smooth; seeks accurate.

Phase E — Ducking & Voice Analysis

Pipe facilitator’s remote voice MediaStream into AudioContext.

Build VoiceRMS analysis (AnalyserNode or Worklet).

Apply ducking to program bus per config.

Acceptance: Speaking causes program audio to dip by configured dB.

Phase F — Asset Flow

Facilitator UI: build and send manifest.set.

Explorer UI: drag-drop local files → map to asset ids → manifest.presence.

Facil UI shows which tracks are ready; disable play on missing assets.

Acceptance: After preload, cmd.play starts correct track.

Phase G — Telemetry & Meters

Explorer emits telemetry every 500 ms (rms/peak, playing tracks).

Facilitator renders meters and track states.

Add pc.getStats() sampling for webrtc health (optional).

Acceptance: Facilitator sees Explorer levels and track positions update in near-real-time.

Phase H — UX Polish & Safety

Setup Wizard (Explorer): device select, tone test, headphone prompt, autoplay unlock click.

Consent toggles (recording). Gray out recording if not consented.

Error surfaces: ICE failures, decode errors, missing assets.

Acceptance: A guided flow makes first-time setup < 2 minutes.

14) Key Code Sketches (agent can expand)
14.1 Signaling (server.ts excerpts)
// Pseudocode-level
import { WebSocketServer } from "ws";
const wss = new WebSocketServer({ port: process.env.PORT ?? 8080 });

type Client = { ws: WebSocket; role: "facilitator" | "explorer"; roomId: string };
const rooms = new Map<string, { facilitator?: Client; explorer?: Client }>();

wss.on("connection", (ws) => {
  let client: Client | null = null;

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "join") {
      // validate roomId/role, enforce 1:1
      const room = rooms.get(msg.roomId) ?? {};
      if (room[msg.role]) { ws.close(1008, "role taken"); return; }
      client = { ws, role: msg.role, roomId: msg.roomId };
      room[msg.role] = client;
      rooms.set(msg.roomId, room);
      ws.send(JSON.stringify({ type: "joined", role: msg.role }));
      return;
    }
    // Relay offer/answer/ice to counterpart
    if (!client) return;
    const room = rooms.get(client.roomId);
    if (!room) return;
    const other = client.role === "facilitator" ? room.explorer : room.facilitator;
    if (other) other.ws.send(raw.toString());
  });

  ws.on("close", () => {
    if (!client) return;
    const room = rooms.get(client.roomId);
    if (!room) return;
    if (room[client.role]?.ws === ws) room[client.role] = undefined;
  });
});

14.2 Web App: PeerConnection builder
export async function createPC({ iceServers, localMic }: { iceServers: RTCIceServer[], localMic: MediaStream }) {
  const pc = new RTCPeerConnection({ iceServers });
  // mic up
  for (const track of localMic.getAudioTracks()) pc.addTrack(track, localMic);
  // remote
  pc.ontrack = (ev) => handleRemoteMedia(ev.streams[0]);
  // data
  const dc = pc.createDataChannel("control", { ordered: true });
  dc.onopen = () => onControlOpen(dc);
  dc.onmessage = (ev) => onControlMessage(ev.data);
  // ICE
  pc.onicecandidate = (e) => e.candidate && signaling.send({ type: "ice", candidate: e.candidate });
  // SDP offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signaling.send({ type: "offer", sdp: offer });
  return { pc, dc };
}

14.3 Explorer: play scheduling (simplified)
function playAt(id: string, atPeerTime?: number, offset = 0, gainDb = 0) {
  const nowPeer = peerClock.now();               // facilitator's clock estimate
  const whenPeer = atPeerTime ?? nowPeer + 0.3;  // default 300ms from now
  const delta = whenPeer - nowPeer;              // seconds
  const whenLocal = audioCtx.currentTime + Math.max(0.05, delta);

  const p = players.get(id); // FilePlayer or Generator
  p.setGainDb(gainDb);
  p.start(whenLocal, offset);
}

15) Acceptance Tests (spec/test-plans.md)

AT-1 Voice connectivity

Given both roles joined, when Facilitator and Explorer unmute mics, then both hear each other with RTT < 200 ms (displayed via getStats()).

AT-2 DataChannel

Given connected peers, when Facilitator sends a ping, Explorer replies within 150 ms; clock offset stabilizes < ±50 ms over WAN.

AT-3 Asset preload

Given an AssetManifest of two files (5–10 MB), when Explorer drag-drops matching files, then manifest.presence.have contains both ids.

AT-4 Program play & stop

When Facilitator issues cmd.play with atPeerTime = now + 0.5, Explorer starts within ±50 ms. cmd.stop stops cleanly.

AT-5 Crossfade

When cmd.crossfade (from A to B, 3 s) is sent, Explorer produces a smooth equal-power crossfade; no clicks.

AT-6 Ducking

With ducking enabled (−9 dB), when Facilitator speaks above threshold, Explorer program level reduces within 80 ms and returns after 500 ms.

AT-7 Poor network / TURN

Under symmetric NAT, connection establishes via TURN; voice quality remains intelligible; control messages reliable.

AT-8 Consent & recording (optional)

When Explorer toggles recording on and starts/stops, a file is produced locally and contains both mic and program if configured.

16) CI / CD & Dev Scripts

Root package.json scripts

{
  "scripts": {
    "dev:web": "pnpm -C apps/web dev",
    "build:web": "pnpm -C apps/web build",
    "serve:web": "pnpm -C apps/web preview",
    "dev:signal": "pnpm -C apps/signal ts-node src/server.ts",
    "start:signal": "node apps/signal/dist/server.js",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc -b"
  }
}


Docker Compose (ops/docker-compose.yml)

Services:

signal (Node) on 443 or behind proxy.

turn (coturn) opening 3478/5349.

caddy (optional) for TLS.

Acceptance

One command boots signal + turn; web dev server runs locally with VITE_* env pointing at signaling wss and TURN creds.

17) UX Copy & Safety

Explorer setup: “Use headphones to avoid feedback. Click ‘Enable Audio’ to unlock the browser audio context.”

Permissions: “This app uses your microphone for voice chat. Program audio stays on your device. Recording is off by default.”

Failure states:

“Media blocked: allow microphone access.”

“Connectivity degraded: using TURN relay; latency may increase.”

18) Hardening & Future Enhancements

Replace JSON with protobuf (smaller, faster) once stable.

Add automation lanes (binaural beat ramps, envelopes) as high-level cmd.automate.

Add observer role later via an SFU (mediasoup/Jitsi) if you need multi-party.

Add MIDI/OSC bridge for facilitator hardware control (browser WebMIDI).

19) Done-Definition (MVP)

Self-hosted signaling and TURN reachable over TLS.

Facilitator & Explorer connect reliably across common NATs.

Two-way voice works with AEC/NS/AGC.

Facilitator can load manifest, see Explorer have/missing, and play/stop/seek/crossfade/set gain on Explorer’s local program audio.

Clock sync keeps scheduled starts within ±50 ms over WAN.

Ducking makes speech intelligible over program audio.
