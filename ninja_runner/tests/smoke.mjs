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
assert.equal(outfits.defaults.rival.back, 'classic',
  'El companero bot no debe iniciar con la mochila verde');
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
for (const id of ['gameViewport', 'background', 'stage', 'fx', 'startBtn', 'retryBtn', 'status', 'reset', 'raceHud', 'latencyHud', 'flowGuide', 'flowHud', 'playerNameInput', 'enemyKunaiToggle', 'touchControls', 'flowJoystick', 'flowJoystickBase', 'flowJoystickKnob']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Falta #${id}`);
}
assert.match(html, /id=.duoHud./, 'Falta la barra cooperativa de Duo');
assert.match(html, /mobile-controls-note/, 'Falta la guía de controles para móvil');
assert.match(html, /id=["']enemyKunaiToggle["'][^>]*hidden/, 'El control rival debe ocultarse fuera de la carrera');

const styles = read('src/styles.css');
assert.match(styles, /@media \(max-width: 600px\)/, 'Falta el layout vertical para móvil');
assert.match(styles, /@media \(max-height: 500px\) and \(orientation: landscape\)/, 'Falta el layout horizontal para móvil');
assert.match(styles, /safe-area-inset-bottom/, 'Los controles deben respetar el área segura del teléfono');
assert.match(styles, /body\[data-game-type=flow\] #flowJoystick:not\(\[hidden\]\)/,
  'Flujo movil debe ofrecer un joystick tactil');
assert.match(styles, /width:\s*min\(100%, calc\(100dvh \* 1\.8\)\)/,
  'La camara horizontal debe aprovechar mas ancho del navegador');
assert.match(styles, /#gameViewport canvas \{[\s\S]{0,180}height:\s*auto/,
  'La camara ampliada debe conservar la proporcion del canvas');
assert.match(styles, /\.flow-joystick-knob[\s\S]*?will-change:\s*transform/,
  'La perilla del joystick debe moverse en una capa acelerada');

assert.match(styles, /body\[data-game-type=flow\] #raceHud\s*\{\s*display:\s*none/,
  'Duo horizontal debe quitar el panel redundante del area de combate');
assert.match(styles, /@media \(min-width: 601px\)[\s\S]*?#touchControls\s*\{[\s\S]*?display:\s*flex/,
  'Los controles clicables deben permanecer visibles en PC');
assert.match(styles, /#duoHud > i::after[\s\S]*?left:\s*35%/,
  'La barra Duo debe marcar el umbral de rescate');

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
assert.match(game, /enemyKunaiToggle\.hidden = isDuoMode\(\) \|\| isFlowMode\(\)/,
  'El ojo debe aparecer solo en competencia');
assert.doesNotMatch(html, /data-game-type=.duo./,
  'El selector no debe ofrecer el antiguo Duo por carriles');
assert.match(html, /data-game-type=.flow.[\s\S]*?<strong>D&#218;O<\/strong>/,
  'El Flujo actual debe presentarse como el nuevo modo Duo');
assert.match(html, /GU&#205;A DE BUFFS D&#218;O/, 'Falta explicar los buffs del nuevo Duo');
assert.match(html, /id=.btnLane./, 'Falta el control tactil para cambiar de carril');
assert.match(html, /id=.btnBack./, 'Flujo necesita la flecha tactil para atrasarse');
assert.match(html, /id=.btnForward./, 'Flujo necesita la flecha tactil para adelantarse');
assert.match(game, /function setPlayerLane\(/, 'Falta cambiar de carril durante una partida Duo');
assert.match(game, /function spawnDuoPattern\(/, 'Falta el director de patrones Duo');
assert.match(game, /function chooseDuoPattern\(/, 'El director Duo debe variar patrones sin repetirlos');
assert.match(game, /duoPatternSeen/, 'Cada patron Duo debe introducirse antes de aumentar su complejidad');
assert.match(game, /duoResponseGapMs|responseSeconds/, 'Los patrones Duo necesitan separacion temporal legible');
assert.match(game, /function laneThreatState\(/, 'La presion de carril debe considerar urgencia temporal');
assert.match(game, /kind: 'pattern-cue'/, 'Los dos clientes deben compartir la anticipacion del patron');
assert.match(game, /game\.duoCue\.plan/, 'El aviso Duo debe anticipar la secuencia de acciones');
assert.match(game, /function spawnLinkedCore\(/, 'Faltan los nucleos vinculados');
assert.match(game, /function tryTeamRescue\(/, 'La Sincronia debe permitir un rescate cooperativo');
assert.match(server, /'team-rescue'/, 'El rescate cooperativo debe sincronizarse online');
assert.match(game, /function activateDuoUltimate\(/, 'Falta Tormenta Gemela');
assert.match(game, /function setFlowMove\(/, 'Flujo necesita movimiento vertical continuo');
assert.match(game, /function setFlowMoveX\(/, 'Flujo necesita movimiento horizontal continuo');
assert.match(game, /flowMinX:\s*270/,
  'Flujo debe permitir retroceder mas para anticipar los proyectiles');
assert.match(game, /flowMaxX:\s*780/,
  'Flujo debe permitir adelantarse mas para cubrir al companero');
assert.match(server, /flowX:\s*clamp\(finite\(source\.flowX, 520\), 270, 780\)/,
  'El servidor debe conservar los nuevos limites horizontales de Flujo');
assert.match(game, /function setFlowVector\(/, 'El joystick necesita combinar y normalizar ambos ejes');
assert.match(game, /const deadzone = \.15/,
  'El joystick necesita una zona muerta contra movimientos accidentales');
assert.doesNotMatch(html, /btnTouchScheme|USAR CRUZ/,
  'El selector de cruceta no debe ocupar espacio durante Flujo');
assert.match(game, /function spawnFlowPattern\(/, 'Flujo necesita patrones de proyectiles legibles');
assert.match(game, /function updateFlowObjects\(/, 'Flujo necesita resolver impactos, cortes y recoleccion');
assert.match(game, /function predictFlowProjectileY\(/,
  'La IA y las guias deben predecir proyectiles diagonales');
assert.match(game, /flowMaxProjectiles:\s*8/,
  'Flujo debe limitar la cantidad de proyectiles simultaneos');
assert.match(game, /const allowed = \['shield', 'blast', 'blade', 'life'\]/,
  'Flujo debe usar Guard, Explosion Total, Filos y Vida');
assert.match(game, /flowSwordStart:\s*2/,
  'Cada ninja del nuevo Duo debe iniciar con dos espadazos');
assert.match(game, /competitiveSwordStart:\s*5/,
  'Cada corredor de Competencia debe iniciar con cinco espadazos');
assert.match(html, /id="flowSwordCounter"/,
  'Flujo debe mostrar un contador permanente de espadazos');
assert.match(game, /setTextIfChanged\(elements\.flowSwordCount, charges\)/,
  'El contador visible debe actualizar las cargas del jugador');
assert.match(game, /elements\.lives\.replaceChildren\(\.\.\.lifeNodes\)/,
  'El HUD debe crear los iconos de vida una sola vez');
assert.doesNotMatch(game, /function renderHud\(\)[\s\S]{0,500}elements\.lives\.replaceChildren/,
  'El HUD no debe reconstruir las vidas en cada fotograma');
assert.match(game, /flowSwordPickup:\s*2/,
  'El buff de Filos debe recargar dos espadazos');
assert.match(game, /fullLifeSwordPickup:\s*1/,
  'Un corazon con la vida llena debe recargar un espadazo');
assert.match(game, /swordsBefore \+ CONFIG\.fullLifeSwordPickup/,
  'La conversion del corazon debe respetar las cargas del ninja que lo recoge');
assert.match(game, /game\.lives = isFlowMode\(\) \? 2 : 3/,
  'Cada ninja debe comenzar Flujo con dos vidas');
assert.match(game, /game\[key\] = Math\.min\(3, before \+ 1\)/,
  'El buff de Vida debe recuperar hasta un maximo de tres');
assert.match(game, /shieldDurationMs:\s*10000/,
  'Guard debe durar diez segundos');
assert.match(game, /function updateShieldTimers\(now\)/,
  'Guard debe expirar automaticamente');
assert.match(game, /shieldRemainingMs\(game\.player, now\)/,
  'El tiempo restante de Guard debe sincronizarse online');
assert.match(server, /shieldMs:\s*clamp\(finite\(source\.shieldMs\), 0, 10000\)/,
  'El servidor debe validar el tiempo restante de Guard');
assert.match(game, /if \(game\.flowSwordCharges <= 0\)/,
  'Todos los modos deben bloquear el ataque cuando se terminan las cargas');
assert.match(game, /game\.flowSwordCharges = Math\.max\(0, game\.flowSwordCharges - 1\)/,
  'Cada intento de espada debe gastar una carga en todos los modos');
assert.match(game, /game\.rivalSwordCharges = Math\.max\(0, game\.rivalSwordCharges - 1\)/,
  'Los ataques del rival bot tambien deben gastar cargas');
assert.match(game, /else if \(!qaMode\) \{[\s\S]{0,250}game\.spawnClock -= dt/,
  'El modo QA debe poder probar las cargas sin interferencia de proyectiles');
assert.match(game, /function showFlowActorNotice\(/,
  'Los eventos de Flujo deben identificar al ninja afectado');
assert.match(game, /function flowActorHitX\(/,
  'Cada ninja de Flujo necesita su propia linea fisica de impacto');
assert.match(game, /const drawLifeBadge = \(x, y, lives\) =>/,
  'Cada ninja de Flujo debe mostrar sus vidas sobre el personaje');
assert.match(game, /drawLifeBadge\(playerX, centerY - 119, game\.lives\)/,
  'La insignia del jugador debe usar sus vidas reales');
assert.match(game, /drawLifeBadge\(rivalX, rivalY - 119, game\.remoteLives\)/,
  'La insignia del companero debe usar sus vidas reales');
assert.match(game, /const drawSwordBadge = \(x, y, charges\) =>/,
  'Cada ninja de Flujo debe mostrar sus espadazos sobre el personaje');
assert.match(game, /drawSwordBadge\(playerX, centerY - 143, game\.flowSwordCharges\)/,
  'La insignia del jugador debe usar sus espadazos reales');
assert.match(game, /drawSwordBadge\(rivalX, rivalY - 143, game\.rivalSwordCharges\)/,
  'La insignia del companero debe usar sus espadazos reales');
assert.match(game, /game\.flowBlastUntil = now \+ 720/,
  'Explosion Total necesita una confirmacion visual inmediata');
assert.match(runtime, /dataset\.gameType === 'flow'/,
  'Flujo debe bloquear las animaciones de salto y agachado');
assert.match(runtime, /const runnerCommandCache = new WeakMap\(\)/,
  'El runtime debe reutilizar las matrices de un mismo fotograma');
assert.match(runtime, /function cachedRunnerCommands\(/,
  'El runtime debe cachear los comandos visuales sin alterar la animacion');
assert.match(runtime, /const appearanceCache = new Map\(\)/,
  'El runtime debe reutilizar la apariencia de cada pieza PNG');
assert.match(runtime, /const timelineMetricsCache = new WeakMap\(\)/,
  'El runtime debe reutilizar la duracion y cantidad de frames de cada timeline');
assert.doesNotMatch(runtime, /\[\.\.\.views\]\.sort/,
  'El runtime no debe copiar la lista de personajes en cada fotograma');
assert.match(game, /flowActorViewX\('player'\)/,
  'El render de Flujo debe seguir la posicion horizontal del jugador');
assert.match(game, /crossings\.sort\(\(a, b\) => b\.x - a\.x\)/,
  'El ninja adelantado debe resolver primero el impacto');
assert.doesNotMatch(game, /singleShield/,
  'El Escudo no debe atraer verticalmente al companero');
assert.doesNotMatch(game, /game\.flowX [+-] 125/,
  'El Escudo no debe arrastrar al companero hacia delante o atras');
assert.doesNotMatch(game, /drawFlowGuardLink|VOS CUBRIENDO|COMP TE CUBRE/,
  'Guard no debe revelar la cobertura con una linea o instruccion explicita');
assert.match(game, /function drawFlowShieldGlow\(role, now\)/,
  'Guard debe usar la burbuja animada de proteccion');
assert.match(game, /ctx\.ellipse\(x, y, 56 \* pulse, 88 \* pulse/,
  'Guard debe dibujar el aura pulsante alrededor del ninja');
assert.doesNotMatch(runtime, /view\?\.neon|drop-shadow\(0 0 6px/,
  'Guard no debe aplicar filtros costosos a cada pieza PNG');
assert.match(game, /game\.rival\.mode = 'idle'/,
  'El companero debe esperar quieto durante la cuenta regresiva');
assert.match(game, /setRivalMode\('run', 0\)/,
  'El companero debe empezar a correr al comenzar la partida');
assert.match(game, /now < crossingActor\.invulnerableUntil/,
  'La invulnerabilidad no debe convertir al ninja en una pared gratis');
assert.match(game, /const tileOffset = -\(\(motionDistance \* \.46\) % 180\)/,
  'Las juntas de las baldosas deben retroceder con la carrera');
assert.match(game, /flowPatternLast/, 'Flujo debe evitar repetir patrones consecutivos');
assert.match(game, /CONFIG\.flowLength/, 'Flujo necesita una meta propia');
assert.match(game, /rivalFlowTargetY/, 'Flujo necesita sincronizar o dirigir al segundo ninja');
assert.match(game, /flow-projectile/, 'Los patrones de Flujo deben sincronizarse online');
assert.match(game, /game\.playerMeters >= CONFIG\.flowLength && game\.rivalMeters >= CONFIG\.flowLength/,
  'Flujo debe esperar que ambos jugadores lleguen');
assert.match(server, /\['duo', 'flow'\]\.includes\(profile\?\.gameType\) \? 'flow'/,
  'El servidor debe redirigir el Duo antiguo al nuevo Duo');
assert.match(server, /room\.gameType === 'duo' \|\| room\.gameType === 'flow'/,
  'El servidor debe resolver Flujo como mision cooperativa');
assert.match(server, /'shield', 'medkit', 'blade', 'blast', 'life'/,
  'El servidor debe conservar los cuatro buffs actuales de Flujo');
assert.match(server, /flowSwordCharges:/,
  'El servidor debe sincronizar las cargas de espada');
assert.match(network, /\['duo', 'flow'\]\.includes\(profile\.gameType\) \? 'flow'/,
  'La red debe normalizar todo modo cooperativo al nuevo Duo');
assert.match(game, /PATIO DE ENTRENAMIENTO \/\/ DUO COOPERATIVO/,
  'El nuevo Duo necesita su patio ninja propio');
assert.doesNotMatch(game, /ctx\.rotate\(Math\.PI \+ Math\.sin\(game\.elapsed \* 6 \+ projectile\.phase\)/,
  'Los kunais de Flujo no deben apuntar en contra de su movimiento');
assert.match(html, /class=.flow-rules./, 'La guia debe explicar los controles y buffs');
for (const kind of ['shield', 'blast', 'blade', 'life']) {
  assert.match(html, new RegExp(`data-kind=[\\x22\\x27]${kind}[\\x22\\x27]`),
    `Falta explicar el buff de Flujo ${kind}`);
}
for (const kind of ['magnet', 'slow', 'fury']) {
  assert.doesNotMatch(html, new RegExp(`data-kind=[\\x22\\x27]${kind}[\\x22\\x27]`),
    `Flujo todavia muestra el buff retirado ${kind}`);
}
assert.match(game, /encounterCueActive/, 'El bot no debe pedir la Tormenta durante un aviso de patron');
assert.match(network, /function sendDuoEvent\(/, 'Falta sincronizar eventos cooperativos');
assert.match(game, /lane: game\.player\.lane/, 'El carril debe sincronizarse online');
assert.match(server, /candidate\.profile\.gameType === client\.profile\.gameType/,
  'El matchmaking debe separar competencia y Duo');
assert.match(game, /function returnToLobby\(\)/, 'La revancha debe volver al lobby antes de buscar rival');
assert.match(html, /id=["']raceCountdown["']/, 'Falta la cuenta regresiva visible');
assert.match(html, /id=["']resultStats["']/, 'Falta la comparación de resultados');
assert.match(game, /function scheduleRaceCountdown\(/, 'Falta programar la salida común');
assert.match(game, /function retryRace\(/, 'Falta solicitar una revancha');
assert.match(network, /function rematch\(/, 'Falta el mensaje de revancha online');
assert.match(server, /rematch-status/, 'El servidor debe conservar la sala para la revancha');
assert.match(server, /send\(client, \{ type: 'rematch-expired'/,
  'Una revancha huerfana debe responder sin bloquear la UI');
assert.match(game, /game\.duoHost && game\.ultimateArmedByRemote/,
  'Solo el host debe confirmar Tormenta Gemela online');
assert.match(game, /game\.remoteLives = Math\.max\(0, game\.remoteLives - 1\)/,
  'El companero bot debe perder vidas en Duo');
assert.match(game, /prefersReducedMotion/, 'Canvas debe respetar la preferencia de movimiento reducido');
assert.match(game, /function updateRunHud\(dt\)/,
  'El HUD debe limitar sus escrituras sin reducir los FPS del Canvas');
assert.match(game, /game\.hudRenderClock = \.1/,
  'El HUD de carrera debe actualizarse como maximo diez veces por segundo');
assert.match(game, /mobileVisualBudget \? 12 : 26/,
  'Movil debe limitar las particulas decorativas');
assert.match(game, /targetFps: mobileVisualBudget \? 30 : 60/,
  'Movil debe usar un frame pacing estable sin ralentizar la logica');
assert.match(game, /window\.NinjaRuntimeRenderFrame\?\.\(now\)/,
  'El personaje debe renderizarse desde el mismo frame que el juego');
assert.match(runtime, /ownsStageRendering/,
  'El runtime debe ceder el render del personaje durante la partida');
assert.match(game, /function compactInPlace\(/,
  'Los efectos deben reciclar sus arrays para evitar pausas de GC');
assert.match(game, /function recordPerformance\(/,
  'Falta medir el costo real de cada frame');
assert.match(game, /function updateAdaptiveQuality\(/,
  'Falta ajustar la calidad automaticamente en movil');
assert.match(game, /backgroundFps: mobileVisualBudget \? 20 : 60/,
  'El fondo movil debe iniciar desacoplado del render de personajes');
assert.match(runtime, /function cachedRunnerPose\(/,
  'Falta cachear las poses compuestas de los ninjas');
assert.match(runtime, /runnerPosePixelLimit/,
  'La cache de poses debe tener un limite de memoria');
assert.match(runtime, /runnerMobileBudget \? 3000000 : 16000000/,
  'La cache movil debe respetar un presupuesto seguro para Android');
assert.match(runtime, /contextlost/,
  'El runtime debe recuperarse si Android descarta una superficie Canvas');
assert.match(game, /const WORLD_PAINTS = Object\.freeze/,
  'El fondo debe reutilizar gradientes en lugar de crearlos por fotograma');
assert.match(runtime, /createImageBitmap\(image, \{ premultiplyAlpha: 'premultiply' \}\)/,
  'Los PNG deben decodificarse como bitmaps listos para Canvas');
assert.doesNotMatch(runtime, /cache: 'no-store'/,
  'Los assets estaticos no deben descargarse nuevamente en cada visita');
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
