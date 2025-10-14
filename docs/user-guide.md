# Navigator User Guide

This guide explains how to set up the Navigator stack and how to facilitate, explore, or listen during a session. It also covers account management and room operations so you can run complete end-to-end experiences.

## 1. System setup

1. **Install prerequisites.** Install Node.js 18+, pnpm, and a TURN/STUN service such as coturn before continuing.【F:README.md†L51-L56】
2. **Install project dependencies.** From the repository root, run `pnpm install` once per machine to download shared packages.【F:README.md†L57-L63】
3. **Configure environment variables.**
   - Provide a strong `JWT_SECRET` in production so authentication tokens are signed securely. Development falls back to a warning-only placeholder that should not be used outside local testing.【F:README.md†L8-L34】
   - (Optional) Tune `SESSION_TIMEOUT_MS` and `TOKEN_INACTIVITY_MS` to control automatic cleanup of inactive WebRTC participants and API tokens.【F:README.md†L12-L45】【F:apps/signal/src/server.ts†L42-L44】【F:apps/signal/src/server.ts†L202-L204】
   - Supply TLS material via `SSL_KEY_FILE` and `SSL_CERT_FILE` when you want the signal server to serve HTTPS/WebSocket Secure.【F:README.md†L15-L17】【F:apps/signal/src/server.ts†L182-L199】
   - Configure TURN details with `STUN_URLS`, `TURN_URLS`, `TURN_USERNAME`, and `TURN_PASSWORD` so peers can connect across restrictive networks.【F:README.md†L18-L21】【F:apps/signal/src/server.ts†L30-L37】
4. **Set web client origins.** When you serve the UI from another host or port, add `VITE_API_URL` and `VITE_SIGNAL_URL` to `apps/web/.env` (or export them) so the browser can reach the signal server.【F:README.md†L69-L90】

## 2. Running the services

Navigator is split into a TypeScript signal server and a Vite-powered web client.

- **Development mode.**
  - Start the signal server with `pnpm dev:signal` to run the Express/WebSocket backend with live reload.【F:README.md†L95-L101】【F:apps/signal/src/server.ts†L262-L264】
  - Start the UI with `pnpm dev:web`. Vite serves the SPA on `http://localhost:5173` by default and proxies API/WebSocket traffic to the configured backend.【F:README.md†L69-L90】
- **Production build.**
  - Build and run the signal server with `pnpm build:signal` followed by `pnpm start:signal`. The start script automatically recompiles if needed.【F:README.md†L119-L131】
  - Build the web client with `pnpm build:web` and serve the static output via your preferred web server. Use `pnpm serve:web` locally to preview the bundle.【F:README.md†L103-L117】
- **TURN server.** Ensure your TURN/STUN service is reachable and that the credentials configured earlier are valid; each participant receives these credentials automatically after connecting.【F:apps/signal/src/server.ts†L30-L37】【F:apps/signal/src/server.ts†L205-L260】

## 3. Accounts and authentication

The signal server exposes REST endpoints for registration, login, logout, and room management. All browser authentication flows are provided in the built-in form.

- **Account creation.** On the login screen choose “Need an account? Register,” pick a role (facilitator, explorer, or listener), and submit a username/password. The server validates usernames (3–32 characters, alphanumeric/`_`/`-`) and strong passwords (8–128 characters containing lowercase, uppercase, and digits).【F:apps/web/src/features/auth/AuthForm.tsx†L7-L86】【F:apps/signal/src/server.ts†L67-L88】
- **Login.** Use the same form to authenticate. Successful logins return a JWT that the client stores for API/WebSocket access. Rate limiting restricts repeated attempts to 10 per 15-minute window.【F:apps/web/src/features/auth/AuthForm.tsx†L14-L40】【F:apps/signal/src/server.ts†L77-L101】
- **Logout.** Select the “Logout” button in the app header to revoke the current token and return to the login screen.【F:apps/web/src/App.tsx†L356-L363】【F:apps/signal/src/server.ts†L103-L108】
- **Role binding.** Accounts are permanently associated with the role chosen at registration. The server enforces that a participant joins rooms only under their assigned role.【F:apps/signal/src/server.ts†L115-L138】
- **Data location.** User and room records persist in `apps/signal/data/users.json` and `apps/signal/data/rooms.json`. Removing these files resets credentials and room history (do this only while the server is stopped).【F:apps/signal/src/storage.ts†L1-L35】

## 4. Session lifecycle overview

1. **Facilitator creates a room.** After logging in, facilitators use the “Create Room” button to generate a unique room ID to share with participants.【F:apps/web/src/App.tsx†L356-L393】
2. **Participants join the room.** Facilitators, explorers, and listeners enter the room ID, pick a connection target (usually the facilitator), and select “Connect” to establish WebRTC signaling. The UI enforces role pairing rules so only compatible targets appear.【F:apps/web/src/App.tsx†L367-L420】【F:apps/web/src/App.tsx†L67-L119】【F:apps/web/src/App.tsx†L252-L343】
3. **Facilitator moderates.** Facilitators can set a room password, adjust participant roles, or remove participants entirely from the Participants panel.【F:apps/web/src/App.tsx†L414-L525】【F:apps/signal/src/server.ts†L160-L180】
4. **WebRTC negotiation.** Once connected, the server brokers signaling messages between peers and supplies TURN credentials. Listeners are receive-only at the protocol level.【F:apps/signal/src/server.ts†L205-L260】
5. **Session teardown.** Disconnecting in the UI or closing the browser triggers a room leave request so resources are cleaned up server-side.【F:apps/web/src/App.tsx†L277-L349】【F:apps/signal/src/server.ts†L140-L144】【F:apps/signal/src/server.ts†L255-L257】

