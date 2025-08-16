# Progress

## 2025-08-15

- [x] Defined control-plane schemas in `spec/protocol.md`.
- [x] Added acceptance tests in `spec/test-plans.md`.
- [x] Expanded Docker Compose setup for signaling, TURN and optional TLS proxy.
- [x] Replaced echo signal server with room handling, auth and message routing.
- [x] Added TURN/STUN credential exchange, SDP/ICE forwarding and schema validation.

### Next steps

- Add persistent storage for rooms and credentials.
- Implement robust authentication and authorization.

## 2025-08-16

- [x] Implemented client-side session management and signaling handshake.
- [x] Added full-duplex microphone transport with low-latency constraints and echo cancellation.
- [x] Established reliable, ordered data channel for control and telemetry.

### Next steps

- Integrate connection workflow with UI components.
- Add reconnection handling and telemetry messaging.
