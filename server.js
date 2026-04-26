const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const rooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

const server = http.createServer((req, res) => {
  let urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
  ws.roomId = null;
  ws.color = null;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'create') {
      let code;
      do { code = genCode(); } while (rooms.has(code));
      rooms.set(code, { clients: [ws] });
      ws.roomId = code;
      ws.color = 'X';
      send(ws, { type: 'created', roomId: code, color: 'X' });
      return;
    }

    if (msg.type === 'join') {
      const code = (msg.roomId || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) { send(ws, { type: 'error', message: 'Code introuvable' }); return; }
      if (room.clients.length >= 2) { send(ws, { type: 'error', message: 'Partie pleine' }); return; }
      room.clients.push(ws);
      ws.roomId = code;
      ws.color = 'O';
      send(ws, { type: 'joined', roomId: code, color: 'O' });
      send(room.clients[0], { type: 'opponentJoined' });
      return;
    }

    if (msg.type === 'action') {
      const room = rooms.get(ws.roomId);
      if (!room) return;
      for (const c of room.clients) {
        if (c !== ws) send(c, { type: 'action', action: msg.action });
      }
      return;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomId);
    if (!room) return;
    room.clients = room.clients.filter(c => c !== ws);
    for (const c of room.clients) send(c, { type: 'opponentLeft' });
    if (room.clients.length === 0) rooms.delete(ws.roomId);
  });
});

server.listen(PORT, () => {
  console.log('12 Pions server running on http://localhost:' + PORT);
});
