'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
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
    x: clamp(finite(kunai.x), -120, 1900),
    height: kunai.height === 'high' ? 'high' : 'low',
    lane: kunai.lane === 'rival' ? 'rival' : 'player',
    linkId: safeText(kunai.linkId, 40),
    phase: clamp(finite(kunai.phase), 0, Math.PI * 2),
    resolved: Boolean(kunai.resolved)
  };
}

function sanitizeDuoEvent(value) {
  const event = value && typeof value === 'object' ? value : {};
  const allowedKinds = new Set([
    'pickup-spawn', 'pickup-collected', 'core-spawn', 'core-resolved',
    'sync', 'ultimate-ready', 'ultimate', 'heal', 'pattern-cue', 'team-rescue',
    'flow-projectile', 'flow-pickup', 'flow-resolved', 'flow-pickup-collected'
  ]);
  return {
    kind: allowedKinds.has(event.kind) ? event.kind : '',
    id: safeText(event.id, 40),
    pickupKind: ['shield', 'medkit', 'blade', 'blast', 'life'].includes(event.pickupKind)
      ? event.pickupKind : 'sync',
    projectileKind: event.projectileKind === 'violet' ? 'violet' : 'white',
    lane: event.lane === 'rival' ? 'rival' : 'player',
    targetLane: event.targetLane === 'rival' ? 'rival' : 'player',
    cue: safeText(event.cue, 48),
    plan: safeText(event.plan, 72),
    x: clamp(finite(event.x), -120, 1900),
    y: clamp(finite(event.y), 150, 570),
    vy: clamp(finite(event.vy), -120, 120),
    phase: clamp(finite(event.phase), 0, Math.PI * 2),
    amount: clamp(finite(event.amount), 0, 30)
  };
}

function sanitizeStats(value) {
  const stats = value && typeof value === 'object' ? value : {};
  return {
    score: Math.round(clamp(finite(stats.score), 0, 99999999)),
    meters: clamp(finite(stats.meters), 0, 1200),
    dodges: Math.round(clamp(finite(stats.dodges), 0, 99999)),
    cuts: Math.round(clamp(finite(stats.cuts), 0, 99999)),
    attacks: Math.round(clamp(finite(stats.attacks), 0, 99999)),
    hitsReceived: Math.round(clamp(finite(stats.hitsReceived), 0, 99999)),
    maxCombo: Math.round(clamp(finite(stats.maxCombo), 0, 99999)),
    durationMs: Math.round(clamp(finite(stats.durationMs), 0, 60 * 60 * 1000))
  };
}

