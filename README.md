# Navigator

---
Designed to facilitate consciousness exploration

## Security

Configure the following environment variables before running the signal server in production:

- `JWT_SECRET` – strong secret used to sign authentication tokens. The server refuses to start without it.
- `SESSION_TIMEOUT_MS` – optional timeout in milliseconds after which inactive participants are removed (defaults to 1800000).
- `TOKEN_INACTIVITY_MS` – optional timeout in milliseconds after which inactive tokens are rejected (defaults to 900000).

Use HTTPS and a secure reverse proxy in deployment to protect credentials and tokens.

### Generating a JWT secret

Generate a strong JWT secret and store it outside version control:

```bash
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
```

The `.env` file is ignored by Git but should still have restrictive permissions.

### Configuring timeouts for small deployments

For smaller deployments, tune the session and token timeouts to free resources promptly. Example `.env` settings:

```bash
SESSION_TIMEOUT_MS=1800000     # remove inactive participants after 30 minutes
TOKEN_INACTIVITY_MS=900000     # invalidate tokens idle for 15 minutes
```

Adjust the values as needed for your environment.


Navigator is a monorepo designed to facilitate consciousness exploration. It contains a web interface and a signal processing server.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- [pnpm](https://pnpm.io/)

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

