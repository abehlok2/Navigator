# Progress

## 2025-08-15

- [x] Defined control-plane schemas in `spec/protocol.md`.
- [x] Added acceptance tests in `spec/test-plans.md`.
- [x] Expanded Docker Compose setup for signaling, TURN and optional TLS proxy.
- [x] Replaced echo signal server with room handling, auth and message routing.
- [x] Added TURN/STUN credential exchange, SDP/ICE forwarding and schema validation.

## 2025-08-16

- [x] Added persistent storage for rooms and user credentials backed by JSON files.
- [x] Implemented JWT-based authentication with role-based authorization.

### Next steps

- Add unit tests for authentication and room management.
- Implement session expiration and cleanup for inactive participants.

## 2025-08-16

- [x] Implemented client-side session management and signaling handshake.
- [x] Added full-duplex microphone transport with low-latency constraints and echo cancellation.
- [x] Established reliable, ordered data channel for control and telemetry.

### Next steps

- Integrate connection workflow with UI components.
- Add reconnection handling and telemetry messaging.

## 2025-08-17

- [x] Implemented control-plane protocol with JSON envelope and schemas.
- [x] Added transaction IDs with ack handling for reliable messaging.
- [x] Wired heartbeat keepalive and basic error reporting on the control channel.

### Next steps

- Hook command handlers into the Explorer audio engine.
- Surface connection and heartbeat status in the UI.

## 2025-08-18

- [x] Implemented periodic ping/pong clock sync every 3 s with RTT/offset calculation.
- [x] Exposed `PeerClock` abstraction for audio scheduling.

### Next steps

- Integrate `PeerClock` with the audio scheduling engine.
- Add safeguards for clock drift and reconnection.


## 2025-08-19

- [x] Initialized shared AudioContext with user gesture unlocking.
- [x] Added drag-drop asset preloading with manifest matching.
- [x] Implemented FilePlayer, generators, scheduling helper and crossfades.
- [x] Added speech-controlled ducking and optional local recording.

### Next steps

- Wire audio subsystem into UI components.
- Add tests for scheduling and recording consent flows.

## 2025-08-20

- [x] Implemented facilitator control interface with command helpers over the DataChannel.
- [x] Added Zustand session store tracking role, connection status and asset presence.
- [x] Linked asset preload and connection lifecycle to maintain session state.

### Next steps

- Build facilitator UI elements to trigger commands.
- Sync asset presence and telemetry between peers.

## 2025-08-21

- [x] Synced asset presence between peers via control channel messages.
- [x] Added periodic telemetry stream reporting RMS, peak and playing tracks.

### Next steps

- Build facilitator UI to display asset availability and telemetry metrics.
- Handle reconnection to resend presence and restart telemetry.

## 2025-08-22

- [x] Integrated connection workflow with basic UI components.
- [x] Added reconnection logic and telemetry heartbeat handling.
- [x] Surfaced connection and heartbeat status indicators in the UI.

### Next steps

- Build facilitator UI to display asset availability and telemetry metrics.