function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const allowedModes = new Set(['run', 'jump', 'duck', 'attack', 'hit', 'dead']);
  return {
    name: sanitizeName(source.name),
    meters: clamp(finite(source.meters), 0, 1200),
    flowY: clamp(finite(source.flowY, 520), 260, 610),
    flowX: clamp(finite(source.flowX, 520), 270, 780),
    flowSwordCharges: Math.round(clamp(finite(source.flowSwordCharges, 2), 0, 8)),
    mode: allowedModes.has(source.mode) ? source.mode : 'run',
    lane: source.lane === 'rival' ? 'rival' : 'player',
    shield: Boolean(source.shield),
    shieldMs: clamp(finite(source.shieldMs), 0, 10000),
    actionAge: clamp(finite(source.actionAge), 0, 3000),
    lives: Math.round(clamp(finite(source.lives, 3), 0, 3)),
    score: Math.round(clamp(finite(source.score), 0, 99999999)),
    speed: clamp(finite(source.speed, 375), 0, 900),
    stats: sanitizeStats(source.stats),
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
  const encodedAssetCache = new Map();

  const compressAsset = (filePath, stats, encoding) => {
    const cacheKey = `${filePath}:${stats.size}:${Math.floor(stats.mtimeMs)}:${encoding}`;
    if (encodedAssetCache.has(cacheKey)) return encodedAssetCache.get(cacheKey);
    const pending = fs.promises.readFile(filePath).then(source => new Promise((resolve, reject) => {
      const callback = (error, result) => error ? reject(error) : resolve(result);
      if (encoding === 'br') {
        zlib.brotliCompress(source, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 }
        }, callback);
      } else {
        zlib.gzip(source, { level: 6 }, callback);
      }
    })).catch(error => {
      encodedAssetCache.delete(cacheKey);
      throw error;
    });
    encodedAssetCache.set(cacheKey, pending);
    return pending;
  };

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
    clearTimeout(room.cleanupTimer);
    rooms.delete(room.id);
    const peer = room.players.find(player => player !== client);
    if (peer) {
      peer.matchId = null;
      peer.state = 'idle';
      if (notifyPeer) send(peer, { type: 'opponent-left', matchId: room.id });
    }
  };

  const startRoom = (room, rematch = false) => {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
    room.finished = false;
    room.rematchReady = new Set();
    const startAt = Date.now() + 3200;
    for (const [index, client] of room.players.entries()) {
      const opponent = room.players[index === 0 ? 1 : 0];
      client.state = 'playing';
      client.matchId = room.id;
      client.lastState = null;
      client.lastStats = null;
      client.finishedRun = false;
      send(client, {
        type: 'match-found',
        matchId: room.id,
        playerId: client.id,
        opponentId: opponent.id,
        playerName: client.profile.name,
        opponentName: opponent.profile.name,
        opponentLoadout: opponent.profile.loadout,
        gameType: room.gameType,
        duoHost: (room.gameType === 'duo' || room.gameType === 'flow') && index === 0,
        startAt,
        serverTime: Date.now(),
        rematch
      });
    }
  };

  const startMatch = (first, second) => {
    removeFromQueue(first);
    removeFromQueue(second);
    const room = {
      id: crypto.randomUUID(),
      players: [first, second],
      gameType: first.profile.gameType,
      finished: false,
      rematchReady: new Set(),
      cleanupTimer: null
    };
    rooms.set(room.id, room);
    startRoom(room);
  };

  const queueClient = (client, profile) => {
    if (client.matchId) releaseRoom(client);
    removeFromQueue(client);
    client.profile = {
      name: sanitizeName(profile?.name),
      loadout: sanitizeLoadout(profile?.loadout),
      gameType: ['duo', 'flow'].includes(profile?.gameType) ? 'flow' : 'competitive'
    };

    const opponent = waiting.find(candidate =>
      candidate !== client &&
      candidate.ws.readyState === WebSocket.OPEN &&
      candidate.state === 'waiting' &&
      candidate.profile.gameType === client.profile.gameType
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

  const finishMatch = (client, reason, stats) => {
    const room = rooms.get(client.matchId);
    if (!room || room.finished) return;
    client.lastStats = sanitizeStats(stats || client.lastState?.stats);
    const cooperative = room.gameType === 'duo' || room.gameType === 'flow';
    if (cooperative && reason !== 'knockout') {
      client.finishedRun = true;
      if (!room.players.every(player => player.finishedRun)) return;
    }
    room.finished = true;
    room.rematchReady.clear();
    const opponent = room.players.find(player => player !== client);
    const success = cooperative && reason !== 'knockout';
    const winner = cooperative ? null : (reason === 'knockout' ? opponent : client);
    for (const player of room.players) {
      const rival = room.players.find(candidate => candidate !== player);
      const playerStats = player.lastStats || sanitizeStats(player.lastState?.stats);
      const opponentStats = rival.lastStats || sanitizeStats(rival.lastState?.stats);
      send(player, {
        type: 'match-finished',
        matchId: room.id,
        winnerId: winner?.id || null,
        success,
        reason: reason === 'knockout' ? 'knockout' : 'finish',
        playerStats,
        opponentStats
      });
      player.state = 'finished';
    }
    room.cleanupTimer = setTimeout(() => {
      if (rooms.get(room.id) !== room) return;
      rooms.delete(room.id);
      for (const player of room.players) {
        player.matchId = null;
        player.state = 'idle';
        send(player, { type: 'rematch-expired', matchId: room.id });
      }
    }, 45000);
    room.cleanupTimer.unref();
  };

  const requestRematch = client => {
    const room = rooms.get(client.matchId);
    if (!room) {
      send(client, { type: 'rematch-expired', matchId: client.matchId || null });
      client.matchId = null;
      client.state = 'idle';
      return;
    }
    if (!room.finished || client.state !== 'finished') return;
    room.rematchReady.add(client.id);
    for (const player of room.players) {
      send(player, {
        type: 'rematch-status',
        readyCount: room.rematchReady.size,
        requestedBy: client.id
      });
    }
    if (room.rematchReady.size === room.players.length) startRoom(room, true);
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
    fs.stat(filePath, async (statError, stats) => {
      if (statError || !stats.isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      const isLiveCode = ['.html', '.js', '.css'].includes(extension);
      const quote = String.fromCharCode(34);
      const etag = 'W/' + quote + stats.size.toString(16) + '-' +
        Math.floor(stats.mtimeMs).toString(16) + quote;
      const baseHeaders = {
        'content-type': MIME_TYPES[extension] || 'application/octet-stream',
        'cache-control': isLiveCode ? 'no-cache' : 'public, max-age=3600, must-revalidate',
        'etag': etag,
        'last-modified': stats.mtime.toUTCString(),
        'x-content-type-options': 'nosniff',
        'vary': 'Accept-Encoding'
      };
      if (request.headers['if-none-match'] === etag) {
        response.writeHead(304, baseHeaders).end();
        return;
      }
      const compressible = stats.size >= 1024 &&
        ['.html', '.js', '.css', '.json', '.svg'].includes(extension);
      const accepted = String(request.headers['accept-encoding'] || '');
      const encoding = compressible && /(?:^|,)\s*br\s*(?:,|$)/i.test(accepted)
        ? 'br'
        : (compressible && /(?:^|,)\s*gzip\s*(?:,|$)/i.test(accepted) ? 'gzip' : '');
      if (!encoding) {
        response.writeHead(200, { ...baseHeaders, 'content-length': stats.size });
        if (request.method === 'HEAD') response.end();
        else fs.createReadStream(filePath).pipe(response);
        return;
      }
      try {
        const payload = await compressAsset(filePath, stats, encoding);
        response.writeHead(200, {
          ...baseHeaders,
          'content-encoding': encoding,
          'content-length': payload.length
        });
        response.end(request.method === 'HEAD' ? undefined : payload);
      } catch (_) {
        response.writeHead(200, { ...baseHeaders, 'content-length': stats.size });
        if (request.method === 'HEAD') response.end();
        else fs.createReadStream(filePath).pipe(response);
      }
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

      if (message.type === 'ping') {
        send(client, {
          type: 'pong',
          sentAt: finite(message.sentAt),
          serverTime: Date.now()
        });
      } else if (message.type === 'queue') {
        queueClient(client, message.profile);
      } else if (message.type === 'leave') {
        removeFromQueue(client);
        releaseRoom(client);
      } else if (message.type === 'state' && client.state === 'playing') {
        const room = rooms.get(client.matchId);
        const opponent = room?.players.find(player => player !== client);
        client.lastState = sanitizeState(message.state);
        send(opponent, { type: 'opponent-state', state: client.lastState });
      } else if (message.type === 'kunai-spawn' && client.state === 'playing') {
        const room = rooms.get(client.matchId);
        const opponent = room?.players.find(player => player !== client);
        send(opponent, { type: 'opponent-kunai-spawn', kunai: sanitizeKunai(message.kunai) });
      } else if (message.type === 'duo-event' && client.state === 'playing') {
        const room = rooms.get(client.matchId);
        if (!['duo', 'flow'].includes(room?.gameType)) return;
        const opponent = room.players.find(player => player !== client);
        const duoEvent = sanitizeDuoEvent(message.event);
        if (duoEvent.kind) send(opponent, { type: 'opponent-duo-event', event: duoEvent });
      } else if (message.type === 'finish' && client.state === 'playing') {
        finishMatch(client, message.reason, message.stats);
      } else if (message.type === 'rematch') {
        requestRematch(client);
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

module.exports = { createNinjaServer, sanitizeDuoEvent, sanitizeKunai, sanitizeName, sanitizeState };
