import * as THREE from 'three';

/* ------------------------------------------------------------------
   Moebius / bande-dessinée palette.
   Warm paper, ink lines, sun-baked coral, faded turquoise.
------------------------------------------------------------------- */
export const PALETTE = {
  paper: '#fffdf8',
  white: '#ffffff',
  ink: '#172029',
  inkSoft: '#2d3741',
  coral: '#e86043',
  coralDeep: '#c84432',
  coralLight: '#f28c67',
  cream: '#ffe9bd',
  sand: '#e7c98f',
  gold: '#f5b848',
  teal: '#1b9996',
  tealDeep: '#0f6d72',
  tealLight: '#65d6c8',
  sky: '#b8d8e8',
  lilac: '#c6b5d6',
  red: '#e23d38',
  night: '#071226',
  glow: '#5df7d8',
  magenta: '#ff5dbb',
  smoke: '#59616c'
};

export const COLORS = Object.fromEntries(
  Object.entries(PALETTE).map(([key, value]) => [key, new THREE.Color(value)])
);

/* Posterised lighting ramp used by every toon material. */
const rampData = new Uint8Array([72, 126, 184, 232, 255]);
export const gradientMap = new THREE.DataTexture(rampData, rampData.length, 1, THREE.RedFormat);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false;
gradientMap.needsUpdate = true;

export const outlineMaterial = new THREE.MeshBasicMaterial({
  color: 0x172029,
  side: THREE.BackSide,
  toneMapped: false
});

export function toonMaterial(color, options = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap,
    ...options
  });
}

export function basicMaterial(color, options = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
    ...options
  });
}

/**
 * Inverted-hull ink outline. The copy is a child, so every transform
 * applied to the source geometry is carried along automatically.
 */
export function addOutline(mesh, amount = 1.025, material = outlineMaterial) {
  const outline = new THREE.Mesh(mesh.geometry, material);
  outline.scale.setScalar(amount);
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.renderOrder = -1;
  mesh.add(outline);
  mesh.userData.outline = outline;
  return outline;
}

export function tubeBetween(a, b, radius, material, radialSegments = 6) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  return mesh;
}

export function makeCanvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

let glowTexture;
export function getGlowTexture() {
  if (glowTexture) return glowTexture;
  glowTexture = makeCanvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.16, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.38)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return glowTexture;
}

let shadowTexture;
export function getShadowTexture() {
  if (shadowTexture) return shadowTexture;
  shadowTexture = makeCanvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(25,31,38,0.72)');
    g.addColorStop(0.32, 'rgba(25,31,38,0.5)');
    g.addColorStop(0.62, 'rgba(25,31,38,0.2)');
    g.addColorStop(1, 'rgba(25,31,38,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return shadowTexture;
}

export function glowSprite(color, scale = 1, opacity = 1) {
  const material = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}
