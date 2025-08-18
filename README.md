# Navigator

---
Designed to facilitate consciousness exploration

## Security

Configure the following environment variables before running the signal server in production:

- `JWT_SECRET` – strong secret used to sign authentication tokens. The server refuses to start without it.
- `SESSION_TIMEOUT_MS` – optional timeout in milliseconds after which inactive participants are removed (defaults to 1800000).
- `STUN_URLS` – comma-separated STUN server URLs (defaults to `stun:stun.l.google.com:19302`).
- `TURN_URLS` – comma-separated TURN server URLs.
- `TURN_USERNAME` – TURN server username.
- `TURN_PASSWORD` – TURN server password.

Use HTTPS and a secure reverse proxy in deployment to protect credentials and tokens.


Navigator is a monorepo designed to facilitate consciousness exploration. It contains a web interface and a signal processing server.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- [pnpm](https://pnpm.io/)
- [coturn](https://github.com/coturn/coturn) (STUN/TURN server)

## Installation

Install dependencies:

```bash
pnpm install
```

## Development

### Web interface

Start the Vite development server:

```bash
pnpm dev:web
```

### Signal server

Run the signal server with live reloading:

```bash
pnpm dev:signal
```

## Build

### Web application

Create a production build:

```bash
pnpm build:web
```

Preview the built site:

```bash
pnpm serve:web
```

### Signal server

Compile the TypeScript source to JavaScript:

```bash
pnpm typecheck
```

Run the compiled server:

```bash
pnpm start:signal
```

## Linting and type checking

Run ESLint and TypeScript checks:

```bash
pnpm lint
pnpm typecheck
```

