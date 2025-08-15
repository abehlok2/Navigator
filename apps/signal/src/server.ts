import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { authenticate } from './auth.js';
import { messageSchema, roleSchema } from './types.js';
import {
  createRoom,
  addParticipant,
  removeParticipant,
  setRole,
  getRoom,
  attachSocket,
  getParticipant,
} from './rooms.js';
import { z } from 'zod';

const TURN_CONFIG = {
  urls: ['stun:stun.l.google.com:19302'],
  username: 'user',
  credential: 'pass',
};

const app = express();
app.use(express.json());

app.post('/rooms', (_req, res) => {
  const room = createRoom();
  res.json({ roomId: room.id });
});

const joinBody = z.object({ role: roleSchema });
app.post('/rooms/:roomId/join', (req, res) => {
  try {
    const { role } = joinBody.parse(req.body);
    const participant = addParticipant(req.params.roomId, role);
    res.json({ participantId: participant.id, turn: TURN_CONFIG });
  } catch {
    res.status(400).json({ error: 'invalid request or room not found' });
  }
});

app.post('/rooms/:roomId/leave', (req, res) => {
  const { participantId } = req.body as { participantId: string };
  removeParticipant(req.params.roomId, participantId);
  res.sendStatus(204);
});

app.post('/rooms/:roomId/role', (req, res) => {
  const { participantId, role } = req.body as { participantId: string; role: any };
  try {
    setRole(req.params.roomId, participantId, roleSchema.parse(role));
    res.sendStatus(204);
  } catch {
    res.status(400).json({ error: 'invalid role' });
  }
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url?.split('?')[1]);
  const token = params.get('token') ?? '';
  const roomId = params.get('roomId') ?? '';
  const participantId = params.get('participantId') ?? '';

  if (!authenticate(token)) {
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

  ws.on('message', data => {
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
  console.log('Signal server running on http://localhost:8080');
});

