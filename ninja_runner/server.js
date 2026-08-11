'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { WebSocket, WebSocketServer } = require('./server/websocket-server');

const ROOT = __dirname;
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeText = (value, maximum = 64) => String(value || '').slice(0, maximum);

function sanitizeName(value) {
  const characters = Array.from(String(value || '').normalize('NFKC'))
    .filter(character => {
      const code = character.codePointAt(0);
      return code >= 32 && code !== 127 && character !== '<' && character !== '>';
    })
    .slice(0, 18);
  return characters.join('').trim().split(' ').filter(Boolean).join(' ') || 'Ninja';
}

function sanitizeLoadout(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    clothing: safeText(source.clothing),
    hair: safeText(source.hair),
    weapon: safeText(source.weapon),
    back: safeText(source.back)
  };
}

function sanitizeKunai(value) {
  const kunai = value && typeof value === 'object' ? value : {};
  return {
    id: safeText(kunai.id, 32),
    x: clamp(finite(kunai.x), -120, 1200),
    height: kunai.height === 'high' ? 'high' : 'low',
    phase: clamp(finite(kunai.phase), 0, Math.PI * 2),
    resolved: Boolean(kunai.resolved)
  };
}

function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const allowedModes = new Set(['run', 'jump', 'duck', 'attack', 'hit', 'dead']);
  return {
    name: sanitizeName(source.name),
    meters: clamp(finite(source.meters), 0, 800),
    mode: allowedModes.has(source.mode) ? source.mode : 'run',
    actionAge: clamp(finite(source.actionAge), 0, 3000),
    lives: Math.round(clamp(finite(source.lives, 3), 0, 3)),
    score: Math.round(clamp(finite(source.score), 0, 99999999)),
    speed: clamp(finite(source.speed, 375), 0, 900),
    loadout: sanitizeLoadout(source.loadout),
    kunais: Array.isArray(source.kunais) ? source.kunais.slice(0, 12).map(sanitizeKunai) : [],
    explosions: Array.isArray(source.explosions) ? source.explosions.slice(0, 6).map(explosion => ({
      x: clamp(finite(explosion?.x), -100, 1100),
      y: clamp(finite(explosion?.y), 0, 700),
      age: clamp(finite(explosion?.age), 0, 1)
    })) : []
  };
}

