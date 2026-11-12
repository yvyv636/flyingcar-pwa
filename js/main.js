import * as THREE from 'three';
import { World } from './world.js';
import { RacerCar } from './car.js';
import { Effects } from './effects.js';
import { SoundEngine } from './audio.js';
import {
  clamp,
  damp,
  moveTowards,
  lerp,
  smoothstep,
  randomBetween
} from './style.js';

const canvas = document.getElementById('scene');

const dom = {
  startScreen: document.getElementById('startScreen'),
  startBtn: document.getElementById('startBtn'),
  themeBtn: document.getElementById('themeBtn'),
  soundBtn: document.getElementById('soundBtn'),
  cameraBtn: document.getElementById('cameraBtn'),
  helpBtn: document.getElementById('helpBtn'),
  helpPanel: document.getElementById('helpPanel'),
  closeHelpBtn: document.getElementById('closeHelpBtn'),
  installBtn: document.getElementById('installBtn'),
  modeCard: document.querySelector('.mode-card'),
  modeLabel: document.getElementById('modeLabel'),
  modeSubLabel: document.getElementById('modeSubLabel'),
  modeMeterFill: document.getElementById('modeMeterFill'),
  speedValue: document.getElementById('speedValue'),
  speedFill: document.getElementById('speedFill'),
  altitudeValue: document.getElementById('altitudeValue'),
  flightBtn: document.getElementById('flightBtn'),
  flightBtnLabel: document.getElementById('flightBtnLabel'),
  boostBtn: document.getElementById('boostBtn'),
  hornBtn: document.getElementById('hornBtn'),
  altUpBtn: document.getElementById('altUpBtn'),
  altDownBtn: document.getElementById('altDownBtn'),
  joystick: document.getElementById('joystick'),
  joystickKnob: document.getElementById('joystickKnob'),
  toast: document.getElementById('toast'),
  toastText: document.getElementById('toastText'),
  toastIcon: document.getElementById('toastIcon')
};

const isCoarse = window.matchMedia('(pointer: coarse)').matches;
const isNarrow = window.matchMedia('(max-width: 900px)').matches;
const isMobile = isCoarse || isNarrow;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false
  });
} catch (error) {
  showFatalError('这台设备暂时无法打开 WebGL 3D 场景。');
  throw error;
}

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0xffffff, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffffff');
scene.fog = new THREE.Fog('#ffffff', 88, 520);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(8.5, 5.8, -12);

const world = new World(scene);
const car = new RacerCar(scene);
const effects = new Effects(scene, car);
const audio = new SoundEngine();

world.setShadowQuality(isMobile ? 'low' : 'high');

const state = {
  started: false,
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  speed: 0,
  throttle: 0,
  steer: 0,
  boost: 0,
  air: 0,
  flightWanted: false,
  altitudeOffset: 0,
  night: 0,
  nightWanted: 0,
  cameraMode: 0,
  shake: 0,
  collisionCooldown: 0,
  joyX: 0,
  joyY: 0,
  joystickActive: false,
  boostHeld: false,
  altitudeUpHeld: false,
  altitudeDownHeld: false,
  helpOpen: false,
  lastLandingAir: 0,
  intro: 0,
  distance: 0,
  freezeCamera: false
};

const keys = Object.create(null);
const tempForward = new THREE.Vector3();
const tempRight = new THREE.Vector3();
const tempLook = new THREE.Vector3();
const tempTarget = new THREE.Vector3();
const tempWorld = new THREE.Vector3();

let lastTime = performance.now();
let elapsed = 0;
let toastTimer = 0;
let deferredInstallPrompt = null;
let cachedMode = '';

/* ------------------------------------------------------------------
   Presentation helpers
------------------------------------------------------------------- */

function showFatalError(message) {
  const block = document.createElement('div');
  block.className = 'fallback';
  block.innerHTML = `<div style="max-width:520px;text-align:center;line-height:1.8;padding:24px">
    <p style="font-family:var(--mono);font-size:10px;letter-spacing:.16em;color:#e86043">WHITE DUST / ERROR</p>
    <h1 style="font-size:28px;margin:12px 0">${message}</h1>
    <p style="font-family:var(--body);font-size:13px;color:#4a535b">请更新浏览器，或换一台支持 WebGL 的设备再来。</p>
  </div>`;
  document.body.appendChild(block);
}

