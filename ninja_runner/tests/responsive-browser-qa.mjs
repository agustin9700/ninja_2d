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
  { name: 'desktop-flow', width: 1200, height: 800, mobile: false, mode: 'flow', ids: ['btnBack', 'btnForward', 'btnDuck', 'btnJump', 'btnAttack'] },
  { name: 'portrait-flow', width: 390, height: 844, mobile: true, mode: 'flow', ids: ['btnBack', 'btnForward', 'btnDuck', 'btnJump', 'btnAttack'] },
  { name: 'narrow-flow', width: 320, height: 568, mobile: true, mode: 'flow', ids: ['btnBack', 'btnForward', 'btnDuck', 'btnJump', 'btnAttack'] },
  { name: 'landscape-flow', width: 844, height: 390, mobile: true, mode: 'flow', ids: ['btnBack', 'btnForward', 'btnDuck', 'btnJump', 'btnAttack'] },
  { name: 'portrait-duo-alias', width: 390, height: 844, mobile: true, mode: 'duo', ids: ['btnBack', 'btnForward', 'btnDuck', 'btnJump', 'btnAttack'] },
  { name: 'landscape-duo-alias', width: 844, height: 390, mobile: true, mode: 'duo', ids: ['btnBack', 'btnForward', 'btnDuck', 'btnJump', 'btnAttack'] }
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
      url: gameUrl + '?mode=' + testCase.mode + '&responsiveQa=' + testCase.name
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
      swordCounter: (() => {
        const element = document.getElementById('flowSwordCounter');
        return {
          hidden: element.hidden,
          rect: element.getBoundingClientRect().toJSON(),
          text: element.textContent
        };
      })(),
      buttons: [...document.querySelectorAll('#touchControls button:not([hidden])')].map(button => ({
        id: button.id,
        display: getComputedStyle(button).display,
        rect: button.getBoundingClientRect().toJSON()
      }))
    })`));
    assert.equal(layout.innerWidth, testCase.width, `${testCase.name}: ancho emulado incorrecto`);
    assert.ok(layout.scrollWidth <= layout.innerWidth,
      `${testCase.name}: existe overflow horizontal (${layout.scrollWidth}px)`);
    assert.deepEqual(layout.buttons.map(button => button.id), testCase.ids,
      `${testCase.name}: controles visibles incorrectos`);
    if (testCase.mode === 'flow') {
      const rect = layout.swordCounter.rect;
      assert.equal(layout.swordCounter.hidden, false,
        `${testCase.name}: el contador de espadazos esta oculto`);
      assert.match(layout.swordCounter.text, /ESPADAZOS\s*2\s*COMP 2/,
        `${testCase.name}: el contador no muestra las cargas iniciales`);
      assert.ok(rect.left >= 0 && rect.top >= 0 && rect.right <= layout.innerWidth &&
        rect.bottom <= layout.innerHeight,
      `${testCase.name}: el contador de espadazos queda fuera de pantalla`);
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
    if (testCase.mobile && testCase.width > testCase.height &&
        ['flow', 'duo'].includes(testCase.mode)) {
      const byId = Object.fromEntries(layout.buttons.map(button => [button.id, button.rect]));
      const centerX = rect => rect.left + rect.width / 2;
      const centerY = rect => rect.top + rect.height / 2;
      assert.ok(Math.abs(centerX(byId.btnJump) - centerX(byId.btnDuck)) <= 2,
        `${testCase.name}: Subir y Bajar no forman el eje vertical de la cruceta`);
      assert.ok(Math.abs(centerY(byId.btnBack) - centerY(byId.btnForward)) <= 2,
        `${testCase.name}: Atras y Adelante no forman el eje horizontal de la cruceta`);
      assert.ok(centerY(byId.btnJump) < centerY(byId.btnBack) &&
        centerY(byId.btnDuck) > centerY(byId.btnBack),
      `${testCase.name}: el orden vertical de la cruceta es incorrecto`);
      assert.ok(centerX(byId.btnBack) < centerX(byId.btnJump) &&
        centerX(byId.btnForward) > centerX(byId.btnJump),
      `${testCase.name}: el orden horizontal de la cruceta es incorrecto`);
      assert.ok(byId.btnAttack.left > byId.btnForward.right,
        `${testCase.name}: Ataque debe quedar separado de la cruceta`);
    }
    results.push({
      name: testCase.name,
      controls: layout.buttons.length,
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
