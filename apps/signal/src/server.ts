import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', ws => {
  ws.on('message', message => {
    ws.send(message); // echo for now
  });
});

console.log('Signal server running on ws://localhost:8080');