function toast(message, icon = 'teal', duration = 2300) {
  dom.toastText.textContent = message;
  dom.toastIcon.style.background = icon === 'coral' ? 'var(--coral)' : 'var(--teal-light)';
  dom.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), duration);
}

function setModeUI() {
  const air = state.air;
  let mode = 'drive';
  if (air > 0.6) mode = 'fly';
  else if (air > 0.015) mode = 'transition';

  const transitionDirection = state.flightWanted ? 'up' : 'down';

  if (mode !== cachedMode) {
    cachedMode = mode;
    dom.modeCard.classList.toggle('flying', mode === 'fly');
    dom.modeCard.classList.toggle('transitioning', mode === 'transition');
    document.body.classList.toggle('airborne', air > 0.5);

    if (mode === 'drive') {
      dom.modeLabel.textContent = '地面行驶';
      dom.modeSubLabel.textContent = '轮下生风 · 寻找石块';
      dom.flightBtnLabel.textContent = '起飞';
    } else if (mode === 'fly') {
      dom.modeLabel.textContent = '飞行模式';
      dom.modeSubLabel.textContent = '机翼展开 · Q/E 控高';
      dom.flightBtnLabel.textContent = '降落';
    } else {
      dom.modeLabel.textContent = transitionDirection === 'up' ? '起飞变形' : '降落变形';
      dom.modeSubLabel.textContent = transitionDirection === 'up'
        ? '车轮折叠 · 喷气离地'
        : '机翼收拢 · 轮组归位';
      dom.flightBtnLabel.textContent = transitionDirection === 'up' ? '降落' : '起飞';
    }
  }

  dom.modeMeterFill.style.width = `${Math.round(air * 100)}%`;
}

function setNightUI() {
  const night = state.nightWanted === 1;
  document.body.classList.toggle('night', night);
  dom.themeBtn.setAttribute('aria-label', night ? '切换到白天' : '切换到夜晚');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', night ? '#071226' : '#fffdf8');
}

function toggleNight() {
  if (!state.started) return;
  state.nightWanted = state.nightWanted ? 0 : 1;
  setNightUI();
  audio.click();
  toast(state.nightWanted ? '车灯开启 · 底盘氛围灯亮起' : '回到白昼', state.nightWanted ? 'coral' : 'teal');
}

function toggleCamera() {
  if (!state.started) return;
  state.cameraMode = state.cameraMode ? 0 : 1;
  audio.click();
  toast(state.cameraMode ? '远镜头' : '追尾镜头');
}

function toggleSound() {
  if (!state.started) {
    state.started = true;
    startExperience();
  }
  const muted = audio.toggleMuted();
  document.body.classList.toggle('muted', muted);
  dom.soundBtn.setAttribute('aria-label', muted ? '开启声音' : '静音');
  if (!muted) audio.clickLight();
  if (state.started) toast(muted ? '声音已关闭' : '声音已开启');
}

/* ------------------------------------------------------------------
   Start, help, install
------------------------------------------------------------------- */

async function startExperience() {
  if (document.body.classList.contains('playing')) return;
  state.started = true;
  state.intro = 0;
  document.body.classList.add('playing');
  dom.startScreen.classList.add('dismissed');
  setTimeout(() => { dom.startScreen.style.display = 'none'; }, 700);
  try {
    await audio.init();
  } catch (error) {
    // Audio is optional; the scene must still run.
  }
  audio.click();
  toast('引擎点火 · 按 F 展开机翼', 'coral', 2800);
  canvas.focus?.();
}

dom.startBtn.addEventListener('click', startExperience);

dom.themeBtn.addEventListener('click', toggleNight);
dom.cameraBtn.addEventListener('click', toggleCamera);
dom.soundBtn.addEventListener('click', toggleSound);

dom.helpBtn.addEventListener('click', () => {
  state.helpOpen = true;
  dom.helpPanel.hidden = false;
  audio.click();
});

function closeHelp() {
  state.helpOpen = false;
  dom.helpPanel.hidden = true;
  audio.click();
}

dom.closeHelpBtn.addEventListener('click', closeHelp);
dom.helpPanel.addEventListener('click', (event) => {
  if (event.target === dom.helpPanel) closeHelp();
});

/* ------------------------------------------------------------------
   Flight toggle
------------------------------------------------------------------- */

