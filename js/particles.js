import * as THREE from 'three';
import { clamp, randomBetween } from './style.js';

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPixelRatio;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = max(1.0, aSize * uPixelRatio * (250.0 / max(1.0, -mvPosition.z)));
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.08, d);
    float alpha = soft * vAlpha;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;

export class ParticleSystem {
  constructor(scene, {
    max = 320,
    blending = THREE.NormalBlending,
    depthTest = true,
    renderOrder = 20
  } = {}) {
    this.max = max;
    this.cursor = 0;
    this.particles = Array.from({ length: max }, () => ({
      alive: false,
      age: 0,
      life: 1,
      startSize: 1,
      endSize: 1,
      opacity: 1,
      gravity: 0,
      drag: 0.98,
      velocity: new THREE.Vector3()
    }));

    this.positions = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    this.colors = new Float32Array(max * 3);

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    const sizeAttribute = new THREE.BufferAttribute(this.sizes, 1);
    const alphaAttribute = new THREE.BufferAttribute(this.alphas, 1);
    const colorAttribute = new THREE.BufferAttribute(this.colors, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    sizeAttribute.setUsage(THREE.DynamicDrawUsage);
    alphaAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('aSize', sizeAttribute);
    geometry.setAttribute('aColor', colorAttribute);
    geometry.setAttribute('aAlpha', alphaAttribute);

    this.geometry = geometry;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
      },
      transparent: true,
      depthWrite: false,
      depthTest,
      blending
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    scene.add(this.points);
  }

  setPixelRatio(value) {
    this.material.uniforms.uPixelRatio.value = value;
  }

  spawn(position, velocity, {
    size = 0.6,
    endSize = 1.6,
    color = 0xffffff,
    opacity = 0.7,
    life = 1,
    gravity = 0,
    drag = 0.98
  } = {}) {
    const index = this.cursor;
    const p = this.particles[index];
    this.cursor = (this.cursor + 1) % this.max;

    p.alive = true;
    p.age = 0;
    p.life = Math.max(0.05, life);
    p.startSize = size;
    p.endSize = endSize;
    p.opacity = opacity;
    p.gravity = gravity;
    p.drag = drag;
    p.velocity.set(velocity.x, velocity.y, velocity.z);

    this.positions[index * 3] = position.x;
    this.positions[index * 3 + 1] = position.y;
    this.positions[index * 3 + 2] = position.z;

    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    this.colors[index * 3] = c.r;
    this.colors[index * 3 + 1] = c.g;
    this.colors[index * 3 + 2] = c.b;

    this.sizes[index] = Math.max(0.001, size);
    this.alphas[index] = 0;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  update(dt) {
    let active = false;
    const positionAttribute = this.geometry.attributes.position;
    const sizeAttribute = this.geometry.attributes.aSize;
    const alphaAttribute = this.geometry.attributes.aAlpha;

    for (let index = 0; index < this.max; index += 1) {
      const p = this.particles[index];
      if (!p.alive) continue;

      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        this.alphas[index] = 0;
        this.sizes[index] = 0;
        active = true;
        continue;
      }

      const t = p.age / p.life;
      const drag = Math.pow(clamp(p.drag, 0.01, 1), dt * 60);
      p.velocity.multiplyScalar(drag);
      p.velocity.y -= p.gravity * dt;

      this.positions[index * 3] += p.velocity.x * dt;
      this.positions[index * 3 + 1] += p.velocity.y * dt;
      this.positions[index * 3 + 2] += p.velocity.z * dt;

      this.sizes[index] = Math.max(0.001, p.startSize + (p.endSize - p.startSize) * t);
      const fadeIn = clamp(t / 0.08, 0, 1);
      const fadeOut = Math.pow(1 - t, 1.25);
      this.alphas[index] = p.opacity * fadeIn * fadeOut;
      active = true;
    }

    if (active) {
      positionAttribute.needsUpdate = true;
      sizeAttribute.needsUpdate = true;
      alphaAttribute.needsUpdate = true;
    }
  }

  emitCone(origin, direction, count, options = {}) {
    const {
      spread = 0.3,
      speed = 3,
      speedVariance = 1.5,
      positionVariance = 0.1
    } = options;
    for (let i = 0; i < count; i += 1) {
      const velocity = direction.clone()
        .multiplyScalar(speed + randomBetween(-speedVariance, speedVariance))
        .add(new THREE.Vector3(
          randomBetween(-spread, spread),
          randomBetween(-spread, spread),
          randomBetween(-spread, spread)
        ));
      const position = origin.clone().add(new THREE.Vector3(
        randomBetween(-positionVariance, positionVariance),
        randomBetween(-positionVariance, positionVariance),
        randomBetween(-positionVariance, positionVariance)
      ));
      this.spawn(position, velocity, options);
    }
  }
}
