# Progress

## 2025-08-15

- [x] Defined control-plane schemas in `spec/protocol.md`.
- [x] Added acceptance tests in `spec/test-plans.md`.
- [x] Expanded Docker Compose setup for signaling, TURN and optional TLS proxy.
- [x] Replaced echo signal server with room handling, auth and message routing.
- [x] Added TURN/STUN credential exchange, SDP/ICE forwarding and schema validation.

### Next steps

- Add persistent storage for rooms and credentials (rooms are currently kept in-memory in `apps/signal/src/rooms.ts`).
- Implement robust authentication and authorization (the `authenticate` helper in `apps/signal/src/auth.ts` uses a static secret).
