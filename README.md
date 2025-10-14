# Navigator

---
Designed to facilitate consciousness exploration

## Security

Configure the following environment variables before running the signal server in production:

- `JWT_SECRET` – strong secret used to sign authentication tokens. If omitted, a default
  development secret is used and a warning is logged; **do not rely on this in production**.
- `SESSION_TIMEOUT_MS` – optional timeout in milliseconds after which inactive participants are removed (defaults to 1800000).
- `TOKEN_INACTIVITY_MS` – optional timeout in milliseconds after which inactive tokens are rejected (defaults to 900000).

- `SSL_KEY_FILE` – path to the TLS private key used for HTTPS.
- `SSL_CERT_FILE` – path to the TLS certificate.

- `STUN_URLS` – comma-separated STUN server URLs (defaults to `stun:stun.l.google.com:19302`).
- `TURN_URLS` – comma-separated TURN server URLs.
- `TURN_USERNAME` – TURN server username.
- `TURN_PASSWORD` – TURN server password.


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

## User Guide

See [docs/user-guide.md](docs/user-guide.md) for a role-based guide that covers setup, running the stack, and facilitating live sessions.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- [pnpm](https://pnpm.io/)
- [coturn](https://github.com/coturn/coturn) (STUN/TURN server)

## Installation

Install dependencies:

```bash
pnpm install
```

### Frontend dependencies

The web client relies on a modern component stack for layout, animation, and data visualization. Install the required packages in `apps/web` with npm if you are setting up the project outside of pnpm:

```bash
npm install react-router-dom framer-motion @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-slider recharts lucide-react
```

Installed packages include:

- **react-router-dom** (v6) for client-side routing
- **framer-motion** for declarative animations
- **@radix-ui/react-dialog** for accessible modal foundations
- **@radix-ui/react-dropdown-menu** for contextual menus
- **@radix-ui/react-tabs** for tabbed navigation
- **@radix-ui/react-slider** for audio controls
- **recharts** for graph rendering
- **lucide-react**, providing the shared icon set used throughout the interface

## Development

### Web interface

Start the Vite development server:

```bash
pnpm dev:web
```

When deploying on a personal machine, configure the backend host and port for the web client using environment variables. Set `VITE_API_URL` to the HTTP origin for REST requests and (optionally) `VITE_SIGNAL_URL` for WebSocket signaling. When not provided, the web client defaults to `http://localhost:8080` for API requests during development and derives the signal URL from the API origin.

Create an `.env` file in `apps/web`:

```bash
VITE_API_URL=http://your-host:8080
VITE_SIGNAL_URL=ws://your-host:8080
```

or export the variables when running commands:

```bash
VITE_API_URL=http://your-host:8080 \
VITE_SIGNAL_URL=ws://your-host:8080 pnpm dev:web
```

#### Audio asset preparation

The web client only plays audio that has been supplied locally by the facilitator. Import assets through the manifest editor or drop zone after distributing the files to explorers (for example via USB drive or shared local storage). Remote URLs in manifests are treated as legacy metadata and are not fetched by the application.

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
pnpm build:signal
```

Run the compiled server (the build step runs automatically if needed):

```bash
pnpm start:signal
```

## Linting and type checking

Run ESLint and TypeScript checks:

```bash
pnpm lint
pnpm typecheck
```

