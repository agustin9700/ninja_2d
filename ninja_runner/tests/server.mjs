import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createNinjaServer } = require('../server.js');

assert.equal(typeof WebSocket, 'function', 'La prueba necesita un cliente WebSocket disponible');

class TestClient {
  constructor(url) {
    this.messages = [];
    this.waiters = [];
    this.socket = new WebSocket(url);
    this.opened = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      this.messages.push(message);
      for (const waiter of [...this.waiters]) waiter();
    });
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  async waitFor(type, timeoutMs = 2000) {
    const find = () => {
      const index = this.messages.findIndex(message => message.type === type);
      return index >= 0 ? this.messages.splice(index, 1)[0] : null;
    };
    const existing = find();
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters = this.waiters.filter(waiter => waiter !== check);
        reject(new Error('Timeout esperando mensaje: ' + type));
      }, timeoutMs);
      const check = () => {
        const message = find();
        if (!message) return;
        clearTimeout(timeout);
        this.waiters = this.waiters.filter(waiter => waiter !== check);
        resolve(message);
      };
      this.waiters.push(check);
    });
  }

  close() {
    this.socket.close();
  }
}

const app = createNinjaServer({ host: '127.0.0.1', port: 0, matchWaitMs: 120 });
const address = await app.listen();
const origin = 'http://127.0.0.1:' + address.port;
const websocketUrl = 'ws://127.0.0.1:' + address.port + '/ws';

try {
  const pageResponse = await fetch(origin + '/');
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /id="networkStatus"/);

  const first = new TestClient(websocketUrl);
  const second = new TestClient(websocketUrl);
  await Promise.all([first.opened, second.opened]);
  const [firstHello, secondHello] = await Promise.all([
    first.waitFor('hello'),
    second.waitFor('hello')
  ]);

  const pingSentAt = Date.now();
  first.send({ type: 'ping', sentAt: pingSentAt });
  const pong = await first.waitFor('pong');
  assert.equal(pong.sentAt, pingSentAt);
  assert.ok(Number.isFinite(pong.serverTime));

  first.send({ type: 'queue', profile: { name: 'Akira', loadout: { hair: 'classic' } } });
  await first.waitFor('searching');
  second.send({ type: 'queue', profile: { name: 'Yuki', loadout: { hair: 'hair_83_0' } } });
  const [firstMatch, secondMatch] = await Promise.all([
    first.waitFor('match-found'),
    second.waitFor('match-found')
  ]);
  assert.equal(firstMatch.matchId, secondMatch.matchId);
  assert.equal(firstMatch.startAt, secondMatch.startAt);
  assert.ok(firstMatch.startAt >= Date.now() + 2500);
  assert.equal(firstMatch.opponentId, secondHello.clientId);
  assert.equal(secondMatch.opponentId, firstHello.clientId);
  assert.equal(firstMatch.playerName, 'Akira');
  assert.equal(firstMatch.opponentName, 'Yuki');
  assert.equal(secondMatch.opponentName, 'Akira');
  assert.equal(firstMatch.opponentLoadout.hair, 'hair_83_0');

  first.send({
    type: 'kunai-spawn',
    kunai: { id: 6, x: 910, height: 'high', phase: 2.25, resolved: false }
  });
  const spawnedKunai = await second.waitFor('opponent-kunai-spawn');
  assert.deepEqual(spawnedKunai.kunai, {
    id: '6',
    x: 910,
    height: 'high',
    phase: 2.25,
    resolved: false
  });

  first.send({
    type: 'state',
    state: {
      meters: 42.5,
      name: 'Akira',
      mode: 'jump',
      actionAge: 110,
      lives: 2,
      speed: 410,
      loadout: { hair: 'classic' },
      kunais: [{ id: 7, x: 777, height: 'low', phase: 1.75, resolved: false }],
      explosions: []
    }
  });
  const relayed = await second.waitFor('opponent-state');
  assert.equal(relayed.state.meters, 42.5);
  assert.equal(relayed.state.name, 'Akira');
  assert.equal(relayed.state.mode, 'jump');
  assert.equal(relayed.state.kunais[0].x, 777);
  assert.equal(relayed.state.kunais[0].phase, 1.75);

  second.send({
    type: 'state',
    state: {
      name: 'Yuki',
      meters: 735,
      score: 2200,
      stats: {
        score: 2200,
        meters: 735,
        dodges: 8,
        cuts: 5,
        attacks: 7,
        hitsReceived: 1,
        maxCombo: 6,
        durationMs: 41800
      }
    }
  });
  await first.waitFor('opponent-state');

  first.send({
    type: 'finish',
    reason: 'finish',
    stats: {
      score: 3100,
      meters: 800,
      dodges: 11,
      cuts: 7,
      attacks: 9,
      hitsReceived: 1,
      maxCombo: 9,
      durationMs: 40500
    }
  });
  const [firstFinished, secondFinished] = await Promise.all([
    first.waitFor('match-finished'),
    second.waitFor('match-finished')
  ]);
  assert.equal(firstFinished.winnerId, firstHello.clientId);
  assert.equal(secondFinished.winnerId, firstHello.clientId);
  assert.equal(firstFinished.playerStats.cuts, 7);
  assert.equal(firstFinished.opponentStats.dodges, 8);
  assert.equal(secondFinished.opponentStats.score, 3100);

  first.send({ type: 'rematch' });
  const [firstReady, secondReady] = await Promise.all([
    first.waitFor('rematch-status'),
    second.waitFor('rematch-status')
  ]);
  assert.equal(firstReady.readyCount, 1);
  assert.equal(secondReady.readyCount, 1);
  second.send({ type: 'rematch' });
  const [firstRematch, secondRematch] = await Promise.all([
    first.waitFor('match-found'),
    second.waitFor('match-found')
  ]);
  assert.equal(firstRematch.matchId, firstMatch.matchId);
  assert.equal(secondRematch.matchId, firstMatch.matchId);
  assert.equal(firstRematch.startAt, secondRematch.startAt);
  assert.equal(firstRematch.rematch, true);
  assert.ok(firstRematch.startAt >= Date.now() + 2500);

  first.send({ type: 'leave' });
  await second.waitFor('opponent-left');
  first.close();
  second.close();

  const solo = new TestClient(websocketUrl);
  await solo.opened;
  await solo.waitFor('hello');
  solo.send({ type: 'queue', profile: { loadout: {} } });
  await solo.waitFor('searching');
  const fallback = await solo.waitFor('bot-fallback');
  assert.equal(fallback.reason, 'timeout');
  solo.close();

  const health = await fetch(origin + '/health').then(response => response.json());
  assert.equal(health.matches, 0);
  assert.equal(health.waiting, 0);
  console.log('OK: matchmaking, salida sincronizada, resultados, revancha y fallback a bot.');
} finally {
  await app.close();
}
