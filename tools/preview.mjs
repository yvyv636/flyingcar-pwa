import fs from 'node:fs';
import path from 'node:path';

const DEBUG_PORT = 9222;
const BASE = `http://127.0.0.1:${DEBUG_PORT}`;
const APP = 'http://127.0.0.1:4173/';
const outDir = path.resolve('.screenshots');
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`${BASE}/json/version`);
      if (response.ok) return response.json();
    } catch (error) {
      // Browser still starting.
    }
    await sleep(250);
  }
  throw new Error('DevTools endpoint did not become ready');
}

async function main() {
  await waitForDebugger();
  const targetResponse = await fetch(`${BASE}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  const target = await targetResponse.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let nextId = 0;
  const pending = new Map();
  const errors = [];
  const consoleMessages = [];

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const slot = pending.get(message.id);
      if (!slot) return;
      pending.delete(message.id);
      if (message.error) slot.reject(new Error(`${slot.method}: ${message.error.message}`));
      else slot.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Unknown exception');
    }
    if (message.method === 'Log.entryAdded') {
      const entry = message.params.entry;
      if (entry.level === 'error') errors.push(`${entry.source}: ${entry.text}`);
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const args = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      consoleMessages.push(`${message.params.type}: ${args}`);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.clearBrowserCache');
  try {
    await send('Storage.clearDataForOrigin', {
      origin: 'http://127.0.0.1:4173',
      storageTypes: 'service_workers,cache_storage,local_storage'
    });
  } catch (error) {
    // Storage domain is optional in some headless builds.
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await send('Page.navigate', { url: APP });

  await sleep(2500);
  const loadedCode = await send('Runtime.evaluate', {
    expression: "fetch('js/style.js').then(r => r.text()).then(t => JSON.stringify({flatShading: t.includes('flatShading'), marker: t.includes('flatShading: true')}))",
    awaitPromise: true,
    returnByValue: true
  });
  console.log('loaded style.js', loadedCode.result.value);
  await screenshot('start-final');

  await send('Runtime.evaluate', {
    expression: "document.getElementById('startBtn').click()",
    awaitPromise: true
  });
  await sleep(2500);
  await screenshot('drive-final');

  // Drive forward for a couple of real seconds.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
  await sleep(1800);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
  await screenshot('drive-moving');

  // Model inspection: freeze the chase camera and frame the car from the side.
  await evaluate(`(() => {
    const api = window.__WHITE_DUST__;
    api.state.freezeCamera = true;
    api.state.speed = 0;
    const car = api.car.root;
    const p = car.position;
    const forward = { x: Math.sin(car.rotation.y), z: Math.cos(car.rotation.y) };
    api.camera.position.set(p.x + 7.8, p.y + 3.1, p.z + 0.8);
    api.camera.lookAt(p.x, p.y + 1.0, p.z);
    document.body.classList.remove('boosting');
    return true;
  })()`);
  await sleep(400);
  await screenshot('car-side-day');

  await evaluate(`(() => {
    const api = window.__WHITE_DUST__;
    const car = api.car.root;
    const p = car.position;
    api.camera.position.set(p.x + 3.4, p.y + 3.4, p.z + 8.5);
    api.camera.lookAt(p.x, p.y + 0.9, p.z);
    return true;
  })()`);
  await sleep(300);
  await screenshot('car-front-day');

  await evaluate(`(() => {
    const api = window.__WHITE_DUST__;
    const car = api.car.root;
    const p = car.position;
    api.camera.position.set(p.x + 0.3, p.y + 2.6, p.z - 7.6);
    api.camera.lookAt(p.x, p.y + 0.75, p.z);
    return true;
  })()`);
  await sleep(300);
  await screenshot('car-rear-day');

  await evaluate(`(() => {
    const api = window.__WHITE_DUST__;
    api.state.freezeCamera = false;
    api.state.started = true;
    return true;
  })()`);
  await sleep(1600);

  await evaluate("window.__WHITE_DUST__.setFlight(true)");
  await sleep(650);
  await screenshot('flight-transition');
  await sleep(450);
  await screenshot('flight-transition-2');
  await sleep(1500);
  await screenshot('flight-final');

  await evaluate(`(() => {
    const api = window.__WHITE_DUST__;
    api.state.freezeCamera = true;
    const car = api.car.root;
    const p = car.position;
    api.camera.position.set(p.x + 7.8, p.y + 2.8, p.z + 1.2);
    api.camera.lookAt(p.x, p.y + 0.4, p.z);
    return true;
  })()`);
  await sleep(300);
  await screenshot('flight-side');

  await evaluate(`(() => {
    const api = window.__WHITE_DUST__;
    api.state.freezeCamera = false;
    api.setNight(true);
    return true;
  })()`);
  await sleep(3000);
  await screenshot('night-final');

  await evaluate(`(() => {
    const api = window.__WHITE_DUST__;
    api.state.freezeCamera = true;
    const car = api.car.root;
    const p = car.position;
    api.camera.position.set(p.x + 7.8, p.y + 3.0, p.z + 0.8);
    api.camera.lookAt(p.x, p.y + 0.6, p.z);
    return true;
  })()`);
  await sleep(400);
  await screenshot('night-side');

  await evaluate(`(() => {
    const api = window.__WHITE_DUST__;
    api.state.freezeCamera = true;
    const car = api.car.root;
    const p = car.position;
    api.camera.position.set(p.x + 3.0, p.y + 3.2, p.z + 7.5);
    api.camera.lookAt(p.x, p.y + 0.6, p.z);
    return true;
  })()`);
  await sleep(300);
  await screenshot('night-front');

  const report = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      state: window.__WHITE_DUST__ ? {
        speed: window.__WHITE_DUST__.state.speed,
        air: window.__WHITE_DUST__.state.air,
        y: window.__WHITE_DUST__.state.y,
        night: window.__WHITE_DUST__.state.night,
        started: window.__WHITE_DUST__.state.started,
        yaw: window.__WHITE_DUST__.state.yaw
      } : null,
      renderer: window.__WHITE_DUST__ ? {
        calls: window.__WHITE_DUST__.renderer.info.render.calls,
        triangles: window.__WHITE_DUST__.renderer.info.render.triangles,
        dpr: window.__WHITE_DUST__.renderer.getPixelRatio()
      } : null,
      errors: ${JSON.stringify(errors)},
      console: ${JSON.stringify(consoleMessages)}
    })`,
    returnByValue: true
  });
  console.log(report.result.value);

  // Mobile portrait framing.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await evaluate('window.__WHITE_DUST__.state.freezeCamera = false');
  await sleep(1600);
  await screenshot('night-mobile');

  await evaluate("window.__WHITE_DUST__.setNight(false)");
  await evaluate("window.__WHITE_DUST__.setFlight(false)");
  await sleep(2200);
  await screenshot('day-mobile');

  // Reload at phone size to inspect the untouched poster screen.
  await send('Page.navigate', { url: APP });
  await sleep(2000);
  await screenshot('mobile-start');

  ws.close();
  await fetch(`${BASE}/json/close/${target.id}`);
  await sleep(500);

  async function screenshot(name) {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(outDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
    console.log(`screenshot ${file}`);
  }

  async function evaluate(expression) {
    return send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
