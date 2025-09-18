import express from 'express';
import cors from 'cors';
import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer, type IncomingMessage } from 'http';
import { readFileSync, existsSync } from 'fs';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import rateLimit from 'express-rate-limit';
import {
  authenticate,
  login,
  register,
  revokeToken,
  cleanupExpiredTokens,
  type AuthPayload,
  UserExistsError,
} from './auth.js';
import { messageSchema, roleSchema, type Role, type WireMessage } from './types.js';
import {
  createRoom,
  addParticipant,
  removeParticipant,
  setRole,
  getRoom,
  attachSocket,
  getParticipant,
  listParticipants,
  touchParticipant,
  cleanupInactiveParticipants,
  setPassword,
  verifyPassword,
  kickParticipant,
} from './rooms.js';
import { z } from 'zod';

function parseUrls(value?: string) {
  return value?.split(',').map((u) => u.trim()).filter(Boolean) ?? [];
}

const TURN_CONFIG = {
  urls: [
    ...parseUrls(process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302'),
    ...parseUrls(process.env.TURN_URLS),
  ],
  username: process.env.TURN_USERNAME,
  credential: process.env.TURN_PASSWORD,
};

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',').map(origin => origin.trim()).filter(Boolean) || '*',
}));
app.use(express.json());

const SESSION_TIMEOUT_MS = Number(process.env.SESSION_TIMEOUT_MS ?? 30 * 60 * 1000);
const TOKEN_TIMEOUT_MS = Number(process.env.TOKEN_INACTIVITY_MS ?? 15 * 60 * 1000);

const LISTENER_ALLOWED_TYPES: ReadonlySet<WireMessage['type']> = new Set([
  'sdp',
  'ice',
  'ack',
  'hello',
  'clock.pong',
]);

function authMiddleware(requiredRole?: Role) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const header = req.headers.authorization || '';
    const token = header.split(' ')[1];
    const payload = authenticate(token);
    if (!payload || (requiredRole && payload.role !== requiredRole)) {
      res.sendStatus(403);
      return;
    }
    (req as any).user = payload;
    next();
  };
}

const usernameSchema = z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/);
const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/);
const credSchema = z.object({ username: usernameSchema, password: passwordSchema, role: roleSchema.optional() });
const loginSchema = credSchema.omit({ role: true });

function formatValidationIssues(error: z.ZodError): string[] {
  return error.errors.map(issue => issue.message);
}

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

app.post('/register', authLimiter, async (req, res) => {
  const parsed = credSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid request', issues: formatValidationIssues(parsed.error) });
    return;
  }

  const { username, password, role } = parsed.data;
  try {
    await register(username, password, role);
    const token = await login(username, password);
    if (!token) {
      res.status(500).json({ error: 'failed to authenticate new user' });
      return;
    }
    res.status(201).json({ token });
  } catch (err) {
    if (err instanceof UserExistsError) {
      res.status(409).json({ error: 'username already exists' });
      return;
    }
    console.error('Failed to register user', err);
    res.status(500).json({ error: 'failed to register user' });
  }
});

app.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid request', issues: formatValidationIssues(parsed.error) });
    return;
  }

  try {
    const token = await login(parsed.data.username, parsed.data.password);
    if (!token) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }
    res.json({ token });
  } catch (err) {
    console.error('Failed to log in user', err);
    res.status(500).json({ error: 'failed to authenticate user' });
  }
});

app.post('/logout', authMiddleware(), (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.split(' ')[1];
  if (token) revokeToken(token);
  res.sendStatus(204);
});

app.post('/rooms', authMiddleware('facilitator'), (_req, res) => {
  const room = createRoom();
  res.json({ roomId: room.id });
});

const joinBody = z.object({ role: roleSchema, password: z.string().optional() });
app.post('/rooms/:roomId/join', authMiddleware(), (req, res) => {
  try {
    const { role, password } = joinBody.parse(req.body);
    const user = (req as any).user as AuthPayload;
    if (role !== user.role) {
      res.status(403).json({ error: 'role mismatch' });
      return;
    }
    if (!verifyPassword(req.params.roomId, password)) {
      res.status(403).json({ error: 'invalid password' });
      return;
    }
    const participant = addParticipant(req.params.roomId, role);
    const participants = listParticipants(req.params.roomId).map(p => ({
      id: p.id,
      role: p.role,
      connected: Boolean(p.ws),
    }));
    res.json({ participantId: participant.id, turn: TURN_CONFIG, participants });
  } catch {
    res.status(400).json({ error: 'invalid request or room not found' });
  }
});

