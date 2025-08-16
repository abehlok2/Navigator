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