function toggleFlight(force = null) {
  if (!state.started || state.helpOpen) return;
  const next = force === null ? !state.flightWanted : force;
  if (next === state.flightWanted) return;

  state.flightWanted = next;
  if (next) {
    state.altitudeOffset = 0;
    effects.takeoffBurst();
    audio.whoosh(true);
    audio.jetBurst();
    toast('轮组折叠 · 机翼展开', 'coral');
    state.shake = Math.max(state.shake, 0.18);
  } else {
    audio.whoosh(false);
    toast('机翼收拢 · 准备接地');
  }
  cachedMode = '';
  setModeUI();
}

dom.flightBtn.addEventListener('click', () => {
  toggleFlight();
});

/* ------------------------------------------------------------------
   Keyboard
------------------------------------------------------------------- */

const controlKeys = new Set([
  'w', 'a', 's', 'd', 'q', 'e', 'f', 'h', 'n', 'm', 'c',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'escape'
]);

function keyName(event) {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
}

window.addEventListener('keydown', (event) => {
  const key = keyName(event);

  if (state.helpOpen) {
    if (key === 'escape') closeHelp();
    return;
  }

  if (!state.started) {
    if (key === 'enter' || key === ' ' || key === 'w' || key === 'arrowup') {
      event.preventDefault();
      startExperience();
    }
    return;
  }

  if (controlKeys.has(key)) event.preventDefault();
  if (event.repeat && ['f', 'h', 'n', 'm', 'c', ' '].includes(key)) return;

  keys[key] = true;

  if (key === 'f' || key === ' ') {
    toggleFlight();
  } else if (key === 'h') {
    audio.hornStart();
  } else if (key === 'n') {
    toggleNight();
  } else if (key === 'm') {
    toggleSound();
  } else if (key === 'c') {
    toggleCamera();
  }
});

window.addEventListener('keyup', (event) => {
  const key = keyName(event);
  keys[key] = false;
  if (key === 'h') audio.hornStop();
});

window.addEventListener('blur', () => {
  for (const key of Object.keys(keys)) keys[key] = false;
  state.boostHeld = false;
  state.altitudeUpHeld = false;
  state.altitudeDownHeld = false;
  state.joystickActive = false;
  state.joyX = 0;
  state.joyY = 0;
  dom.joystickKnob.style.transform = 'translate(0px, 0px)';
  audio.hornStop();
});

/* ------------------------------------------------------------------
   Touch controls
------------------------------------------------------------------- */

function bindHold(button, onDown, onUp) {
  const down = (event) => {
    event.preventDefault();
    button.classList.add('active');
    button.setPointerCapture?.(event.pointerId);
    onDown();
  };
  const up = (event) => {
    event.preventDefault();
    button.classList.remove('active');
    onUp();
  };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('pointerleave', (event) => {
    if (event.buttons === 0) up(event);
  });
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}

bindHold(dom.boostBtn, () => {
  state.boostHeld = true;
  audio.click();
}, () => {
  state.boostHeld = false;
});

bindHold(dom.hornBtn, () => {
  audio.hornStart();
}, () => {
  audio.hornStop();
});

bindHold(dom.altUpBtn, () => {
  state.altitudeUpHeld = true;
}, () => {
  state.altitudeUpHeld = false;
});

bindHold(dom.altDownBtn, () => {
  state.altitudeDownHeld = true;
}, () => {
  state.altitudeDownHeld = false;
});

function updateJoystick(event) {
  const rect = dom.joystick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const maxRadius = rect.width * 0.34;
  let dx = event.clientX - centerX;
  let dy = event.clientY - centerY;
  const distance = Math.hypot(dx, dy);
  if (distance > maxRadius) {
    dx = (dx / distance) * maxRadius;
    dy = (dy / distance) * maxRadius;
  }
  state.joyX = clamp(dx / maxRadius, -1, 1);
  state.joyY = clamp(-dy / maxRadius, -1, 1);
  dom.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}

dom.joystick.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  state.joystickActive = true;
  dom.joystick.setPointerCapture?.(event.pointerId);
  dom.joystick.classList.add('active');
  updateJoystick(event);
});

dom.joystick.addEventListener('pointermove', (event) => {
  if (!state.joystickActive) return;
  updateJoystick(event);
});

