const fs = require('node:fs');

const [, , portArg, keyArg, delayArg, outputArg] = process.argv;
const port = Number(portArg || 9222);
const key = String(keyArg || 'j').toLowerCase();
const delay = Number(delayArg || 350);
if (!outputArg) throw new Error('Output path is required');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  let targets = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets.length) break;
    } catch {}
    await sleep(200);
  }
  const target = targets.find(item => item.type === 'page' && item.url.includes('127.0.0.1:8080'));
  if (!target) throw new Error('Runtime page not found in Edge targets');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result || {});
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.reload', { ignoreCache: true });
  await sleep(1200);
  await send('Runtime.evaluate', {
    expression: `document.dispatchEvent(new KeyboardEvent('keydown', {key: '${key}', bubbles: true}))`
  });
  await sleep(delay);
  const capture = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(outputArg, Buffer.from(capture.data, 'base64'));
  socket.close();
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});