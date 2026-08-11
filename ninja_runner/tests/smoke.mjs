import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const manifest = JSON.parse(read('assets/asset_manifest.json'));
assert.equal(manifest.manifestVersion, '3.0');
assert.equal(manifest.parts.length, 21);

const outfits = JSON.parse(read('assets/outfits.json'));
assert.deepEqual(Object.keys(outfits.slots).sort(), ['back', 'clothing', 'hair', 'weapon']);
for (const [slot, options] of Object.entries(outfits.slots)) {
  assert.equal(options.length, 2, `${slot}: se esperaban dos opciones`);
  for (const option of options) {
    assert.ok(fs.existsSync(path.join(root, option.icon)), `Falta icono ${option.icon}`);
    if (!option.manifest) continue;
    const optionManifest = JSON.parse(read(option.manifest));
    const available = new Set(optionManifest.parts.map(part => part.partName || part.linkageName));
    for (const partName of option.parts) assert.ok(available.has(partName), `${option.id}: falta ${partName}`);
  }
}
const classicBack = outfits.slots.back.find(option => option.id === 'classic');
const replacementBack = outfits.slots.back.find(option => option.id === 'back_item_351');
assert.ok(!classicBack.suppressParts?.includes('back'), 'El estandarte clásico debe conservar la pieza base back');
assert.ok(replacementBack.suppressParts?.includes('back'), 'El accesorio alternativo debe ocultar la pieza base back');

const timelines = ['idle', 'crouch', 'run', 'jump', 'attack', 'hit', 'death'];
for (const name of timelines) {
  const timeline = JSON.parse(read(`assets/${name}_animation.json`));
  assert.ok(timeline.layers.length > 1, `${name}: faltan capas`);
  assert.ok(timeline.frameCount > 1, `${name}: faltan frames`);
}

for (const part of manifest.parts) {
  assert.ok(fs.existsSync(path.join(root, 'assets', part.png)), `Falta ${part.png}`);
}

const html = read('index.html');
for (const id of ['gameViewport', 'background', 'stage', 'fx', 'startBtn', 'retryBtn', 'status', 'reset', 'raceHud', 'latencyHud', 'playerNameInput', 'enemyKunaiToggle', 'touchControls']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Falta #${id}`);
}
assert.match(html, /mobile-controls-note/, 'Falta la guía de controles para móvil');
assert.match(html, /id=["']enemyKunaiToggle["'][^>]*hidden/, 'El control rival debe ocultarse fuera de la carrera');

const styles = read('src/styles.css');
assert.match(styles, /@media \(max-width: 600px\)/, 'Falta el layout vertical para móvil');
assert.match(styles, /@media \(max-height: 500px\) and \(orientation: landscape\)/, 'Falta el layout horizontal para móvil');
assert.match(styles, /safe-area-inset-bottom/, 'Los controles deben respetar el área segura del teléfono');

const game = read('src/game.js');
const runtime = read('src/runtime.js');
const network = read('src/network.js');
const server = read('server.js');
assert.match(game, /kunai\.x -= game\.speed \* dt/, 'El kunai debe moverse a la izquierda');
assert.match(game, /setRunnerAutoRun\(true\)/, 'El ninja debe comenzar a correr automáticamente');
assert.match(game, /spawnExplosion\(contactX, kunai\.y, 'player'\)/, 'Falta el efecto del choque');
assert.match(game, /role: 'rival'/, 'Falta el corredor rival');
assert.match(game, /function tickRival\(now\)/, 'Falta la inteligencia del bot rival');
assert.match(game, /kunai\.lane === 'rival'/, 'El rival debe recibir kunais en su propia senda');
assert.match(runtime, /commandsForRunnerView\(view, now\)/, 'El rival debe reproducir sus acciones');
assert.match(runtime, /isPartSuppressedByLoadout/, 'Los slots exclusivos deben ocultar piezas base incompatibles');
assert.match(runtime, /runnerAutoRunActive/, 'La carrera automática debe sobrevivir a cambios de foco');
assert.match(runtime, /runnerMode && \(key === 'a' \|\| key === 'd'\)/, 'A y D deben quedar deshabilitadas en modo runner');
assert.match(game, /applyRemoteState/, 'Falta sincronizar el estado del rival online');
assert.match(game, /fallBackToBot/, 'Falta continuar contra el bot al perder conexión');
assert.match(game, /const phase = Number.isFinite/, 'El kunai remoto necesita una fase visual válida');
assert.match(game, /setEnemyKunaisVisible/, 'Falta el control para mostrar u ocultar kunais rivales');
assert.match(game, /enemyKunaiToggle\.hidden = false/, 'El ojo debe aparecer al comenzar la carrera');
assert.match(game, /function returnToLobby\(\)/, 'La revancha debe volver al lobby antes de buscar rival');
assert.match(game, /function tickRemotePose\(now\)/, 'Falta el búfer de poses del rival remoto');
assert.match(game, /detail\.type === 'latency'/, 'Falta mostrar la latencia online');
assert.match(game, /enemy_kunais_visible_v2/, 'La visibilidad rival debe iniciar activa en la versión actual');
assert.match(game, /setPlayerName/, 'Falta configurar el nombre del jugador');
assert.match(network, /type: 'state'/, 'Falta enviar el estado por WebSocket');
assert.match(network, /type: 'ping'/, 'Falta medir la latencia WebSocket');
assert.match(server, /type: 'pong'/, 'El servidor debe responder las mediciones de latencia');
assert.match(network, /kunai-spawn/, 'El nacimiento del kunai debe viajar aunque el render quede en segundo plano');
assert.match(server, /type: 'match-found'/, 'Falta el matchmaking del servidor');
assert.match(game, /loadout-card/, 'Falta el selector de vestimenta');

console.log(`OK: ${manifest.parts.length} piezas, ${timelines.length} animaciones, multijugador y bot.`);
