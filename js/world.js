import * as THREE from 'three';
import {
  PALETTE,
  toonMaterial,
  addOutline,
  makeCanvasTexture,
  gradientMap,
  clamp,
  lerp,
  randomBetween,
  smoothstep
} from './style.js';

const DAY = {
  background: new THREE.Color('#ffffff'),
  ground: new THREE.Color('#ffffff'),
  contour: new THREE.Color('#e7e1d5'),
  ambient: new THREE.Color('#fff6e8'),
  sky: new THREE.Color('#fffaf0'),
  bounce: new THREE.Color('#dbe8ff'),
  sun: new THREE.Color('#ffeed4'),
  fill: new THREE.Color('#bcd7ff')
};

const NIGHT = {
  background: new THREE.Color('#071226'),
  ground: new THREE.Color('#121e37'),
  contour: new THREE.Color('#223657'),
  ambient: new THREE.Color('#1b3157'),
  sky: new THREE.Color('#27446f'),
  bounce: new THREE.Color('#070d18'),
  sun: new THREE.Color('#a5c3ff'),
  fill: new THREE.Color('#315eaa')
};

const GROUND_EMISSIVE_DAY = new THREE.Color('#ffffff');
const GROUND_EMISSIVE_NIGHT = new THREE.Color('#050b16');

function createRockGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    const noise = 1
      + Math.sin(vertex.x * 4.3 + vertex.z * 2.1) * 0.14
      + Math.sin(vertex.y * 5.2 - vertex.x * 2.6) * 0.11
      + Math.cos(vertex.z * 3.7 + vertex.y) * 0.08;
    vertex.multiplyScalar(noise);
    vertex.y *= 0.78;
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createMoonTexture() {
  return makeCanvasTexture(256, 256, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff2ca';
    ctx.strokeStyle = '#172029';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(23,32,41,0.13)';
    const craters = [
      [92, 98, 19], [147, 76, 12], [162, 137, 25], [112, 161, 13], [80, 134, 8]
    ];
    for (const [x, y, r] of craters) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(23,32,41,0.28)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(160, 138, 28, 0.4, 4.2);
    ctx.stroke();
  });
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.rocks = [];
    this.contours = [];
    this.birds = [];
    this.temp = new THREE.Vector3();
    this.night = -1;

    this.buildLights();
    this.buildGround();
    this.buildRocks();
    this.buildSky();
    this.buildBirds();
    this.applyNight(0);
  }

  buildLights() {
    this.ambient = new THREE.AmbientLight(DAY.ambient, 1.15);
    this.scene.add(this.ambient);

    this.hemisphere = new THREE.HemisphereLight(DAY.sky, DAY.bounce, 1.35);
    this.scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(DAY.sun, 2.25);
    this.sun.position.set(-17, 31, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -34;
    this.sun.shadow.camera.right = 34;
    this.sun.shadow.camera.top = 34;
    this.sun.shadow.camera.bottom = -34;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 110;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.radius = 3;
    if ('intensity' in this.sun.shadow) this.sun.shadow.intensity = 0.56;
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(DAY.fill, 0.68);
    this.fill.position.set(13, 10, -22);
    this.scene.add(this.fill);
  }

  setShadowQuality(level) {
    const size = level === 'low' ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  buildGround() {
    const groundGeometry = new THREE.PlaneGeometry(1800, 1800, 1, 1);
    groundGeometry.rotateX(-Math.PI * 0.5);
    this.groundMaterial = new THREE.MeshLambertMaterial({
      color: DAY.ground,
      emissive: '#000000',
      emissiveIntensity: 0
    });
    this.ground = new THREE.Mesh(groundGeometry, this.groundMaterial);
    this.ground.receiveShadow = true;
    this.ground.position.y = 0;
    this.scene.add(this.ground);

    this.contourMaterial = new THREE.LineBasicMaterial({
      color: DAY.contour,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      toneMapped: false
    });

    for (let i = 0; i < 18; i += 1) {
      const line = this.createContour();
      this.contours.push(line);
      this.scene.add(line);
    }
  }

  createContour() {
    const points = [];
    const segments = 72;
    const radiusX = randomBetween(3.5, 13);
    const radiusZ = radiusX * randomBetween(0.4, 1.2);
    const wobble = randomBetween(0.03, 0.11);
    const phase = Math.random() * Math.PI * 2;
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const wob = 1 + Math.sin(angle * 3 + phase) * wobble + Math.sin(angle * 7 - phase) * wobble * 0.4;
      points.push(new THREE.Vector3(
        Math.cos(angle) * radiusX * wob,
        0,
        Math.sin(angle) * radiusZ * wob
      ));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.LineLoop(geometry, this.contourMaterial);
    line.rotation.y = Math.random() * Math.PI;
    const angle = Math.random() * Math.PI * 2;
    const radius = randomBetween(16, 105);
    line.position.set(Math.cos(angle) * radius, 0.008, Math.sin(angle) * radius);
    line.renderOrder = 1;
    return line;
  }

  buildRocks() {
    this.rockGeometries = [
      createRockGeometry(),
      createRockGeometry(),
      createRockGeometry(),
      createRockGeometry()
    ];
    this.rockMaterials = [
      toonMaterial('#d8c49f'),
      toonMaterial('#eadfc9'),
      toonMaterial('#c7b4ae'),
      toonMaterial('#b8aca0')
    ];

    for (let i = 0; i < 30; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomBetween(14, 105);
      const big = i < 18;
      this.spawnRock(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        big ? randomBetween(0.9, 2.35) : randomBetween(0.35, 0.85),
        big
      );
    }

    // A couple of little clusters give the empty plain an authored rhythm.
    for (let i = 0; i < 5; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomBetween(24, 85);
      const baseX = Math.cos(angle) * radius;
      const baseZ = Math.sin(angle) * radius;
      const count = 2 + Math.floor(Math.random() * 3);
      for (let j = 0; j < count; j += 1) {
        this.spawnRock(
          baseX + randomBetween(-2.8, 2.8),
          baseZ + randomBetween(-2.8, 2.8),
          randomBetween(0.28, 0.65),
          false
        );
      }
    }
  }

  spawnRock(x = null, z = null, scale = 1, collidable = true) {
    const geometry = this.rockGeometries[Math.floor(Math.random() * this.rockGeometries.length)];
    const material = this.rockMaterials[Math.floor(Math.random() * this.rockMaterials.length)];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 1.03);
    mesh.rotation.set(randomBetween(-0.15, 0.15), Math.random() * Math.PI * 2, randomBetween(-0.15, 0.15));
    const localScale = randomBetween(0.8, 1.3);
    mesh.scale.set(
      scale * localScale,
      scale * randomBetween(0.56, 1.05),
      scale * localScale * randomBetween(0.8, 1.2)
    );
    mesh.position.set(x ?? 0, mesh.scale.y * 0.62, z ?? 0);
    this.scene.add(mesh);

    const rock = {
      mesh,
      radius: Math.max(mesh.scale.x, mesh.scale.z) * 0.86,
      collidable
    };
    this.rocks.push(rock);
    return rock;
  }

  buildSky() {
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);

    const starCount = 1180;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(randomBetween(0.03, 1));
      const radius = randomBetween(320, 500);
      positions[i * 3] = Math.cos(theta) * Math.sin(phi) * radius;
      positions[i * 3 + 1] = Math.cos(phi) * radius;
      positions[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * radius;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: '#d9e8ff',
      size: 2.0,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    this.stars = new THREE.Points(starGeometry, this.starMaterial);
    this.stars.frustumCulled = false;
    this.skyGroup.add(this.stars);

    this.moonMaterial = new THREE.SpriteMaterial({
      map: createMoonTexture(),
      color: '#ffffff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    this.moon = new THREE.Sprite(this.moonMaterial);
    this.moon.scale.set(64, 64, 1);
    this.moon.position.set(28, 102, 295);
    this.skyGroup.add(this.moon);

    const moonHaloMaterial = new THREE.SpriteMaterial({
      map: this.moonMaterial.map,
      color: '#8da7ff',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    this.moonHalo = new THREE.Sprite(moonHaloMaterial);
    this.moonHalo.scale.set(112, 112, 1);
    this.moonHalo.position.copy(this.moon.position);
    this.skyGroup.add(this.moonHalo);
    this.moonHaloMaterial = moonHaloMaterial;
  }

  buildBirds() {
    this.birdMaterial = new THREE.LineBasicMaterial({
      color: '#b8ab97',
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      toneMapped: false
    });

    const makeBird = () => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.2, 0.22, 0),
        new THREE.Vector3(-0.35, 0, 0),
        new THREE.Vector3(0, 0.12, 0),
        new THREE.Vector3(0.35, 0, 0),
        new THREE.Vector3(1.2, 0.22, 0)
      ]);
      const line = new THREE.Line(geometry, this.birdMaterial);
      line.userData.phase = Math.random() * Math.PI * 2;
      line.userData.radius = randomBetween(45, 90);
      line.userData.height = randomBetween(24, 44);
      line.userData.speed = randomBetween(0.02, 0.05);
      line.scale.setScalar(randomBetween(0.5, 1.0));
      this.skyGroup.add(line);
      this.birds.push(line);
    };

    for (let i = 0; i < 5; i += 1) makeBird();
  }

  applyNight(nightFactor) {
    const n = clamp(nightFactor, 0, 1);
    if (Math.abs(n - this.night) < 0.0001) return;
    this.night = n;

    if (!(this.scene.background instanceof THREE.Color)) {
      this.scene.background = new THREE.Color();
    }
    const background = this.scene.background;
    background.lerpColors(DAY.background, NIGHT.background, n);

    if (!this.scene.fog) this.scene.fog = new THREE.Fog(background.clone(), 88, 520);
    this.scene.fog.color.copy(background);
    this.scene.fog.near = lerp(88, 58, n);
    this.scene.fog.far = lerp(520, 330, n);

    this.groundMaterial.color.lerpColors(DAY.ground, NIGHT.ground, n);
    this.groundMaterial.emissive.lerpColors(GROUND_EMISSIVE_DAY, GROUND_EMISSIVE_NIGHT, n);
    this.groundMaterial.emissiveIntensity = 0.06 * n;

    this.contourMaterial.color.lerpColors(DAY.contour, NIGHT.contour, n);
    this.contourMaterial.opacity = lerp(0.42, 0.26, n);

    this.ambient.color.lerpColors(DAY.ambient, NIGHT.ambient, n);
    this.ambient.intensity = lerp(1.15, 0.58, n);
    this.hemisphere.color.lerpColors(DAY.sky, NIGHT.sky, n);
    this.hemisphere.groundColor.lerpColors(DAY.bounce, NIGHT.bounce, n);
    this.hemisphere.intensity = lerp(1.35, 0.72, n);
    this.sun.color.lerpColors(DAY.sun, NIGHT.sun, n);
    this.sun.intensity = lerp(2.25, 1.25, n);
    this.fill.color.lerpColors(DAY.fill, NIGHT.fill, n);
    this.fill.intensity = lerp(0.68, 0.62, n);

    const starOpacity = smoothstep(clamp((n - 0.3) / 0.7, 0, 1));
    this.starMaterial.opacity = starOpacity * 0.9;
    this.moonMaterial.opacity = starOpacity;
    this.moonHaloMaterial.opacity = starOpacity * 0.2;
    this.birdMaterial.opacity = lerp(0.65, 0, smoothstep(n * 2));
    this.birds.forEach((bird) => { bird.visible = n < 0.55; });
  }

  update(dt, time, carPosition, nightFactor, cameraPosition) {
    this.applyNight(nightFactor);

    this.ground.position.x = carPosition.x;
    this.ground.position.z = carPosition.z;

    // Light follows the car so the 2048px shadow frustum stays useful.
    this.sun.position.set(carPosition.x - 17, 31, carPosition.z + 12);
    this.sun.target.position.set(carPosition.x, 0, carPosition.z);
    this.fill.position.set(carPosition.x + 13, 10, carPosition.z - 22);

    this.skyGroup.position.x = carPosition.x;
    this.skyGroup.position.z = carPosition.z;

    this.moon.position.x = 28 + Math.sin(time * 0.004) * 5;
    this.moon.position.y = 102 + Math.sin(time * 0.006) * 2;
    this.moonHalo.position.copy(this.moon.position);

    this.stars.rotation.y = time * 0.0025;

    for (const bird of this.birds) {
      const { phase, radius, height, speed } = bird.userData;
      const angle = time * speed + phase;
      bird.position.set(
        Math.cos(angle) * radius - 25,
        height + Math.sin(time * 0.3 + phase) * 2,
        Math.sin(angle) * radius - 40
      );
      bird.rotation.y = -angle + Math.PI * 0.5;
      bird.rotation.z = Math.sin(time * 2.3 + phase) * 0.12;
    }

    for (const rock of this.rocks) {
      const dx = rock.mesh.position.x - carPosition.x;
      const dz = rock.mesh.position.z - carPosition.z;
      if (dx * dx + dz * dz > 175 * 175) {
        const angle = Math.random() * Math.PI * 2;
        const radius = randomBetween(55, 135);
        rock.mesh.position.x = carPosition.x + Math.cos(angle) * radius;
        rock.mesh.position.z = carPosition.z + Math.sin(angle) * radius;
        rock.mesh.position.y = rock.mesh.scale.y * 0.62;
        rock.mesh.rotation.y = Math.random() * Math.PI * 2;
      }
    }

    for (const contour of this.contours) {
      const dx = contour.position.x - carPosition.x;
      const dz = contour.position.z - carPosition.z;
      if (dx * dx + dz * dz > 185 * 185) {
        const angle = Math.random() * Math.PI * 2;
        const radius = randomBetween(35, 135);
        contour.position.x = carPosition.x + Math.cos(angle) * radius;
        contour.position.z = carPosition.z + Math.sin(angle) * radius;
        contour.rotation.y = Math.random() * Math.PI;
      }
    }
  }

  checkCollision(x, z, radius = 0.9) {
    for (const rock of this.rocks) {
      if (!rock.collidable) continue;
      const dx = x - rock.mesh.position.x;
      const dz = z - rock.mesh.position.z;
      const minDistance = radius + rock.radius;
      if (dx * dx + dz * dz < minDistance * minDistance) {
        return rock;
      }
    }
    return null;
  }
}