const releaseJoystick = (event) => {
  event.preventDefault?.();
  state.joystickActive = false;
  state.joyX = 0;
  state.joyY = 0;
  dom.joystick.classList.remove('active');
  dom.joystickKnob.style.transform = 'translate(0px, 0px)';
};

dom.joystick.addEventListener('pointerup', releaseJoystick);
dom.joystick.addEventListener('pointercancel', releaseJoystick);

/* ------------------------------------------------------------------
   PWA
------------------------------------------------------------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  dom.installBtn.classList.remove('hidden');
});

dom.installBtn.addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      dom.installBtn.classList.add('hidden');
      toast('已安装到主屏幕', 'coral');
    }
    deferredInstallPrompt = null;
    return;
  }
  if (isIos) {
    toast('Safari：点分享按钮 → 添加到主屏幕', 'coral', 4200);
  }
});

window.addEventListener('appinstalled', () => {
  dom.installBtn.classList.add('hidden');
  toast('白漠飞车已就位', 'coral');
});

const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (isIos && !standalone) {
  dom.installBtn.classList.remove('hidden');
}

/* ------------------------------------------------------------------
   Simulation
------------------------------------------------------------------- */

function readInputs(dt) {
  let throttle = 0;
  if (keys['w'] || keys['arrowup']) throttle += 1;
  if (keys['s'] || keys['arrowdown']) throttle -= 1;

  let steer = 0;
  if (keys['d'] || keys['arrowright']) steer += 1;
  if (keys['a'] || keys['arrowleft']) steer -= 1;

  throttle += state.joyY;
  steer += state.joyX;
  throttle = clamp(throttle, -1, 1);
  steer = clamp(steer, -1, 1);

  state.throttle = damp(state.throttle, throttle, 9, dt);
  state.steer = damp(state.steer, steer, 10, dt);

  const wantBoost = (keys['shift'] || state.boostHeld) && (throttle > 0.02 || state.air > 0.4);
  state.boost = damp(state.boost, wantBoost ? 1 : 0, 5, dt);

  let vertical = 0;
  if (keys['e'] || state.altitudeUpHeld) vertical += 1;
  if (keys['q'] || state.altitudeDownHeld) vertical -= 1;
  return vertical;
}

function updateFlight(dt) {
  const previousAir = state.air;
  const target = state.flightWanted ? 1 : 0;
  const speed = state.flightWanted ? 0.68 : 0.82;
  state.air = moveTowards(state.air, target, dt * speed);

  if (state.air > 0.98 && state.flightWanted) {
    state.air = 1;
  }
  if (state.air < 0.02 && !state.flightWanted) {
    state.air = 0;
  }

  if (!state.flightWanted) {
    state.altitudeOffset = damp(state.altitudeOffset, 0, 2.5, dt);
  }

  if (previousAir > 0.12 && state.air <= 0.001 && !state.flightWanted) {
    effects.landingBurst(1);
    audio.thud(1.15);
    state.shake = Math.max(state.shake, 0.65);
    car.impact(1.4);
    toast('接地完成 · 轮组归位', 'coral', 1800);
  }
}

