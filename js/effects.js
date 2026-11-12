import * as THREE from 'three';
import { ParticleSystem } from './particles.js';
import { clamp, randomBetween } from './style.js';

const SMOKE_DARK = new THREE.Color('#4f5761');
const SMOKE_WARM = new THREE.Color('#8d6657');
const DUST = new THREE.Color('#d8c4a2');
const DUST_LIGHT = new THREE.Color('#eddfc5');
const GAS = new THREE.Color('#c9fff2');
const GAS_WARM = new THREE.Color('#ffe3a8');
const JET = new THREE.Color('#65e8db');

export class Effects {
  constructor(scene, car) {
    this.scene = scene;
    this.car = car;

    this.smoke = new ParticleSystem(scene, { max: 460, renderOrder: 21 });
    this.dust = new ParticleSystem(scene, { max: 420, renderOrder: 22 });
    this.gas = new ParticleSystem(scene, { max: 380, renderOrder: 23 });
    this.sparks = new ParticleSystem(scene, {
      max: 240,
      blending: THREE.AdditiveBlending,
      renderOrder: 24
    });

    this.exhaustAccumulator = 0;
    this.dustAccumulator = 0;
    this.gasAccumulator = 0;
    this.jetAccumulator = 0;
    this.sparkAccumulator = 0;

    this.temp = new THREE.Vector3();
    this.tempB = new THREE.Vector3();
    this.rear = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.down = new THREE.Vector3(0, -1, 0);
  }

  setPixelRatio(value) {
    this.smoke.setPixelRatio(value);
    this.dust.setPixelRatio(value);
    this.gas.setPixelRatio(value);
    this.sparks.setPixelRatio(value);
  }

  emitExhaust(dt, state, speedFactor) {
    const { boost = 0, throttle = 0, air = 0 } = state;
    const rate = 2.2
      + Math.abs(throttle) * 18
      + speedFactor * 22
      + boost * 45
      + air * 10;
    this.exhaustAccumulator += dt * rate;
    this.car.getForward(this.forward);
    this.rear.copy(this.forward).multiplyScalar(-1);

    while (this.exhaustAccumulator >= 1) {
      this.exhaustAccumulator -= 1;
      const index = Math.random() < 0.5 ? 0 : 1;
      this.car.getExhaustTip(index, this.temp);
      const color = boost > 0.3 && Math.random() < 0.35 ? SMOKE_WARM : SMOKE_DARK;
      const velocity = this.rear.clone().multiplyScalar(2.2 + speedFactor * 3.0 + boost * 3.2)
        .add(new THREE.Vector3(
          randomBetween(-0.7, 0.7),
          randomBetween(0.2, 0.9),
          randomBetween(-0.7, 0.7)
        ));
      this.smoke.spawn(this.temp, velocity, {
        size: randomBetween(0.24, 0.42),
        endSize: randomBetween(1.05, 1.85),
        color,
        opacity: randomBetween(0.2, 0.4),
        life: randomBetween(0.68, 1.3),
        gravity: -0.12,
        drag: 0.94
      });

      if (boost > 0.25 && Math.random() < 0.5) {
        this.sparks.spawn(this.temp, this.rear.clone().multiplyScalar(4 + boost * 5).add(new THREE.Vector3(
          randomBetween(-0.35, 0.35),
          randomBetween(-0.1, 0.35),
          randomBetween(-0.35, 0.35)
        )), {
          size: randomBetween(0.07, 0.15),
          endSize: 0.02,
          color: Math.random() < 0.5 ? '#ffd36b' : '#ff7b3d',
          opacity: 0.85,
          life: randomBetween(0.16, 0.34),
          gravity: 1.5,
          drag: 0.96
        });
      }
    }
  }

  emitGroundDust(dt, state, speedFactor) {
    if (state.air > 0.2) return;
    if (speedFactor < 0.08 && !state.braking) return;
    const rate = speedFactor * 34 + (state.boost ? 25 : 0);
    this.dustAccumulator += dt * rate;

    this.car.getForward(this.forward);
    this.rear.copy(this.forward).multiplyScalar(-1);
    while (this.dustAccumulator >= 1) {
      this.dustAccumulator -= 1;
      const wheelIndex = Math.random() < 0.5 ? 1 : 3;
      this.car.getWheelGroundPosition(wheelIndex, this.temp);
      this.temp.x += randomBetween(-0.25, 0.25);
      this.temp.z += randomBetween(-0.25, 0.25);
      const velocity = this.rear.clone().multiplyScalar(randomBetween(1.2, 3.5) * (0.4 + speedFactor))
        .add(new THREE.Vector3(
          randomBetween(-1.6, 1.6),
          randomBetween(0.35, 1.15),
          randomBetween(-1.6, 1.6)
        ));
      this.dust.spawn(this.temp, velocity, {
        size: randomBetween(0.26, 0.52),
        endSize: randomBetween(1.2, 2.35),
        color: Math.random() < 0.4 ? DUST_LIGHT : DUST,
        opacity: randomBetween(0.2, 0.4),
        life: randomBetween(0.65, 1.35),
        gravity: -0.18,
        drag: 0.93
      });
    }
  }