## 5. Facilitator workflow

Facilitators control program playback, moderate attendees, and provide the asset manifest that explorers load locally.

1. **Prepare audio assets.** Distribute required audio files to explorers ahead of time (e.g., via USB or shared storage). The client never downloads remote media; it only matches local files against the manifest.【F:README.md†L91-L94】
2. **Build the manifest.** Use the Manifest Editor to add tracks manually or by selecting local files. The editor computes SHA-256 checksums, size, and optional duration estimates, validates entries, and allows reordering before you send the manifest to the explorer.【F:apps/web/src/features/ui/ManifestEditor.tsx†L1-L239】
3. **Send the manifest.** After reviewing validation warnings, send the manifest to populate the explorer’s asset list. The explorer’s drop zone will reflect expected track IDs, and availability updates appear in the Facilitator view.【F:apps/web/src/features/ui/ManifestEditor.tsx†L203-L239】【F:apps/web/src/features/ui/AssetDropZone.tsx†L5-L41】【F:apps/web/src/features/ui/FacilitatorControls.tsx†L12-L119】
4. **Track asset status.** Facilitator Controls show whether each asset is loaded or missing remotely and report acknowledgements when load/unload commands succeed.【F:apps/web/src/features/ui/FacilitatorControls.tsx†L12-L88】
5. **Control playback.** Use the per-track controls to load/unload assets, trigger playback, stop, set gain, perform crossfades, and enable speech-driven ducking. The UI automatically reflects remote state transitions and provides status feedback for each command.【F:apps/web/src/features/ui/FacilitatorControls.tsx†L18-L119】【F:apps/web/src/features/ui/FacilitatorControls.tsx†L120-L207】
6. **Monitor telemetry.** Facilitator sessions display remote meters and transport data so you can confirm the explorer is receiving audio in real time.【F:apps/web/src/App.tsx†L368-L376】
7. **Manage participants.** Use the Participants panel to promote/demote roles (e.g., move a listener to explorer) or remove entries. Clearing the password reopens the room for new arrivals.【F:apps/web/src/App.tsx†L414-L525】

## 6. Explorer workflow

Explorers receive the facilitator’s commands, play program audio locally, and can optionally record their mix.

1. **Load required files.** After connecting, drop the facilitator-provided audio onto the Explorer’s drop zone. Each file is hashed to verify it matches the manifest before being marked as available.【F:apps/web/src/features/ui/AssetDropZone.tsx†L5-L41】
2. **Observe availability.** The Explorer view mirrors asset presence so you can confirm which tracks are ready before playback begins.【F:apps/web/src/App.tsx†L368-L376】
3. **Interact with playback.** Program transport is controlled remotely; explorers mainly ensure audio hardware is connected and that they stay muted/unmuted as instructed.
4. **Record the session mix.** Use the Recording panel to request consent, start/stop recordings, monitor input levels, and download or delete completed takes. Recording requires that a microphone stream is available from the WebRTC link.【F:apps/web/src/features/ui/RecordingControls.tsx†L18-L200】

## 7. Listener workflow

Listeners join rooms to monitor the facilitator’s mix without sending any audio or control data. After connecting to the facilitator, audio starts automatically once the connection status reports “connected.”【F:apps/web/src/App.tsx†L367-L376】【F:apps/web/src/features/ui/ListenerPanel.tsx†L3-L14】 The server also blocks listeners from sending control messages, keeping their presence receive-only.【F:apps/signal/src/server.ts†L205-L260】

## 8. Room security and maintenance

- **Passwords.** Facilitators can require a per-room password and clear it later without recreating the room.【F:apps/web/src/App.tsx†L414-L445】【F:apps/signal/src/server.ts†L170-L174】
- **Role hygiene.** Promote or demote participants as needed; the server validates new roles and rejects invalid requests.【F:apps/web/src/App.tsx†L448-L506】【F:apps/signal/src/server.ts†L160-L168】
- **Token/session cleanup.** Background timers automatically expire idle tokens and participants, which helps keep rooms accurate even if someone disconnects unexpectedly.【F:apps/signal/src/server.ts†L42-L44】【F:apps/signal/src/server.ts†L202-L204】
- **Data resets.** Stop the signal server before removing the JSON data files; otherwise, in-memory state might re-persist old records on shutdown.【F:apps/signal/src/storage.ts†L1-L35】

## 9. Troubleshooting checklist

1. **Authentication errors.** Confirm the username/password meet the validation rules and that rate limiting is not triggered; wait 15 minutes or restart the server during testing.【F:apps/signal/src/server.ts†L67-L101】
2. **Cannot connect to room.** Ensure the room ID is correct, the facilitator is online, and TURN credentials are configured. The UI reports “target unavailable” if the selected participant leaves before the handshake finishes.【F:apps/web/src/App.tsx†L252-L343】
3. **Audio not loading.** Verify the explorer dropped files whose filenames and SHA-256 hashes match the manifest. Re-send the manifest if you revise entries mid-session.【F:apps/web/src/features/ui/ManifestEditor.tsx†L203-L239】【F:apps/web/src/features/ui/AssetDropZone.tsx†L5-L41】
4. **Recording unavailable.** Recording requires an active microphone stream; reconnect if the WebRTC link was interrupted or if browser permissions were revoked.【F:apps/web/src/features/ui/RecordingControls.tsx†L18-L200】

Keep this guide handy as you prepare sessions so each role knows what to expect and how to get the most out of Navigator.
