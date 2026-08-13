import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const chromePath = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const gameUrl = process.env.RESPONSIVE_QA_URL || 'http://127.0.0.1:8080/';
const debugPort = 9667;
const profileDir = `C:\\tmp\\ninja-responsive-browser-qa-${process.pid}`;
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--remote-debugging-port=' + debugPort,
  '--user-data-dir=' + profileDir,
  'about:blank'
], { stdio: 'ignore' });

const cases = [
  { name: 'desktop-competitive', width: 1200, height: 800, mobile: false, mode: 'competitive', ids: ['btnDuck', 'btnJump', 'btnAttack'] },
  { name: 'portrait-competitive', width: 390, height: 844, mobile: true, mode: 'competitive', ids: ['btnDuck', 'btnJump', 'btnAttack'] },
  { name: 'landscape-competitive', width: 844, height: 390, mobile: true, mode: 'competitive', ids: ['btnDuck', 'btnJump', 'btnAttack'] },
  { name: 'desktop-flow', width: 1200, height: 800, mobile: false, mode: 'flow', ids: ['btnBack', 'btnForward', 'btnDuck', 'btnJump', 'btnAttack'] },
  { name: 'portrait-flow', width: 390, height: 844, mobile: true, mode: 'flow', joystick: true, ids: ['btnAttack'] },
  { name: 'narrow-flow', width: 320, height: 568, mobile: true, mode: 'flow', joystick: true, ids: ['btnAttack'] },
  { name: 'landscape-flow', width: 844, height: 390, mobile: true, mode: 'flow', joystick: true, ids: ['btnAttack'] },
  { name: 'portrait-duo-alias', width: 390, height: 844, mobile: true, mode: 'duo', joystick: true, ids: ['btnAttack'] },
  { name: 'landscape-duo-alias', width: 844, height: 390, mobile: true, mode: 'duo', joystick: true, ids: ['btnAttack'] }
];

