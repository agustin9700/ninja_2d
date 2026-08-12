import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const chromePath = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const gameUrl = process.env.FLOW_QA_URL ||
  'http://127.0.0.1:8080/?mode=flow&autostart=1&qa=1';
const debugPort = 9555;
const profileDir = `C:\\tmp\\ninja-flow-browser-qa-${process.pid}`;
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--remote-debugging-port=' + debugPort,
  '--user-data-dir=' + profileDir,
  gameUrl
], { stdio: 'ignore' });

try {
  await delay(1800);
  const targets = await fetch('http://127.0.0.1:' + debugPort + '/json').then(response => response.json());
  const page = targets.find(target => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'Chrome no expuso la pagina del juego');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails.text);
    }
  });
  const call = (method, params = {}) => new Promise(resolve => {
    const id = ++commandId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const message = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return message.result.result.value;
  };

  await call('Runtime.enable');
  const countdownState = JSON.parse(await evaluate(
    'JSON.stringify(window.__ninjaRunner.snapshot())'));
  if (countdownState.countingDown) {
    assert.equal(countdownState.rivalMode, 'idle',
      'El companero no debe correr antes de finalizar la cuenta regresiva');
  }
  await delay(6500);
  const before = JSON.parse(await evaluate('JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.equal(before.gameType, 'flow');
  assert.equal(before.running, true);
  assert.equal(before.rivalMode, 'run',
    'El companero debe empezar a correr junto al jugador');
  assert.ok(before.playerMeters > 0, 'La distancia de Flujo no avanzo');
  assert.equal(before.flowPatternIndex, 0,
    'El modo QA debe aislar la prueba de las oleadas automaticas');
  assert.ok(Number.isFinite(before.rivalFlowY), 'El companero no tiene posicion vertical');
  assert.deepEqual(before.flowLifeLabels, { player: 2, rival: 2 },
    'Ambos ninjas deben comenzar Flujo con dos vidas');
  assert.equal(before.flowSwordCharges, 2,
    'El jugador debe comenzar Duo con dos espadazos');
  assert.equal(before.rivalSwordCharges, 2,
    'El companero debe comenzar Duo con dos espadazos');
  assert.equal(before.rivalLoadout.back, 'classic',
    'El companero bot no debe volver a equipar la mochila verde');
  const backgroundBefore = await evaluate(`(() => {
    const canvas = document.getElementById('background');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 64) {
      hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
    }
    return { hash, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
  })()`);
  await delay(240);
  const backgroundAfter = await evaluate(`(() => {
    const canvas = document.getElementById('background');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 64) {
      hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
    }
    return hash;
  })()`);
  if (!backgroundBefore.reduced) {
    assert.notEqual(backgroundAfter, backgroundBefore.hash,
      'El fondo de Flujo permanece quieto mientras los ninjas avanzan');
  }

  await evaluate('window.__ninjaRunner.setFlowMove(-1)');
  await delay(550);
  await evaluate('window.__ninjaRunner.setFlowMove(0)');
  const after = JSON.parse(await evaluate('JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.ok(after.flowY < before.flowY, 'Mantener Subir no movio al ninja');
  if (!backgroundBefore.reduced) {
    assert.notEqual(after.flowTileOffset, before.flowTileOffset,
      'Las juntas de las baldosas no retrocedieron durante la carrera');
  }
  await evaluate('window.__ninjaRunner.setFlowMoveX(-1)');
  await delay(350);
  await evaluate('window.__ninjaRunner.setFlowMoveX(0)');
  const afterBack = JSON.parse(await evaluate('JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.ok(afterBack.flowX < after.flowX, 'Mantener Atras no movio al ninja a la izquierda');
  await evaluate('window.__ninjaRunner.setFlowMoveX(1)');
  await delay(650);
  await evaluate('window.__ninjaRunner.setFlowMoveX(0)');
  const afterForward = JSON.parse(await evaluate('JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.ok(afterForward.flowX > afterBack.flowX,
    'Mantener Adelante no movio al ninja hacia los kunais');
  assert.equal(afterForward.flowPlayerHitX, afterForward.flowX,
    'La colision debe acompanar el movimiento horizontal');
  let attackReady = false;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    attackReady = await evaluate(`window.__ninjaRunner.snapshot().playerMode === 'run'`);
    if (attackReady) break;
    await delay(50);
  }
  assert.equal(attackReady, true, 'El ninja no recupero el estado de carrera antes del ataque');
  const cutsBefore = afterForward.stats.cuts;
  const bladesBeforeAttack = await evaluate('window.__ninjaRunner.snapshot().flowSwordCharges');
  await evaluate(
    `window.__ninjaRunner.spawnFlowProjectile('white', ` +
    `window.__ninjaRunner.snapshot().flowPlayerHitX + 95, ` +
    `window.__ninjaRunner.snapshot().flowY - 76, 0); window.__ninjaRunner.attack()`
  );
  await delay(280);
  const afterCut = JSON.parse(await evaluate('JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.ok(afterCut.stats.cuts > cutsBefore, 'El espadazo no corto un kunai alineado');
  assert.equal(afterCut.flowSwordCharges, bladesBeforeAttack - 1,
    'Cada intento de espada debe consumir exactamente una carga');

  await delay(500);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }))`);
  await delay(120);
  const keyboardPose = JSON.parse(await evaluate(`JSON.stringify({
    game: window.__ninjaRunner.snapshot(),
    animation: window.NinjaRunnerAnimation.snapshot()
  })`));
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }))`);
  assert.equal(keyboardPose.game.playerMode, 'run',
    'Subir no debe activar el salto en Flujo');
  assert.equal(keyboardPose.animation.running, true,
    'El ninja debe seguir corriendo mientras sube en Flujo');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))`);
  await delay(120);
  const keyboardHorizontal = JSON.parse(await evaluate(
    'JSON.stringify(window.__ninjaRunner.snapshot())'));
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))`);
  assert.ok(keyboardHorizontal.flowX < keyboardPose.game.flowX,
    'A debe atrasar al ninja sin cambiar la animacion de carrera');
  assert.equal(keyboardHorizontal.playerMode, 'run',
    'Atrasarse no debe activar otra animacion');

  const bladesBeforePickup = keyboardPose.game.flowSwordCharges;
  await evaluate(
    `window.__ninjaRunner.spawnFlowPickup('blade', ` +
    `window.__ninjaRunner.snapshot().flowPlayerHitX + 10, ` +
    `window.__ninjaRunner.snapshot().flowY - 76)`
  );
  await delay(70);
  const bladeFeedback = JSON.parse(await evaluate(`JSON.stringify({
    game: window.__ninjaRunner.snapshot(),
    hud: document.getElementById('flowBuffs').textContent,
    swordCounter: document.getElementById('flowSwordCounter').hidden,
    swordCount: document.getElementById('flowSwordCount').textContent
  })`));
  assert.equal(bladeFeedback.game.flowSwordCharges, Math.min(8, bladesBeforePickup + 1),
    'El buff de Filos debe recargar un intento hasta un maximo de ocho');
  assert.match(bladeFeedback.hud, /ESPADAS V\d+\/C\d+/,
    'El HUD debe mostrar las cargas de ambos ninjas');
  assert.equal(bladeFeedback.swordCounter, false,
    'El contador destacado de espadazos debe permanecer visible');
  assert.equal(bladeFeedback.swordCount, String(bladeFeedback.game.flowSwordCharges),
    'El contador destacado debe coincidir con las cargas reales');

  await evaluate(`
    for (let index = 0; index < 2; index += 1) {
      window.__ninjaRunner.spawnFlowPickup('life',
        window.__ninjaRunner.snapshot().flowPlayerHitX + 10,
        window.__ninjaRunner.snapshot().flowY - 76);
      window.__ninjaRunner.spawnFlowPickup('life',
        window.__ninjaRunner.snapshot().flowRivalHitX + 10,
        window.__ninjaRunner.snapshot().rivalFlowY - 76);
    }
  `);
  await delay(140);
  const healedTeam = JSON.parse(await evaluate(
    'JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.deepEqual(healedTeam.flowLifeLabels, { player: 3, rival: 3 },
    'Cada ninja debe poder recolectar vidas hasta un maximo de tres');

  const alignmentStart = JSON.parse(await evaluate(
    'JSON.stringify(window.__ninjaRunner.snapshot())'));
  const alignedFlowY = alignmentStart.rivalFlowY + 2;
  const alignmentDelta = alignedFlowY - alignmentStart.flowY;
  if (Math.abs(alignmentDelta) > 8) {
    await evaluate(`window.__ninjaRunner.setFlowMove(${alignmentDelta > 0 ? 1 : -1})`);
    await delay(Math.min(900, Math.abs(alignmentDelta) / 350 * 1000));
    await evaluate('window.__ninjaRunner.setFlowMove(0)');
  }
  const shieldsBefore = JSON.parse(await evaluate(
    'JSON.stringify(window.__ninjaRunner.snapshot())'));
  await evaluate(
    `window.__ninjaRunner.spawnFlowPickup('shield', ` +
    `window.__ninjaRunner.snapshot().flowPlayerHitX + 10, ` +
    `window.__ninjaRunner.snapshot().flowY - 76)`
  );
  await delay(70);
  const shieldFeedback = JSON.parse(await evaluate(`JSON.stringify({
    game: window.__ninjaRunner.snapshot(),
    hud: document.getElementById('flowBuffs').textContent,
    neon: Object.fromEntries(window.NinjaRunnerScene.getViews().map(view =>
      [view.role, view.neon || '']))
  })`));
  assert.equal(shieldFeedback.game.playerShield, true,
    'El Escudo debe pertenecer al ninja que lo recoge');
  assert.equal(shieldFeedback.game.rivalShield, shieldsBefore.rivalShield,
    'El Escudo local no debe proteger automaticamente al companero');
  assert.match(shieldFeedback.hud, /GUARD VOS (?:9|10)s/,
    'El HUD debe identificar al propietario y el tiempo restante de Guard');
  assert.ok(shieldFeedback.game.playerShieldRemainingMs > 9000 &&
    shieldFeedback.game.playerShieldRemainingMs <= 10000,
  'Guard debe comenzar con diez segundos');
  assert.equal(shieldFeedback.neon.player, '',
    'Guard no debe aplicar filtros neon costosos a las piezas PNG');
  assert.equal(shieldFeedback.neon.rival, '',
    'Guard no debe aplicar filtros neon al companero');
  assert.ok(shieldFeedback.game.flowActorNotices.some(notice =>
    notice.role === 'player' && notice.text.includes('GUARD')),
  'Guard debe mostrar feedback sobre el ninja correcto');
  assert.equal(shieldFeedback.game.flowGuard.frontRole, 'player',
    'El ninja adelantado debe ser reconocido como la primera linea');
  assert.equal(shieldFeedback.game.flowGuard.active, true,
    'El Escudo adelantado y alineado debe activar la cobertura del companero');

  const blastIds = JSON.parse(await evaluate(`JSON.stringify([
    window.__ninjaRunner.spawnFlowProjectile('white', 760, 250, 0)?.id,
    window.__ninjaRunner.spawnFlowProjectile('violet', 820, 470, 0)?.id
  ].filter(Boolean))`));
  assert.ok(blastIds.length > 0, 'No se pudieron crear kunais para probar Explosion Total');
  await evaluate(
    `window.__ninjaRunner.spawnFlowPickup('blast', ` +
    `window.__ninjaRunner.snapshot().flowPlayerHitX + 10, ` +
    `window.__ninjaRunner.snapshot().flowY - 76)`
  );
  await delay(180);
  const blastFeedback = JSON.parse(await evaluate(`JSON.stringify({
    game: window.__ninjaRunner.snapshot(),
    now: performance.now(),
    toast: document.getElementById('toast').textContent
  })`));
  assert.ok(blastIds.every(id => {
    const projectile = blastFeedback.game.flowProjectiles.find(item => item.id === id);
    return !projectile || projectile.dead;
  }), 'Explosion Total debe eliminar todos los kunais activos');
  assert.ok(blastFeedback.game.flowBlastUntil > blastFeedback.now,
    'Explosion Total debe producir un flash visible');
  assert.equal(blastFeedback.game.flowBlastRole, 'player',
    'El flash debe originarse en el ninja que recoge el buff');
  assert.ok(blastFeedback.game.flowActorNotices.some(notice =>
    notice.role === 'player' && notice.text.includes('EXPLOSION TOTAL')),
  'Explosion Total debe indicar sobre el personaje quien la activo');

  const invulnerabilityWait = Math.max(0, Math.min(1800,
    blastFeedback.game.playerInvulnerableUntil - blastFeedback.now + 80));
  if (invulnerabilityWait) await delay(invulnerabilityWait);
  await evaluate(`
    window.__ninjaRunner.spawnFlowPickup('blast',
      window.__ninjaRunner.snapshot().flowPlayerHitX + 10,
      window.__ninjaRunner.snapshot().flowY - 76);
    window.__ninjaRunner.spawnFlowPickup('shield',
      window.__ninjaRunner.snapshot().flowPlayerHitX + 10,
      window.__ninjaRunner.snapshot().flowY - 76);
  `);
  await delay(80);
  const preparedHit = JSON.parse(await evaluate(
    'JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.equal(preparedHit.playerShield, true,
    'La preparacion del QA no pudo activar el Escudo');
  const livesBeforeHit = preparedHit.lives;
  const shieldProjectileId = await evaluate(`window.__ninjaRunner.spawnFlowProjectile('white',
    window.__ninjaRunner.snapshot().flowPlayerHitX + 10,
    window.__ninjaRunner.snapshot().flowY - 76, 0)?.id`);
  await delay(70);
  const shieldBlock = JSON.parse(await evaluate(
    'JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.equal(shieldBlock.playerShield, false,
    'El impacto debe consumir solamente el Escudo del ninja alcanzado');
  assert.equal(shieldBlock.lives, livesBeforeHit,
    'El primer impacto no debe quitar vida cuando hay Escudo');
  assert.equal(shieldBlock.remoteLives, preparedHit.remoteLives,
    'El ninja adelantado debe impedir que el mismo kunai alcance al companero');
  const blockedProjectile = shieldBlock.flowProjectiles.find(
    item => item.id === shieldProjectileId);
  assert.ok(!blockedProjectile || blockedProjectile.dead,
    'El kunai bloqueado no debe atravesar al ninja que cubre');
  assert.ok(shieldBlock.flowActorNotices.some(notice =>
    notice.role === 'player' && notice.text.includes('BLOQUEO')),
  'El bloqueo debe aparecer sobre el ninja alcanzado');

  await delay(650);
  await evaluate(`window.__ninjaRunner.spawnFlowProjectile('white',
    window.__ninjaRunner.snapshot().flowPlayerHitX + 10,
    window.__ninjaRunner.snapshot().flowY - 76, 0)`);
  await delay(70);
  const directHit = JSON.parse(await evaluate(
    'JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.equal(directHit.lives, livesBeforeHit - 1,
    'Un impacto sin Escudo debe quitar una vida al ninja alcanzado');
  assert.equal(directHit.flowLifeLabels.player, livesBeforeHit - 1,
    'La insignia sobre el jugador debe actualizar la vida perdida');
  assert.equal(directHit.flowLifeLabels.rival, preparedHit.remoteLives,
    'La insignia del companero no debe cambiar por un impacto al jugador');
  assert.ok(directHit.flowActorNotices.some(notice =>
    notice.role === 'player' && notice.text.includes('-1 VIDA')),
  'La perdida de vida debe aparecer sobre el ninja alcanzado');

  await evaluate(`window.__ninjaRunner.spawnFlowPickup('shield',
    window.__ninjaRunner.snapshot().flowPlayerHitX + 10,
    window.__ninjaRunner.snapshot().flowY - 76)`);
  await delay(90);
  const timedGuard = JSON.parse(await evaluate(
    'JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.equal(timedGuard.playerShield, true,
    'No se pudo activar Guard para probar su temporizador');
  await delay(10200);
  const expiredGuard = JSON.parse(await evaluate(
    'JSON.stringify(window.__ninjaRunner.snapshot())'));
  assert.equal(expiredGuard.playerShield, false,
    'Guard debe terminar al cumplirse diez segundos');
  assert.equal(expiredGuard.playerShieldRemainingMs, 0,
    'El temporizador de Guard debe quedar en cero al terminar');
  assert.ok(expiredGuard.flowActorNotices.some(notice =>
    notice.role === 'player' && notice.text.includes('GUARD TERMINO')),
  'El final de Guard debe indicarse sobre el ninja correcto');
  assert.deepEqual(exceptions, [], 'Se detectaron excepciones JavaScript');
  socket.close();
  console.log(JSON.stringify({
    meters: Math.round(before.playerMeters),
    patterns: before.flowPatternIndex,
    projectiles: before.flowProjectiles.length,
    playerY: [Math.round(before.flowY), Math.round(after.flowY)],
    playerX: [Math.round(afterBack.flowX), Math.round(afterForward.flowX)],
    rivalY: Math.round(before.rivalFlowY),
    cuts: afterCut.stats.cuts,
    swordCharges: bladeFeedback.game.flowSwordCharges,
    shieldOwner: shieldFeedback.game.playerShield ? 'player' : 'none',
    blastDestroyed: blastIds.length,
    backgroundMoved: backgroundAfter !== backgroundBefore.hash,
    hitFeedback: directHit.lives === livesBeforeHit - 1,
    exceptions: exceptions.length
  }));
} finally {
  chrome.kill('SIGKILL');
  await delay(500);
  try {
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
    console.warn(`Chrome libero tarde su perfil temporal: ${profileDir}`);
  }
}