  emitTransitionGas(dt, state) {
    if (state.air <= 0.01 || state.air >= 0.99) return;
    const strength = Math.sin(state.air * Math.PI);
    const rate = 56 * strength + 26;
    this.gasAccumulator += dt * rate;

    while (this.gasAccumulator >= 1) {
      this.gasAccumulator -= 1;
      const wheelIndex = Math.floor(Math.random() * 4);
      const wheel = this.car.wheels[wheelIndex];
      wheel.root.getWorldPosition(this.temp);
      this.temp.y -= 0.22;
      this.temp.x += randomBetween(-0.16, 0.16);
      this.temp.z += randomBetween(-0.16, 0.16);
      const velocity = new THREE.Vector3(
        randomBetween(-0.55, 0.55) + wheel.side * 0.35,
        -randomBetween(4.5, 9.5) * (0.55 + strength * 0.7),
        randomBetween(-0.55, 0.55)
      );
      this.gas.spawn(this.temp, velocity, {
        size: randomBetween(0.22, 0.44),
        endSize: randomBetween(0.95, 1.8),
        color: Math.random() < 0.3 ? GAS_WARM : GAS,
        opacity: randomBetween(0.26, 0.48),
        life: randomBetween(0.45, 0.85),
        gravity: 0.25,
        drag: 0.91
      });
    }

    // A few hot sparks around the wheel wells.
    this.sparkAccumulator += dt * 18 * strength;
    while (this.sparkAccumulator >= 1) {
      this.sparkAccumulator -= 1;
      const wheel = this.car.wheels[Math.floor(Math.random() * 4)];
      wheel.root.getWorldPosition(this.temp);
      const velocity = new THREE.Vector3(
        randomBetween(-1.8, 1.8),
        -randomBetween(1.8, 4.5),
        randomBetween(-1.8, 1.8)
      );
      this.sparks.spawn(this.temp, velocity, {
        size: randomBetween(0.05, 0.12),
        endSize: 0.02,
        color: Math.random() < 0.5 ? '#8effe1' : '#ffd36b',
        opacity: 0.82,
        life: randomBetween(0.22, 0.48),
        gravity: 4.5,
        drag: 0.98
      });
    }
  }

  emitWingTrails(dt, state, speedFactor) {
    if (state.air < 0.92) return;
    const { boost = 0 } = state;
    this.jetAccumulator += dt * (18 + speedFactor * 24 + boost * 26);
    this.car.getForward(this.forward);
    this.rear.copy(this.forward).multiplyScalar(-1);

    while (this.jetAccumulator >= 1) {
      this.jetAccumulator -= 1;
      const index = Math.random() < 0.5 ? 0 : 1;
      this.car.getWingTip(index, this.temp);
      const velocity = this.rear.clone().multiplyScalar(3 + speedFactor * 3 + boost * 4)
        .add(new THREE.Vector3(
          randomBetween(-0.3, 0.3),
          randomBetween(-0.4, 0.2),
          randomBetween(-0.3, 0.3)
        ));
      this.sparks.spawn(this.temp, velocity, {
        size: randomBetween(0.08, 0.16),
        endSize: randomBetween(0.35, 0.6),
        color: index === 0 ? '#5df7d8' : '#ff8fd4',
        opacity: 0.36,
        life: randomBetween(0.35, 0.7),
        gravity: 0,
        drag: 0.94
      });
    }
  }

  update(dt, time, state) {
    const speedFactor = clamp(Math.abs(state.speed) / (state.air > 0.5 ? 42 : 28), 0, 1);
    this.emitExhaust(dt, state, speedFactor);
    this.emitGroundDust(dt, state, speedFactor);
    this.emitTransitionGas(dt, state);
    this.emitWingTrails(dt, state, speedFactor);

    this.smoke.update(dt);
    this.dust.update(dt);
    this.gas.update(dt);
    this.sparks.update(dt);
  }

