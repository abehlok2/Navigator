import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    ws.send(msg);
  });
});

server.listen(3000, () => {
  console.log('Signal server running on http://localhost:3000');
});