function updatePhysics(dt, vertical) {
  const airborne = state.air > 0.5;
  const maxSpeed = airborne
    ? 35 + state.boost * 18
    : 19 + state.boost * 11;
  const reverseMax = airborne ? -8 : -7.5;

  if (state.throttle > 0.02) {
    const acceleration = airborne ? 15.5 : 11.5;
    state.speed += state.throttle * (acceleration + state.boost * 12) * dt;
  } else if (state.throttle < -0.02) {
    if (state.speed > 0.4) {
      state.speed -= (airborne ? 14 : 24) * dt * Math.abs(state.throttle);
    } else {
      state.speed -= (airborne ? 6 : 7) * dt * Math.abs(state.throttle);
    }
  } else {
    const drag = airborne ? 1.1 : 3.4;
    state.speed = moveTowards(state.speed, 0, drag * dt);
  }

  if (state.boost > 0.05) {
    state.speed += state.boost * 4.0 * dt;
  }

  state.speed = clamp(state.speed, reverseMax, maxSpeed);

  if (state.air > 0.55) {
    const approach = 9.5;
    state.altitudeOffset = clamp(
      state.altitudeOffset + vertical * approach * dt,
      -1.25,
      5.8
    );
  }

  const speedRatio = clamp(Math.abs(state.speed) / (airborne ? 45 : 28), 0, 1);
  const turnRate = airborne ? 1.06 : 1.32;
  state.yaw += state.steer * turnRate * dt * Math.sign(state.speed || 1) * (0.25 + speedRatio * 0.75);

  if (state.speed !== 0) {
    const dx = Math.sin(state.yaw) * state.speed * dt;
    const dz = Math.cos(state.yaw) * state.speed * dt;
    state.x += dx;
    state.z += dz;
    state.distance += Math.hypot(dx, dz);
  }

  const baseAltitude = state.air * (3.25 + state.altitudeOffset);
  state.y = baseAltitude;

  state.collisionCooldown = Math.max(0, state.collisionCooldown - dt);
  if (state.air < 0.32 && Math.abs(state.speed) > 4 && state.collisionCooldown <= 0) {
    const probeDistance = 1.7;
    const probeX = state.x + Math.sin(state.yaw) * probeDistance;
    const probeZ = state.z + Math.cos(state.yaw) * probeDistance;
    const rock = world.checkCollision(probeX, probeZ, 1.05);
    if (rock) {
      car.impact(clamp(Math.abs(state.speed) / 15, 0.5, 1.5));
      state.shake = Math.max(state.shake, 0.55);
      effects.impactBurst(new THREE.Vector3(probeX, 0.55, probeZ), 1);
      audio.thud(0.9);
      state.speed *= -0.16;
      state.x -= Math.sin(state.yaw) * 0.55;
      state.z -= Math.cos(state.yaw) * 0.55;
      state.collisionCooldown = 0.9;
      toast('撞上石块 · 小心驾驶');
    }
  }

  car.root.position.set(state.x, state.y, state.z);
  car.root.rotation.y = state.yaw;
}

function updateCamera(dt, time) {
  if (state.freezeCamera) return;
  const portrait = camera.aspect < 0.82;
  const air = smoothstep(state.air);
  const speedRatio = clamp(Math.abs(state.speed) / 38, 0, 1);
  car.getForward(tempForward);
  car.getRight(tempRight);

  const baseBack = portrait ? 11.4 : 9.4;
  const baseSide = portrait ? 2.1 : 2.8;
  const baseHeight = portrait ? 5.5 : 4.95;
  const cameraExtra = state.cameraMode ? 3.4 : 0;

  const back = baseBack + speedRatio * 1.2 + air * 1.35 + cameraExtra;
  const side = baseSide + air * 0.55;
  const height = baseHeight + air * 1.95 + speedRatio * 0.3;

  tempTarget.set(
    car.root.position.x + tempRight.x * side - tempForward.x * back,
    car.root.position.y + height,
    car.root.position.z + tempRight.z * side - tempForward.z * back
  );
  tempTarget.y = Math.max(2.2, tempTarget.y);

  const smoothing = state.started ? 4.0 : 2.0;
  camera.position.lerp(tempTarget, 1 - Math.exp(-smoothing * dt));

  tempLook.set(
    car.root.position.x + tempForward.x * (2.1 + air * 2.0),
    car.root.position.y + 0.95 + air * 1.1,
    car.root.position.z + tempForward.z * (2.1 + air * 2.0)
  );

  if (state.shake > 0.001) {
    const shake = state.shake;
    camera.position.x += Math.sin(time * 87) * shake * 0.22;
    camera.position.y += Math.cos(time * 73) * shake * 0.16;
    camera.position.z += Math.sin(time * 61 + 1.7) * shake * 0.18;
    tempLook.x += Math.sin(time * 93) * shake * 0.12;
    tempLook.y += Math.cos(time * 66) * shake * 0.1;
    state.shake = Math.max(0, state.shake - dt * 2.1);
  }

  camera.lookAt(tempLook);

  const targetFov = (portrait ? 50 : 42) + speedRatio * 4.2 + air * 1.8;
  const nextFov = damp(camera.fov, targetFov, 2.4, dt);
  if (Math.abs(nextFov - camera.fov) > 0.001) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }
}

function updateHud() {
  const displaySpeed = Math.min(999, Math.round(Math.abs(state.speed) * 7.2));
  dom.speedValue.textContent = String(displaySpeed).padStart(3, '0');
  const maxForDisplay = state.air > 0.5 ? 52 : 30;
  dom.speedFill.style.width = `${clamp(displaySpeed / (maxForDisplay * 7.2), 0, 1) * 100}%`;
  dom.altitudeValue.textContent = Math.max(0, state.y).toFixed(1);

  const boosting = state.boost > 0.35 && Math.abs(state.speed) > 5;
  document.body.classList.toggle('boosting', boosting);

  setModeUI();
}

