import fs from 'node:fs';
import path from 'node:path';

const DEBUG_PORT = 9223;
const BASE = `http://127.0.0.1:${DEBUG_PORT}`;
const APP = 'http://127.0.0.1:4174/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function check(name, value, detail = '') {
  results.push({ name, pass: Boolean(value), detail });
  console.log(`${value ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

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
      errors.push(message.params.exceptionDetails?.exception?.description || 'Unknown exception');
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      errors.push(`${message.params.entry.source}: ${message.params.entry.text}`);
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      consoleMessages.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await send('Page.navigate', { url: APP });
  await sleep(3200);

  const boot = await evalJson(`JSON.stringify({
    title: document.title,
    api: !!window.__WHITE_DUST__,
    canvas: !!document.querySelector('#scene'),
    styleLoaded: getComputedStyle(document.querySelector('.brand-copy strong')).fontFamily,
    manifest: document.querySelector('link[rel="manifest"]')?.href,
    swController: !!navigator.serviceWorker?.controller
  })`);
  check('page loads and exposes app', boot.api && boot.canvas, boot.title);
  check('manifest is linked', Boolean(boot.manifest), boot.manifest);
  const helpHidden = await evalJson("JSON.stringify({ hidden: document.getElementById('helpPanel').hidden, display: getComputedStyle(document.getElementById('helpPanel')).display })");
  check('help dialog starts hidden', helpHidden.hidden && helpHidden.display === 'none', JSON.stringify(helpHidden));

  await send('Runtime.evaluate', { expression: "document.getElementById('startBtn').click()", awaitPromise: true });
  await sleep(1500);
  const started = await evalJson(`JSON.stringify({
    started: window.__WHITE_DUST__.state.started,
    playing: document.body.classList.contains('playing'),
    screenHidden: getComputedStyle(document.getElementById('startScreen')).visibility
  })`);
  check('start button enters the world', started.started && started.playing, JSON.stringify(started));

  // Forward drive + boost.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, text: 'w' });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
  await sleep(1800);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
  const driving = await evalJson(`JSON.stringify({ speed: window.__WHITE_DUST__.state.speed, z: window.__WHITE_DUST__.state.z })`);
  check('W accelerates the car', driving.speed > 3, `speed=${driving.speed.toFixed(2)} z=${driving.z.toFixed(2)}`);

  // Flight toggle with the F key.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, text: 'f' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70 });
  await sleep(3600);
  const flight = await evalJson(`JSON.stringify({
    air: window.__WHITE_DUST__.state.air,
    y: window.__WHITE_DUST__.state.y,
    wanted: window.__WHITE_DUST__.state.flightWanted,
    wings: window.__WHITE_DUST__.car.wings.every(w => w.group.visible),
    wheelY: window.__WHITE_DUST__.car.wheels[0].root.position.y,
    mode: document.getElementById('modeLabel').textContent,
    altitudeText: document.getElementById('altitudeValue').textContent
  })`);
  check('F engages flight and lifts the car', flight.wanted && flight.air > 0.95 && flight.y > 2.5, JSON.stringify(flight));
  check('both wings are visible in flight', flight.wings);
  check('wheels are folded in flight', flight.wheelY < 0.68, `wheelY=${flight.wheelY.toFixed(2)}`);

  // Altitude control.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69, text: 'e' });
  await sleep(900);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69 });
  const climbed = await evalJson(`JSON.stringify({ y: window.__WHITE_DUST__.state.y, offset: window.__WHITE_DUST__.state.altitudeOffset })`);
  check('E climbs while flying', climbed.y > flight.y + 0.5, JSON.stringify(climbed));

  // Horn and night.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72, text: 'h' });
  await sleep(250);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72 });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78, text: 'n' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'n', code: 'KeyN', windowsVirtualKeyCode: 78 });
  await sleep(3000);
  const night = await evalJson(`JSON.stringify({
    night: window.__WHITE_DUST__.state.night,
    bodyNight: document.body.classList.contains('night'),
    theme: document.querySelector('meta[name="theme-color"]').content,
    headlight: window.__WHITE_DUST__.car.headlightSpot.intensity
  })`);
  check('N switches to night and lights up the car', night.bodyNight && night.night > 0.9 && night.headlight > 10, JSON.stringify(night));

  // Touch joystick under a phone viewport.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await sleep(900);
  const joy = await evalJson(`(() => {
    const r = document.getElementById('joystick').getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2, visible: getComputedStyle(document.getElementById('mobileControls')).display });
  })()`);
  check('mobile controls are displayed', joy.visible === 'flex', JSON.stringify(joy));
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: joy.x, y: joy.y - 38, radiusX: 8, radiusY: 8, force: 1, id: 1 }]
  });
  await sleep(350);
  const joyState = await evalJson(`JSON.stringify({ active: window.__WHITE_DUST__.state.joystickActive, y: window.__WHITE_DUST__.state.joyY, x: window.__WHITE_DUST__.state.joyX })`);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('touch joystick drives the input', joyState.active && joyState.y > 0.5, JSON.stringify(joyState));

  // Landing restores wheels and stows the wings.
  await send('Runtime.evaluate', { expression: 'window.__WHITE_DUST__.setFlight(false)' });
  await sleep(3800);
  const landed = await evalJson(`JSON.stringify({
    air: window.__WHITE_DUST__.state.air,
    y: window.__WHITE_DUST__.state.y,
    wheelY: window.__WHITE_DUST__.car.wheels[0].root.position.y,
    wingsVisible: window.__WHITE_DUST__.car.wings.some(w => w.group.visible),
    mode: document.getElementById('modeLabel').textContent
  })`);
  check('landing restores wheels and hides wings', landed.air === 0 && landed.y < 0.05 && landed.wheelY > 0.68 && !landed.wingsVisible, JSON.stringify(landed));

  // Service worker and offline shell.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  const sw = await evalJson(`(async () => {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 4000))
    ]);
    const keys = await caches.keys();
    return JSON.stringify({ active: !!registration?.active, scope: registration?.scope, caches: keys });
  })()`);
  check('service worker is active', sw.active, JSON.stringify(sw));

  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0
  });
  await send('Page.reload', { ignoreCache: false });
  await sleep(3200);
  const offline = await evalJson(`JSON.stringify({ api: !!window.__WHITE_DUST__, title: document.title, startVisible: !!document.getElementById('startBtn') })`);
  check('app shell reloads offline', offline.api && offline.startVisible, JSON.stringify(offline));
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1
  });

  check('no runtime exceptions', errors.length === 0, errors.join(' | '));

  const report = {
    timestamp: new Date().toISOString(),
    url: APP,
    results,
    errors,
    consoleMessages,
    state: await evalJson('JSON.stringify(window.__WHITE_DUST__?.state || null)')
  };
  fs.mkdirSync(path.resolve('.screenshots'), { recursive: true });
  fs.writeFileSync(path.resolve('.screenshots', 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: results.filter((result) => result.pass).length, total: results.length, errors: errors.length }));

  ws.close();
  await fetch(`${BASE}/json/close/${target.id}`);
  await sleep(300);

  async function evalJson(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return JSON.parse(result.result.value);
  }
}

main().catch((error) => {
  console.error(error);
  fs.writeFileSync(path.resolve('.screenshots', 'verification-error.txt'), String(error.stack || error));
  process.exitCode = 1;
});