try {
  let targets;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      targets = await fetch('http://127.0.0.1:' + debugPort + '/json').then(response => response.json());
      break;
    } catch (_) {
      await delay(200);
    }
  }
  const page = targets?.find(target => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'Chrome no expuso la pagina de QA responsive');
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
  await call('Page.enable');
  const results = [];
  for (const testCase of cases) {
    await call('Emulation.setDeviceMetricsOverride', {
      width: testCase.width,
      height: testCase.height,
      deviceScaleFactor: 1,
      mobile: testCase.mobile,
      screenWidth: testCase.width,
      screenHeight: testCase.height,
      screenOrientation: {
        type: testCase.width > testCase.height ? 'landscapePrimary' : 'portraitPrimary',
        angle: testCase.width > testCase.height ? 90 : 0
      }
    });
    await call('Emulation.setTouchEmulationEnabled', {
      enabled: testCase.mobile,
      maxTouchPoints: testCase.mobile ? 5 : 1
    });
    await call('Page.navigate', {
      url: gameUrl + '?mode=' + testCase.mode + '&qa=1&responsiveQa=' + testCase.name
    });

    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await delay(150);
      ready = await evaluate('Boolean(window.__ninjaRunner?.snapshot().ready)');
      if (ready) break;
    }
    assert.equal(ready, true, `${testCase.name}: el runtime no quedo listo`);
    await evaluate('window.__ninjaRunner.startBot()');
    await delay(250);

    const layout = JSON.parse(await evaluate(`JSON.stringify({
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      visualProfile: window.__ninjaRunner.snapshot().visualProfile,
      camera: {
        viewport: document.getElementById('gameViewport').getBoundingClientRect().toJSON(),
        canvas: document.getElementById('fx').getBoundingClientRect().toJSON()
      },
      raceHud: (() => {
        const element = document.getElementById('raceHud');
        return {
          display: getComputedStyle(element).display,
          rect: element.getBoundingClientRect().toJSON()
        };
      })(),
      swordCounter: (() => {
        const element = document.getElementById('flowSwordCounter');
        return {
          hidden: element.hidden,
          rect: element.getBoundingClientRect().toJSON(),
          text: element.textContent
        };
      })(),
      joystick: (() => {
        const element = document.getElementById('flowJoystick');
        const base = document.getElementById('flowJoystickBase');
        return {
          hidden: element.hidden,
          display: getComputedStyle(element).display,
          rect: element.getBoundingClientRect().toJSON(),
          baseRect: base.getBoundingClientRect().toJSON()
        };
      })(),
      buttons: [...document.querySelectorAll('#touchControls button:not([hidden])')]
        .map(button => ({
          id: button.id,
          display: getComputedStyle(button).display,
          rect: button.getBoundingClientRect().toJSON()
        }))
        .filter(button => button.display !== 'none')
    })`));
    assert.equal(layout.innerWidth, testCase.width, `${testCase.name}: ancho emulado incorrecto`);
    assert.equal(layout.visualProfile.name, testCase.mobile ? 'mobile' : 'desktop',
      `${testCase.name}: perfil visual incorrecto`);
    assert.equal(layout.visualProfile.targetFps, testCase.mobile ? 30 : 60,
      `${testCase.name}: frame pacing incorrecto`);
    assert.equal(layout.visualProfile.glow, !testCase.mobile,
      `${testCase.name}: los blurs caros no respetan el presupuesto visual`);
    assert.equal(layout.visualProfile.backgroundFps, testCase.mobile ? 20 : 60,
      `${testCase.name}: frecuencia inicial del fondo incorrecta`);
    assert.ok(layout.scrollWidth <= layout.innerWidth,
      `${testCase.name}: existe overflow horizontal (${layout.scrollWidth}px)`);
    assert.deepEqual(layout.buttons.map(button => button.id), testCase.ids,
      `${testCase.name}: controles visibles incorrectos`);
    if (['flow', 'duo'].includes(testCase.mode)) {
      const rect = layout.swordCounter.rect;
      assert.equal(layout.swordCounter.hidden, false,
        `${testCase.name}: el contador de espadazos esta oculto`);
      assert.match(layout.swordCounter.text, /ESPADAZOS\s*2\s*COMP 2/,
        `${testCase.name}: el contador no muestra las cargas iniciales`);
      assert.ok(rect.left >= 0 && rect.top >= 0 && rect.right <= layout.innerWidth &&
        rect.bottom <= layout.innerHeight,
      `${testCase.name}: el contador de espadazos queda fuera de pantalla`);
    } else {
      const rect = layout.swordCounter.rect;
      assert.equal(layout.swordCounter.hidden, false,
        `${testCase.name}: el contador de Competencia esta oculto`);
      assert.match(layout.swordCounter.text, /ESPADAZOS\s*5\s*RIVAL 5/,
        `${testCase.name}: Competencia no muestra las cinco cargas iniciales`);
      assert.ok(rect.left >= 0 && rect.top >= 0 && rect.right <= layout.innerWidth &&
        rect.bottom <= layout.innerHeight,
      `${testCase.name}: el contador de Competencia queda fuera de pantalla`);
    }
    for (const button of layout.buttons) {
      const rect = button.rect;
      assert.notEqual(button.display, 'none', `${testCase.name}: #${button.id} esta oculto`);
      assert.ok(rect.width >= 44 && rect.height >= 44,
        `${testCase.name}: #${button.id} no alcanza 44x44px`);
      assert.ok(rect.left >= 0 && rect.top >= 0 &&
        rect.right <= layout.innerWidth && rect.bottom <= layout.innerHeight,
      `${testCase.name}: #${button.id} queda fuera de pantalla`);
    }
    if (testCase.joystick) {
      assert.equal(layout.joystick.hidden, false,
        `${testCase.name}: el joystick esta marcado como oculto`);
      assert.notEqual(layout.joystick.display, 'none',
        `${testCase.name}: el joystick no se muestra`);
      for (const [label, rect] of [['zona', layout.joystick.rect], ['base', layout.joystick.baseRect]]) {
        assert.ok(rect.width >= 44 && rect.height >= 44,
          `${testCase.name}: la ${label} del joystick es demasiado pequena`);
        assert.ok(rect.left >= 0 && rect.top >= 0 &&
          rect.right <= layout.innerWidth && rect.bottom <= layout.innerHeight,
        `${testCase.name}: la ${label} del joystick queda fuera de pantalla`);
      }
      const byId = Object.fromEntries(layout.buttons.map(button => [button.id, button.rect]));
      assert.ok(byId.btnAttack.left > layout.joystick.rect.left + layout.joystick.rect.width,
        `${testCase.name}: Ataque debe quedar separado del joystick`);
    }
    if (testCase.mobile && testCase.width > testCase.height) {
      if (['flow', 'duo'].includes(testCase.mode)) {
        assert.equal(layout.raceHud.display, 'none',
          `${testCase.name}: el panel redundante de Duo debe dejar libre el combate`);
      } else {
        assert.ok(layout.raceHud.rect.right <= layout.innerWidth * .38,
          `${testCase.name}: el HUD de carrera invade el centro del combate`);
        assert.ok(layout.raceHud.rect.top >= 90,
          `${testCase.name}: el HUD de carrera se superpone a vidas y espadas`);
      }
      assert.ok(layout.camera.viewport.width >= layout.innerWidth * .8,
        `${testCase.name}: la camara horizontal todavia desperdicia demasiado ancho`);
      const canvasRatio = layout.camera.canvas.width / layout.camera.canvas.height;
      assert.ok(Math.abs(canvasRatio - 10 / 7) < .02,
        `${testCase.name}: el canvas se deformo al ampliar la camara (${canvasRatio})`);
      assert.ok(layout.camera.canvas.height > layout.camera.viewport.height,
        `${testCase.name}: la camara debe ampliar el contenido mediante un recorte vertical moderado`);
    }
    let sustainedPerformance = null;
    let canvasHealth = null;
    if (testCase.name === 'landscape-flow') {
      await delay(4700);
      sustainedPerformance = JSON.parse(await evaluate(
        'JSON.stringify(window.__ninjaRunner.snapshot())'));
      canvasHealth = JSON.parse(await evaluate(`JSON.stringify((() => {
        const background = document.getElementById('background').getContext('2d');
        const stage = document.getElementById('stage').getContext('2d');
        const backgroundPixel = [...background.getImageData(500, 350, 1, 1).data];
        const stagePixels = stage.getImageData(200, 100, 600, 500).data;
        let visibleStagePixels = 0;
        for (let index = 3; index < stagePixels.length; index += 4) {
          if (stagePixels[index] > 0) visibleStagePixels += 1;
        }
        return { backgroundPixel, visibleStagePixels };
      })())`));
      assert.equal(sustainedPerformance.running, true,
        'Duo movil no inicio despues de la cuenta regresiva');
      assert.ok(canvasHealth.backgroundPixel[0] + canvasHealth.backgroundPixel[1] +
        canvasHealth.backgroundPixel[2] > 30,
      `Android perdio la superficie del fondo: ${canvasHealth.backgroundPixel}`);
      assert.ok(canvasHealth.visibleStagePixels > 100,
        `Android perdio la superficie de los personajes: ${canvasHealth.visibleStagePixels}`);
      assert.ok(sustainedPerformance.performance.fps >= 24,
        `Duo movil no mantiene un ritmo estable: ${sustainedPerformance.performance.fps} FPS`);
      assert.ok(sustainedPerformance.performance.poseCache.hitRate > .2,
        'Duo movil no reutiliza las poses cacheadas');
      assert.ok(sustainedPerformance.performance.poseCache.entries <= 36,
        'La cache movil supera su limite de entradas');
      assert.ok(sustainedPerformance.performance.poseCache.pixels <= 3000000,
        'La cache movil supera su presupuesto de memoria');
    }
    if (testCase.name === 'portrait-flow') {
      await call('Emulation.setDeviceMetricsOverride', {
        width: 844,
        height: 390,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: 844,
        screenHeight: 390,
        screenOrientation: { type: 'landscapePrimary', angle: 90 }
      });
      await delay(900);
      const rotatedHealth = JSON.parse(await evaluate(`JSON.stringify((() => {
        const pixel = [...document.getElementById('background').getContext('2d')
          .getImageData(500, 350, 1, 1).data];
        return {
          pixel,
          recoveries: window.__ninjaRunner.snapshot().performance.canvasRecoveries
        };
      })())`));
      assert.ok(rotatedHealth.recoveries > 0,
        'Rotar de vertical a horizontal no reconstruyo los Canvas');
      assert.ok(rotatedHealth.pixel[0] + rotatedHealth.pixel[1] + rotatedHealth.pixel[2] > 30,
        `El fondo quedo negro despues de rotar: ${rotatedHealth.pixel}`);
    }
    if (testCase.name === 'desktop-competitive') {
      await delay(3300);
      const accepted = [];
      for (let attack = 0; attack < 5; attack += 1) {
        accepted.push(await evaluate('window.__ninjaRunner.attack()'));
        await delay(720);
      }
      const exhausted = JSON.parse(await evaluate(`JSON.stringify({
        game: window.__ninjaRunner.snapshot(),
        rejected: window.__ninjaRunner.attack(),
        label: document.querySelector('#btnAttack strong').textContent,
        empty: document.getElementById('btnAttack').dataset.empty
      })`));
      assert.deepEqual(accepted, [true, true, true, true, true],
        'Competencia debe permitir exactamente los cinco ataques iniciales');
      assert.equal(exhausted.game.flowSwordCharges, 0,
        'Los cinco ataques deben agotar las cargas de Competencia');
      assert.equal(exhausted.game.stats.attacks, 5,
        'El intento rechazado no debe aumentar las estadisticas');
      assert.equal(exhausted.rejected, false,
        'Competencia debe bloquear un sexto espadazo');
      assert.equal(exhausted.label, 'Espada 0',
        'El boton debe mostrar que no quedan espadazos');
      assert.equal(exhausted.empty, 'true',
        'El boton agotado debe mostrar su estado visual');
    }
    results.push({
      name: testCase.name,
      controls: layout.buttons.length,
      ...(sustainedPerformance ? {
        fps: Math.round(sustainedPerformance.performance.fps * 10) / 10,
        poseHitRate: Math.round(sustainedPerformance.performance.poseCache.hitRate * 1000) / 1000,
        poseEntries: sustainedPerformance.performance.poseCache.entries,
        backgroundPixel: canvasHealth.backgroundPixel.slice(0, 3),
        visibleStagePixels: canvasHealth.visibleStagePixels
      } : {}),
      bounds: layout.buttons.map(button =>
        [button.id, Math.round(button.rect.left), Math.round(button.rect.top),
          Math.round(button.rect.right), Math.round(button.rect.bottom)])
    });
  }
  assert.deepEqual(exceptions, [], 'Se detectaron excepciones JavaScript');
  socket.close();
  console.log(JSON.stringify(results));
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