/* ------------------------------------------------------------------
   Resize, visibility
------------------------------------------------------------------- */

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.8 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  effects.setPixelRatio(pixelRatio);
}

window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 220));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.hornStop();
    for (const key of Object.keys(keys)) keys[key] = false;
    state.boostHeld = false;
    state.altitudeUpHeld = false;
    state.altitudeDownHeld = false;
  } else {
    lastTime = performance.now();
    if (state.started) {
      audio.context?.resume?.().catch?.(() => {});
    }
  }
});

/* ------------------------------------------------------------------
   Main loop
------------------------------------------------------------------- */

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  elapsed += dt;

  const vertical = readInputs(dt);

  if (state.started) {
    updateFlight(dt);
    updatePhysics(dt, vertical);
    updateCamera(dt, elapsed);
  } else {
    // A slow, quiet orbit behind the poster.
    const orbit = elapsed * 0.08;
    const radius = 12.5;
    tempTarget.set(
      Math.sin(orbit) * radius,
      4.7 + Math.sin(orbit * 1.7) * 0.3,
      Math.cos(orbit) * radius
    );
    camera.position.lerp(tempTarget, 1 - Math.exp(-1.4 * dt));
    tempLook.set(0, 1.1, 0);
    camera.lookAt(tempLook);
    state.speed = damp(state.speed, 0, 3, dt);
    car.root.position.set(0, 0, 0);
  }

  state.night = damp(state.night, state.nightWanted, 2.2, dt);
  if (Math.abs(state.night - state.nightWanted) < 0.002) state.night = state.nightWanted;

  car.setNight(state.night);
  car.update(dt, elapsed, {
    speed: state.speed,
    steer: state.steer,
    air: state.air,
    boost: state.boost,
    throttle: state.throttle,
    vertical
  });

  world.update(dt, elapsed, car.root.position, state.night, camera.position);
  effects.update(dt, elapsed, {
    speed: state.speed,
    air: state.air,
    boost: state.boost,
    throttle: state.throttle,
    braking: state.throttle < -0.1
  });

  if (state.started) {
    updateHud();
    audio.update({
      speed: Math.abs(state.speed),
      maxSpeed: state.air > 0.5 ? 50 : 30,
      air: state.air,
      boost: state.boost
    });
  }

  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------
   Boot
------------------------------------------------------------------- */

resize();
setModeUI();
const initialQuery = new URLSearchParams(window.location.search);
if (initialQuery.get('night') === '1') {
  state.nightWanted = 1;
  state.night = 1;
  setNightUI();
} else {
  setNightUI();
}
document.body.classList.toggle('muted', audio.muted);
dom.soundBtn.setAttribute('aria-label', audio.muted ? '开启声音' : '静音');

// Shareable scene states are also handy for previewing the build.
if (initialQuery.get('autostart') === '1') {
  setTimeout(async () => {
    await startExperience();
    if (initialQuery.get('flight') === '1') {
      setTimeout(() => toggleFlight(true), 1900);
    }
    if (initialQuery.get('boost') === '1') {
      state.boostHeld = true;
      keys['w'] = true;
    }
    if (initialQuery.get('night') === '1' && Number(initialQuery.get('nightDelay') || 0) > 0) {
      state.nightWanted = 0;
      state.night = 0;
      setNightUI();
      setTimeout(() => {
        state.nightWanted = 1;
        setNightUI();
      }, Number(initialQuery.get('nightDelay')));
    }
  }, 250);
}

renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  toast('3D 场景正在恢复，请稍候', 'coral', 5000);
});

renderer.domElement.addEventListener('webglcontextrestored', () => {
  resize();
  toast('场景已恢复', 'teal');
});

requestAnimationFrame(frame);

// Expose a tiny read-only diagnostic surface for automated checks.
window.__WHITE_DUST__ = {
  state,
  car,
  world,
  scene,
  camera,
  renderer,
  setFlight: toggleFlight,
  setNight: (value) => {
    state.nightWanted = value ? 1 : 0;
    setNightUI();
  },
  honk: () => audio.honk()
};