  takeoffBurst() {
    this.car.getForward(this.forward);
    for (let i = 0; i < 18; i += 1) {
      const wheel = this.car.wheels[i % 4];
      wheel.root.getWorldPosition(this.temp);
      const velocity = new THREE.Vector3(
        randomBetween(-2.4, 2.4),
        -randomBetween(2, 6.5),
        randomBetween(-2.4, 2.4)
      );
      this.gas.spawn(this.temp, velocity, {
        size: randomBetween(0.2, 0.45),
        endSize: randomBetween(1.1, 2.1),
        color: Math.random() < 0.4 ? GAS_WARM : GAS,
        opacity: randomBetween(0.25, 0.48),
        life: randomBetween(0.5, 0.9),
        gravity: 0.2,
        drag: 0.92
      });
    }
    for (let i = 0; i < 14; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomBetween(0.3, 2.3);
      this.temp.set(
        this.car.root.position.x + Math.cos(angle) * radius,
        0.08,
        this.car.root.position.z + Math.sin(angle) * radius
      );
      this.dust.spawn(this.temp, new THREE.Vector3(
        Math.cos(angle) * randomBetween(1.5, 5),
        randomBetween(0.5, 1.5),
        Math.sin(angle) * randomBetween(1.5, 5)
      ), {
        size: randomBetween(0.25, 0.55),
        endSize: randomBetween(1.2, 2.2),
        color: DUST,
        opacity: 0.28,
        life: randomBetween(0.6, 1.2),
        gravity: -0.1,
        drag: 0.93
      });
    }
  }

  landingBurst(strength = 1) {
    const count = Math.round(20 * strength);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomBetween(0.2, 2.2);
      this.temp.set(
        this.car.root.position.x + Math.cos(angle) * radius,
        0.1,
        this.car.root.position.z + Math.sin(angle) * radius
      );
      this.dust.spawn(this.temp, new THREE.Vector3(
        Math.cos(angle) * randomBetween(2, 6) * strength,
        randomBetween(0.6, 2.2),
        Math.sin(angle) * randomBetween(2, 6) * strength
      ), {
        size: randomBetween(0.3, 0.6),
        endSize: randomBetween(1.4, 2.6),
        color: Math.random() < 0.4 ? DUST_LIGHT : DUST,
        opacity: randomBetween(0.2, 0.4),
        life: randomBetween(0.6, 1.3),
        gravity: -0.12,
        drag: 0.92
      });
    }
    for (let i = 0; i < 12; i += 1) {
      const wheel = this.car.wheels[i % 4];
      wheel.root.getWorldPosition(this.temp);
      this.gas.spawn(this.temp, new THREE.Vector3(
        randomBetween(-1.4, 1.4),
        -randomBetween(0.6, 2.5),
        randomBetween(-1.4, 1.4)
      ), {
        size: randomBetween(0.25, 0.5),
        endSize: randomBetween(1.1, 1.9),
        color: GAS,
        opacity: 0.25,
        life: randomBetween(0.35, 0.7),
        gravity: 0.4,
        drag: 0.9
      });
    }
  }

  impactBurst(worldPosition, strength = 1) {
    for (let i = 0; i < 14; i += 1) {
      this.temp.copy(worldPosition);
      this.dust.spawn(this.temp, new THREE.Vector3(
        randomBetween(-3.5, 3.5) * strength,
        randomBetween(0.6, 2.8) * strength,
        randomBetween(-3.5, 3.5) * strength
      ), {
        size: randomBetween(0.18, 0.42),
        endSize: randomBetween(0.8, 1.8),
        color: DUST,
        opacity: randomBetween(0.2, 0.38),
        life: randomBetween(0.35, 0.8),
        gravity: 0.4,
        drag: 0.92
      });
    }
  }

  splashDust(x, z, count = 10) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      this.temp.set(x + Math.cos(angle) * randomBetween(0.2, 1.2), 0.08, z + Math.sin(angle) * randomBetween(0.2, 1.2));
      this.dust.spawn(this.temp, new THREE.Vector3(
        Math.cos(angle) * randomBetween(1, 3.5),
        randomBetween(0.3, 1.5),
        Math.sin(angle) * randomBetween(1, 3.5)
      ), {
        size: 0.25,
        endSize: 1.1,
        color: DUST,
        opacity: 0.23,
        life: randomBetween(0.4, 0.9),
        gravity: 0.1,
        drag: 0.93
      });
    }
  }
}