app.post('/rooms/:roomId/leave', authMiddleware(), (req, res) => {
  const { participantId } = req.body as { participantId: string };
  removeParticipant(req.params.roomId, participantId);
  res.sendStatus(204);
});

app.get('/rooms/:roomId/participants', authMiddleware(), (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: 'room not found' });
    return;
  }
  const participants = listParticipants(room.id).map(p => ({
    id: p.id,
    role: p.role,
    connected: Boolean(p.ws),
  }));
  res.json({ participants });
});

app.post('/rooms/:roomId/role', authMiddleware('facilitator'), (req, res) => {
  const { participantId, role } = req.body as { participantId: string; role: any };
  try {
    setRole(req.params.roomId, participantId, roleSchema.parse(role));
    res.sendStatus(204);
  } catch {
    res.status(400).json({ error: 'invalid role' });
  }
});

app.post('/rooms/:roomId/password', authMiddleware('facilitator'), (req, res) => {
  const { password } = req.body as { password?: string };
  setPassword(req.params.roomId, password);
  res.sendStatus(204);
});

app.post('/rooms/:roomId/kick', authMiddleware('facilitator'), (req, res) => {
  const { participantId } = req.body as { participantId: string };
  kickParticipant(req.params.roomId, participantId);
  res.sendStatus(204);
});

const keyFile = process.env.SSL_KEY_FILE || 'key.pem';
const certFile = process.env.SSL_CERT_FILE || 'cert.pem';

const useHttps = existsSync(keyFile) && existsSync(certFile);
let server;
if (useHttps) {
  server = createHttpsServer(
    {
      key: readFileSync(keyFile),
      cert: readFileSync(certFile),
    },
    app,
  );
} else {
  console.warn('SSL certificates not found; starting HTTP server');
  server = createHttpServer(app);
}

const wss = new WebSocketServer({ server });

setInterval(() => cleanupInactiveParticipants(SESSION_TIMEOUT_MS), SESSION_TIMEOUT_MS);
setInterval(() => cleanupExpiredTokens(TOKEN_TIMEOUT_MS), TOKEN_TIMEOUT_MS);

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const params = new URLSearchParams(req.url?.split('?')[1]);
  const token = (req.headers['sec-websocket-protocol'] as string | undefined)?.split(',')[0]?.trim() ?? '';
  const roomId = params.get('roomId') ?? '';
  const participantId = params.get('participantId') ?? '';

  const payload = authenticate(token);
  if (!payload) {
    ws.close();
    return;
  }
  const room = getRoom(roomId);
  const participant = getParticipant(roomId, participantId);
  if (!room || !participant) {
    ws.close();
    return;
  }

  attachSocket(roomId, participantId, ws);
  touchParticipant(roomId, participantId);

  ws.on('message', (data: RawData) => {
    touchParticipant(roomId, participantId);
    let msg: WireMessage;
    try {
      msg = messageSchema.parse(JSON.parse(data.toString()));
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'invalid message' }));
      return;
    }

    if (participant.role === 'listener' && !LISTENER_ALLOWED_TYPES.has(msg.type)) {
      ws.send(JSON.stringify({ type: 'error', error: 'listener cannot send this message' }));
      return;
    }

    if (msg.roomId !== roomId) {
      ws.send(JSON.stringify({ type: 'error', error: 'invalid room' }));
      return;
    }

    const target = getParticipant(roomId, msg.target);
    if (!target?.ws) {
      ws.send(JSON.stringify({ type: 'error', error: 'target not available' }));
      return;
    }

    target.ws.send(JSON.stringify({ ...msg, from: participantId }));
  });

  ws.on('close', () => {
    removeParticipant(roomId, participantId);
  });

  ws.send(JSON.stringify({ type: 'credentials', payload: TURN_CONFIG }));
});

server.listen(8080, () => {
  console.log(`Signal server running on ${useHttps ? 'https' : 'http'}://localhost:8080`);
});

