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

  const timelineResponse = await fetch(origin + '/assets/jump_animation.json', {
    headers: { 'accept-encoding': 'br' }
  });
  assert.equal(timelineResponse.status, 200);
  assert.equal(timelineResponse.headers.get('content-encoding'), 'br',
    'Los timelines grandes deben viajar comprimidos con Brotli');
  assert.match(timelineResponse.headers.get('cache-control') || '', /max-age=3600/,
    'Los assets deben poder reutilizarse desde la cache del navegador');
  const timelineEtag = timelineResponse.headers.get('etag');
  assert.ok(timelineEtag, 'Los assets deben incluir ETag');
  await timelineResponse.arrayBuffer();
  const cachedTimelineResponse = await fetch(origin + '/assets/jump_animation.json', {
    headers: { 'if-none-match': timelineEtag, 'accept-encoding': 'br' }
  });
  assert.equal(cachedTimelineResponse.status, 304,
    'El servidor debe evitar reenviar assets que no cambiaron');

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
    lane: 'player',
    linkId: '',
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

  const duoFirst = new TestClient(websocketUrl);
  const duoSecond = new TestClient(websocketUrl);
  await Promise.all([duoFirst.opened, duoSecond.opened]);
  await Promise.all([duoFirst.waitFor('hello'), duoSecond.waitFor('hello')]);
  duoFirst.send({ type: 'queue', profile: { name: 'Sora', gameType: 'duo', loadout: {} } });
  await duoFirst.waitFor('searching');
  duoSecond.send({ type: 'queue', profile: { name: 'Ren', gameType: 'duo', loadout: {} } });
  const [duoFirstMatch, duoSecondMatch] = await Promise.all([
    duoFirst.waitFor('match-found'),
    duoSecond.waitFor('match-found')
  ]);
  assert.equal(duoFirstMatch.gameType, 'flow',
    'El servidor debe redirigir el Duo antiguo al nuevo Duo');
  assert.equal(duoSecondMatch.gameType, 'flow');
  assert.equal(duoFirstMatch.duoHost, true);
  assert.equal(duoSecondMatch.duoHost, false);

  duoFirst.send({
    type: 'kunai-spawn',
    kunai: { id: 12, x: 930, height: 'low', lane: 'rival', phase: 1.2 }
  });
  const duoKunai = await duoSecond.waitFor('opponent-kunai-spawn');
  assert.equal(duoKunai.kunai.lane, 'rival');

  duoFirst.send({
    type: 'duo-event',
    event: { kind: 'pickup-spawn', id: 'pickup-1', pickupKind: 'shield', lane: 'player', x: 1280 }
  });
  const duoPickup = await duoSecond.waitFor('opponent-duo-event');
  assert.equal(duoPickup.event.kind, 'pickup-spawn');
  assert.equal(duoPickup.event.pickupKind, 'shield');
  assert.equal(duoPickup.event.x, 1280);

  duoSecond.send({ type: 'duo-event', event: { kind: 'sync', amount: 18 } });
  const duoSync = await duoFirst.waitFor('opponent-duo-event');
  assert.equal(duoSync.event.kind, 'sync');
  assert.equal(duoSync.event.amount, 18);

  duoFirst.send({
    type: 'duo-event',
    event: {
      kind: 'pattern-cue',
      cue: 'ROMPAN EL CORE',
      plan: 'UNO ATACA > EL OTRO AVANZA',
      lane: 'player',
      targetLane: 'rival'
    }
  });
  const duoCue = await duoSecond.waitFor('opponent-duo-event');
  assert.equal(duoCue.event.kind, 'pattern-cue');
  assert.equal(duoCue.event.cue, 'ROMPAN EL CORE');
  assert.equal(duoCue.event.plan, 'UNO ATACA > EL OTRO AVANZA');
  assert.equal(duoCue.event.targetLane, 'rival');

  duoSecond.send({ type: 'duo-event', event: { kind: 'team-rescue', lane: 'rival' } });
  const duoRescue = await duoFirst.waitFor('opponent-duo-event');
  assert.equal(duoRescue.event.kind, 'team-rescue');
  assert.equal(duoRescue.event.lane, 'rival');

  duoFirst.send({ type: 'state', state: { meters: 200, lane: 'rival', mode: 'run' } });
  const duoState = await duoSecond.waitFor('opponent-state');
  assert.equal(duoState.state.lane, 'rival');

  duoFirst.send({ type: 'finish', reason: 'finish', stats: { meters: 800, score: 1000 } });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(duoFirst.messages.some(message => message.type === 'match-finished'), false,
    'Duo debe esperar a que ambos lleguen');
  duoSecond.send({ type: 'finish', reason: 'finish', stats: { meters: 800, score: 900 } });
  const [duoFirstFinished, duoSecondFinished] = await Promise.all([
    duoFirst.waitFor('match-finished'),
    duoSecond.waitFor('match-finished')
  ]);
  assert.equal(duoFirstFinished.success, true);
  assert.equal(duoSecondFinished.success, true);
  assert.equal(duoFirstFinished.winnerId, null);
  duoFirst.send({ type: 'leave' });
  await duoSecond.waitFor('opponent-left');
  duoSecond.send({ type: 'rematch' });
  await duoSecond.waitFor('rematch-expired');
  duoFirst.close();
  duoSecond.close();

  const flowFirst = new TestClient(websocketUrl);
  const flowSecond = new TestClient(websocketUrl);
  await Promise.all([flowFirst.opened, flowSecond.opened]);
  await Promise.all([flowFirst.waitFor('hello'), flowSecond.waitFor('hello')]);
  flowFirst.send({ type: 'queue', profile: { name: 'Kaze', gameType: 'flow', loadout: {} } });
  await flowFirst.waitFor('searching');
  flowSecond.send({ type: 'queue', profile: { name: 'Mori', gameType: 'flow', loadout: {} } });
  const [flowFirstMatch, flowSecondMatch] = await Promise.all([
    flowFirst.waitFor('match-found'),
    flowSecond.waitFor('match-found')
  ]);
  assert.equal(flowFirstMatch.gameType, 'flow');
  assert.equal(flowSecondMatch.gameType, 'flow');
  assert.equal(flowFirstMatch.duoHost, true);
  assert.equal(flowSecondMatch.duoHost, false);

  flowFirst.send({
    type: 'duo-event',
    event: {
      kind: 'flow-projectile',
      id: 'flow-kunai-1',
      projectileKind: 'violet',
      x: 1180,
      y: 315,
      vy: -70,
      phase: 2.4
    }
  });
  const flowProjectile = await flowSecond.waitFor('opponent-duo-event');
  assert.equal(flowProjectile.event.kind, 'flow-projectile');
  assert.equal(flowProjectile.event.projectileKind, 'violet');
  assert.equal(flowProjectile.event.y, 315);
  assert.equal(flowProjectile.event.vy, -70);

  flowSecond.send({ type: 'state', state: {
    meters: 640, flowY: 287, flowX: 612, flowSwordCharges: 4,
    shield: true, shieldMs: 6450, mode: 'attack'
  } });
  const flowState = await flowFirst.waitFor('opponent-state');
  assert.equal(flowState.state.flowY, 287);
  assert.equal(flowState.state.flowX, 612);
  assert.equal(flowState.state.flowSwordCharges, 4);
  assert.equal(flowState.state.shield, true);
  assert.equal(flowState.state.shieldMs, 6450);
  assert.equal(flowState.state.meters, 640);

  flowFirst.send({ type: 'finish', reason: 'finish', stats: { meters: 1200, score: 1800 } });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(flowFirst.messages.some(message => message.type === 'match-finished'), false,
    'Flujo debe esperar a que ambos lleguen');
  flowSecond.send({ type: 'finish', reason: 'finish', stats: { meters: 1200, score: 1700 } });
  const [flowFirstFinished, flowSecondFinished] = await Promise.all([
    flowFirst.waitFor('match-finished'),
    flowSecond.waitFor('match-finished')
  ]);
  assert.equal(flowFirstFinished.success, true);
  assert.equal(flowSecondFinished.success, true);
  assert.equal(flowFirstFinished.winnerId, null);
  flowFirst.send({ type: 'leave' });
  await flowSecond.waitFor('opponent-left');
  flowFirst.close();
  flowSecond.close();

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
