import express from 'express';
import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer, type IncomingMessage } from 'http';
import { readFileSync, existsSync } from 'fs';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import rateLimit from 'express-rate-limit';
import { authenticate, login, register, revokeToken, cleanupExpiredTokens } from './auth.js';
import { messageSchema, roleSchema, type Role } from './types.js';
import {
  createRoom,
  addParticipant,
  removeParticipant,
  setRole,
  getRoom,
  attachSocket,
  getParticipant,
  touchParticipant,
  cleanupInactiveParticipants,
} from './rooms.js';
import { z } from 'zod';

const TURN_CONFIG = {
  urls: ['stun:stun.l.google.com:19302'],
  username: 'user',
  credential: 'pass',
};

const app = express();
app.use(express.json());

const SESSION_TIMEOUT_MS = Number(process.env.SESSION_TIMEOUT_MS ?? 30 * 60 * 1000);
const TOKEN_TIMEOUT_MS = Number(process.env.TOKEN_INACTIVITY_MS ?? 15 * 60 * 1000);

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

const usernameSchema = z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/);
const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/);
const credSchema = z.object({ username: usernameSchema, password: passwordSchema, role: roleSchema.optional() });

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

app.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, password, role } = credSchema.parse(req.body);
    await register(username, password, role);
    res.sendStatus(201);
  } catch {
    res.status(400).json({ error: 'invalid request or user exists' });
  }
});

app.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = credSchema.omit({ role: true }).parse(req.body);
    const token = await login(username, password);
    if (!token) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }
    res.json({ token });
  } catch {
    res.status(400).json({ error: 'invalid request' });
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

const joinBody = z.object({ role: roleSchema });
app.post('/rooms/:roomId/join', authMiddleware(), (req, res) => {
  try {
    const { role } = joinBody.parse(req.body);
    const participant = addParticipant(req.params.roomId, role);
    res.json({ participantId: participant.id, turn: TURN_CONFIG });
  } catch {
    res.status(400).json({ error: 'invalid request or room not found' });
  }
});

app.post('/rooms/:roomId/leave', authMiddleware(), (req, res) => {
  const { participantId } = req.body as { participantId: string };
  removeParticipant(req.params.roomId, participantId);
  res.sendStatus(204);
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

const keyFile = process.env.SSL_KEY_FILE || 'key.pem';
const certFile = process.env.SSL_CERT_FILE || 'cert.pem';
let server;
if (existsSync(keyFile) && existsSync(certFile)) {
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
  const token = params.get('token') ?? '';
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
    try {
      const msg = messageSchema.parse(JSON.parse(data.toString()));
      const target = getParticipant(roomId, msg.target);
      if (target?.ws) {
        target.ws.send(JSON.stringify({ ...msg, from: participantId }));
      }
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'invalid message' }));
    }
  });

  ws.on('close', () => {
    attachSocket(roomId, participantId);
  });

  ws.send(JSON.stringify({ type: 'credentials', payload: TURN_CONFIG }));
});

server.listen(8080, () => {
  console.log('Signal server running on https://localhost:8080');
});

