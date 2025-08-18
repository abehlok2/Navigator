# Navigator
---
Designed to facilitate consciousness exploration

## Security

Configure the following environment variables before running the signal server in production:

- `JWT_SECRET` – strong secret used to sign authentication tokens. The server refuses to start without it.
- `SESSION_TIMEOUT_MS` – optional timeout in milliseconds after which inactive participants are removed (defaults to 1800000).

Use HTTPS and a secure reverse proxy in deployment to protect credentials and tokens.