function createNinjaServer(options = {}) {
  const port = options.port ?? Number(process.env.PORT || 8080);
  const host = options.host || process.env.HOST || '0.0.0.0';
  const matchWaitMs = clamp(
    options.matchWaitMs ?? Number(process.env.MATCH_WAIT_MS || 4000),
    50,
    30000
  );
  const clients = new Map();
  const rooms = new Map();
  const waiting = [];

  const send = (client, message) => {
    if (client?.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(message));
  };

  const removeFromQueue = client => {
    const index = waiting.indexOf(client);
    if (index >= 0) waiting.splice(index, 1);
    if (client.queueTimer) clearTimeout(client.queueTimer);
    client.queueTimer = null;
    if (client.state === 'waiting') client.state = 'idle';
  };

  const releaseRoom = (client, notifyPeer = true) => {
    if (!client.matchId) return;
    const room = rooms.get(client.matchId);
    client.matchId = null;
    client.state = 'idle';
    if (!room) return;
    rooms.delete(room.id);
    const peer = room.players.find(player => player !== client);
    if (peer) {
      peer.matchId = null;
      peer.state = 'idle';
      if (notifyPeer) send(peer, { type: 'opponent-left', matchId: room.id });
    }
  };

  const startMatch = (first, second) => {
    removeFromQueue(first);
    removeFromQueue(second);
    const room = {
      id: crypto.randomUUID(),
      players: [first, second],
      finished: false
    };
    rooms.set(room.id, room);
    const startAt = Date.now() + 1600;
    for (const [index, client] of room.players.entries()) {
      const opponent = room.players[index === 0 ? 1 : 0];
      client.state = 'playing';
      client.matchId = room.id;
      send(client, {
        type: 'match-found',
        matchId: room.id,
        playerId: client.id,
        opponentId: opponent.id,
        playerName: client.profile.name,
        opponentName: opponent.profile.name,
        opponentLoadout: opponent.profile.loadout,
        startAt,
        serverTime: Date.now()
      });
    }
  };

  const queueClient = (client, profile) => {
    if (client.state === 'playing') releaseRoom(client);
    removeFromQueue(client);
    client.profile = {
      name: sanitizeName(profile?.name),
      loadout: sanitizeLoadout(profile?.loadout)
    };

    const opponent = waiting.find(candidate =>
      candidate !== client &&
      candidate.ws.readyState === WebSocket.OPEN &&
      candidate.state === 'waiting'
    );
    if (opponent) {
      startMatch(opponent, client);
      return;
    }

    client.state = 'waiting';
    waiting.push(client);
    send(client, { type: 'searching', timeoutMs: matchWaitMs });
    client.queueTimer = setTimeout(() => {
      if (client.state !== 'waiting') return;
      removeFromQueue(client);
      send(client, { type: 'bot-fallback', reason: 'timeout' });
    }, matchWaitMs);
  };

  const finishMatch = (client, reason) => {
    const room = rooms.get(client.matchId);
    if (!room || room.finished) return;
    room.finished = true;
    const opponent = room.players.find(player => player !== client);
    const winner = reason === 'knockout' ? opponent : client;
    for (const player of room.players) {
      send(player, {
        type: 'match-finished',
        matchId: room.id,
        winnerId: winner?.id || client.id,
        reason: reason === 'knockout' ? 'knockout' : 'finish'
      });
      player.matchId = null;
      player.state = 'idle';
    }
    rooms.delete(room.id);
  };

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');
    if (requestUrl.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        ok: true,
        players: clients.size,
        waiting: waiting.length,
        matches: rooms.size
      }));
      return;
    }

    let relativePath;
    try {
      relativePath = decodeURIComponent(requestUrl.pathname).replace(new RegExp('^/+'), '') || 'index.html';
    } catch (_) {
      response.writeHead(400).end('Bad request');
      return;
    }
    const filePath = path.resolve(ROOT, relativePath);
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(filePath, (statError, stats) => {
      if (statError || !stats.isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      const isLiveCode = ['.html', '.js', '.css'].includes(extension);
      response.writeHead(200, {
        'content-type': MIME_TYPES[extension] || 'application/octet-stream',
        'cache-control': isLiveCode ? 'no-cache' : 'public, max-age=3600'
      });
      fs.createReadStream(filePath).pipe(response);
    });
  });

  const websocketServer = new WebSocketServer({ noServer: true, clientTracking: false, maxPayload: 128 * 1024 });
  server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');
    if (requestUrl.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, ws => websocketServer.emit('connection', ws));
  });

  websocketServer.on('connection', ws => {
    const client = {
      id: crypto.randomUUID(),
      ws,
      state: 'idle',
      matchId: null,
      queueTimer: null,
      profile: { name: 'Ninja', loadout: {} },
      alive: true
    };
    clients.set(client.id, client);
    ws.on('pong', () => { client.alive = true; });
    send(client, { type: 'hello', clientId: client.id, serverTime: Date.now(), matchWaitMs });

    ws.on('message', raw => {
      if (raw.length > 128 * 1024) return;
      let message;
      try { message = JSON.parse(raw.toString()); } catch (_) { return; }
      if (!message || typeof message.type !== 'string') return;

      if (message.type === 'queue') {
        queueClient(client, message.profile);
      } else if (message.type === 'leave') {
        removeFromQueue(client);
        releaseRoom(client);
      } else if (message.type === 'state' && client.state === 'playing') {
        const room = rooms.get(client.matchId);
        const opponent = room?.players.find(player => player !== client);
        send(opponent, { type: 'opponent-state', state: sanitizeState(message.state) });
      } else if (message.type === 'kunai-spawn' && client.state === 'playing') {
        const room = rooms.get(client.matchId);
        const opponent = room?.players.find(player => player !== client);
        send(opponent, { type: 'opponent-kunai-spawn', kunai: sanitizeKunai(message.kunai) });
      } else if (message.type === 'finish' && client.state === 'playing') {
        finishMatch(client, message.reason);
      }
    });

    ws.on('close', () => {
      removeFromQueue(client);
      releaseRoom(client);
      clients.delete(client.id);
    });
    ws.on('error', () => { /* close performs cleanup */ });
  });

  const heartbeat = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.alive) {
        client.ws.terminate();
        continue;
      }
      client.alive = false;
      client.ws.ping();
    }
  }, 30000);
  heartbeat.unref();

  return {
    server,
    clients,
    rooms,
    waiting,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve(server.address());
      });
    }),
    close: () => new Promise(resolve => {
      clearInterval(heartbeat);
      for (const client of clients.values()) client.ws.terminate();
      websocketServer.close();
      server.close(() => resolve());
    })
  };
}

if (require.main === module) {
  const app = createNinjaServer();
  app.listen().then(address => {
    const shownHost = address.address === '::' || address.address === '0.0.0.0' ? '127.0.0.1' : address.address;
    console.log('Ninja Runner listo en http://' + shownHost + ':' + address.port);
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createNinjaServer, sanitizeKunai, sanitizeName, sanitizeState };
