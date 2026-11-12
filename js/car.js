import * as THREE from 'three';
import {
  PALETTE,
  toonMaterial,
  basicMaterial,
  addOutline,
  tubeBetween,
  makeCanvasTexture,
  getGlowTexture,
  getShadowTexture,
  glowSprite,
  clamp,
  lerp,
  smoothstep,
  damp
} from './style.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function makeHullGeometry(sections) {
  const positions = [];
  const indices = [];

  for (const section of sections) {
    const { z, halfWidth, bottom, top } = section;
    positions.push(
      -halfWidth, bottom, z,
      halfWidth, bottom, z,
      -halfWidth, top, z,
      halfWidth, top, z
    );
  }

  const indexOf = (section, corner) => section * 4 + corner;

  for (let i = 0; i < sections.length - 1; i += 1) {
    const j = i + 1;
    const bl = (s) => indexOf(s, 0);
    const br = (s) => indexOf(s, 1);
    const tl = (s) => indexOf(s, 2);
    const tr = (s) => indexOf(s, 3);

    // Top
    indices.push(tl(i), tl(j), tr(j), tl(i), tr(j), tr(i));
    // Bottom
    indices.push(bl(i), br(j), bl(j), bl(i), br(i), br(j));
    // Right side
    indices.push(br(i), tr(j), br(j), br(i), tr(i), tr(j));
    // Left side
    indices.push(bl(i), bl(j), tl(j), bl(i), tl(j), tl(i));
  }

  const last = sections.length - 1;
  // Front cap (largest Z)
  indices.push(
    indexOf(last, 0), indexOf(last, 1), indexOf(last, 3),
    indexOf(last, 0), indexOf(last, 3), indexOf(last, 2)
  );
  // Rear cap (smallest Z)
  indices.push(
    indexOf(0, 0), indexOf(0, 2), indexOf(0, 3),
    indexOf(0, 0), indexOf(0, 3), indexOf(0, 1)
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeNumberTexture() {
  return makeCanvasTexture(256, 256, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.fillStyle = '#ffe9bd';
    ctx.strokeStyle = '#172029';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(0, 0, 104, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#172029';
    ctx.font = '900 142px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('07', 2, 9);
    ctx.restore();
  });
}

function makeJetAlphaTexture() {
  return makeCanvasTexture(64, 256, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.09, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.46, 'rgba(255,255,255,0.82)');
    gradient.addColorStop(0.78, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function makeFlagTexture() {
  return makeCanvasTexture(640, 320, (ctx, width, height) => {
    ctx.fillStyle = '#e86043';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#f5b848';
    ctx.beginPath();
    ctx.arc(width * 0.72, height * 0.34, 72, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffe9bd';
    ctx.lineWidth = 34;
    ctx.beginPath();
    ctx.moveTo(-20, height * 0.78);
    ctx.bezierCurveTo(width * 0.25, height * 0.55, width * 0.55, height * 0.96, width + 20, height * 0.7);
    ctx.stroke();

    ctx.strokeStyle = '#172029';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-20, height * 0.9);
    ctx.bezierCurveTo(width * 0.25, height * 0.67, width * 0.55, height * 1.08, width + 20, height * 0.82);
    ctx.stroke();

    ctx.fillStyle = '#172029';
    ctx.font = '900 64px Arial, sans-serif';
    ctx.fillText('07', 32, 80);

    ctx.strokeStyle = '#172029';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, width - 14, height - 14);
  });
}

export class RacerCar {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'Racer';
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);

    this.wheels = [];
    this.wings = [];
    this.exhaustTips = [];
    this.wingTipRefs = [];
    this.headlightDiscs = [];
    this.tailLightMaterials = [];
    this.underglowStrips = [];
    this.night = 0;
    this.bump = 0;
    this.bumpVelocity = 0;
    this.steerVisual = 0;

    this.buildMaterials();
    this.buildHull();
    this.buildDetails();
    this.buildCockpit();
    this.buildWheels();
    this.buildLiftJets();
    this.buildExhausts();
    this.buildWings();
    this.buildFlag();
    this.buildLights();
    this.buildGroundEffects();

    this.tempA = new THREE.Vector3();
    this.tempB = new THREE.Vector3();
    this.tempDirection = new THREE.Vector3();
  }

  buildMaterials() {
    this.mat = {
      coral: toonMaterial(PALETTE.coral),
      coralDeep: toonMaterial(PALETTE.coralDeep),
      coralLight: toonMaterial(PALETTE.coralLight),
      cream: toonMaterial(PALETTE.cream),
      sand: toonMaterial(PALETTE.sand),
      teal: toonMaterial(PALETTE.teal),
      tealDeep: toonMaterial(PALETTE.tealDeep),
      ink: toonMaterial('#202932'),
      tire: toonMaterial('#242e36'),
      gold: toonMaterial(PALETTE.gold),
      red: toonMaterial(PALETTE.red),
      glass: toonMaterial('#0d5661', {
        emissive: '#063f49',
        emissiveIntensity: 0.35
      }),
      headlight: toonMaterial('#fff4cc', {
        emissive: '#ffd979',
        emissiveIntensity: 0
      }),
      tail: toonMaterial('#9d1f22', {
        emissive: '#ff342f',
        emissiveIntensity: 0
      })
    };
  }

  addPart(mesh, {
    parent = this.body,
    outline = false,
    outlineScale = 1.025,
    cast = true,
    receive = true
  } = {}) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    if (outline) addOutline(mesh, outlineScale);
    parent.add(mesh);
    return mesh;
  }

  buildHull() {
    const hull = new THREE.Mesh(
      makeHullGeometry([
        { z: -1.72, halfWidth: 0.79, bottom: 0.48, top: 0.88 },
        { z: -1.0, halfWidth: 0.94, bottom: 0.44, top: 1.02 },
        { z: 0.2, halfWidth: 0.97, bottom: 0.43, top: 1.05 },
        { z: 1.3, halfWidth: 0.84, bottom: 0.44, top: 0.83 },
        { z: 2.05, halfWidth: 0.62, bottom: 0.48, top: 0.68 }
      ]),
      this.mat.coral
    );
    this.addPart(hull, { outline: true, outlineScale: 1.018 });
    this.hull = hull;

    // Belly plate
    const belly = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.12, 3.9), this.mat.ink);
    belly.position.set(0, 0.33, 0.05);
    this.addPart(belly);

    // Side pods and skirts
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 2.5), this.mat.coralDeep);
      pod.position.set(side * 0.96, 0.58, -0.05);
      this.addPart(pod, { outline: true, outlineScale: 1.04 });

      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 2.4), this.mat.cream);
      skirt.position.set(side * 0.93, 0.4, 0.15);
      this.addPart(skirt);
    }

    // Nose splitter
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.64), this.mat.cream);
    splitter.position.set(0, 0.35, 2.16);
    this.addPart(splitter, { outline: true, outlineScale: 1.04 });

    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.06, 0.12), this.mat.ink);
    lip.position.set(0, 0.33, 2.48);
    this.addPart(lip);

    // Front canards
    for (const side of [-1, 1]) {
      const canard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.045, 0.28), this.mat.cream);
      canard.position.set(side * 0.82, 0.55, 1.72);
      canard.rotation.z = side * 0.18;
      this.addPart(canard, { outline: true, outlineScale: 1.05 });
    }

    // Hood stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 1.45), this.mat.cream);
    stripe.position.set(0, 0.925, 0.64);
    stripe.rotation.x = -0.045;
    this.addPart(stripe);

    // Grille
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.2, 0.08), this.mat.ink);
    grille.position.set(0, 0.54, 2.1);
    this.addPart(grille);
    for (let i = 0; i < 3; i += 1) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.023, 0.035), this.mat.gold);
      slat.position.set(0, 0.49 + i * 0.055, 2.145);
      this.addPart(slat);
    }

    // Rear deck fins
    for (let i = 0; i < 4; i += 1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1.14 - i * 0.05, 0.035, 0.09), this.mat.cream);
      fin.position.set(0, 1.0 - i * 0.015, -0.96 - i * 0.18);
      this.addPart(fin);
    }

    // Rear spoiler
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.09, 0.55), this.mat.cream);
    spoiler.position.set(0, 1.72, -1.94);
    spoiler.rotation.x = 0.1;
    this.addPart(spoiler, { outline: true, outlineScale: 1.025 });

    for (const side of [-1, 1]) {
      const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.4, 0.62), this.mat.coralDeep);
      endplate.position.set(side * 1.22, 1.79, -1.95);
      this.addPart(endplate, { outline: true, outlineScale: 1.07 });

      const strut = tubeBetween(
        [side * 0.66, 0.98, -1.72],
        [side * 1.02, 1.67, -1.92],
        0.045,
        this.mat.ink
      );
      this.addPart(strut);
    }

    // Door number roundels
    const numberTexture = makeNumberTexture();
    const numberMaterial = new THREE.MeshBasicMaterial({
      map: numberTexture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    for (const side of [-1, 1]) {
      const roundel = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), numberMaterial);
      roundel.position.set(side * 0.988, 0.77, 0.35);
      roundel.rotation.y = side * Math.PI * 0.5;
      this.addPart(roundel, { cast: false, receive: false });
    }
  }

  buildDetails() {
    // Fender arches
    for (const side of [-1, 1]) {
      for (const front of [true, false]) {
        const fender = new THREE.Mesh(
          new THREE.TorusGeometry(0.79, 0.12, 4, 16, Math.PI),
          this.mat.coral
        );
        fender.rotation.y = Math.PI * 0.5;
        fender.position.set(side * 1.11, 0.7, front ? 1.45 : -1.45);
        this.addPart(fender, { outline: true, outlineScale: 1.035 });

        const fenderLip = new THREE.Mesh(
          new THREE.TorusGeometry(0.82, 0.035, 3, 16, Math.PI),
          this.mat.cream
        );
        fenderLip.rotation.y = Math.PI * 0.5;
        fenderLip.position.set(side * 1.13, 0.7, front ? 1.45 : -1.45);
        this.addPart(fenderLip, { cast: false });
      }
    }

    // Side impact rails
    for (const side of [-1, 1]) {
      const rail = tubeBetween(
        [side * 0.78, 0.9, 1.4],
        [side * 0.8, 1.0, -1.2],
        0.04,
        this.mat.cream
      );
      this.addPart(rail);
    }
  }

  buildCockpit() {
    const cockpitRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.57, 0.055, 4, 16),
      this.mat.ink
    );
    cockpitRim.rotation.x = Math.PI * 0.5;
    cockpitRim.scale.z = 1.35;
    cockpitRim.position.set(0, 1.06, -0.38);
    this.addPart(cockpitRim);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.68, 0.18), this.mat.ink);
    seat.position.set(0, 1.23, -0.82);
    seat.rotation.x = -0.15;
    this.addPart(seat);

    const seatPad = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.12), this.mat.gold);
    seatPad.position.set(0, 1.36, -0.7);
    this.addPart(seatPad);

    // Driver
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, 0.38), this.mat.teal);
    torso.position.set(0, 1.22, -0.48);
    this.addPart(torso, { outline: true, outlineScale: 1.05 });

    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.34), this.mat.tealDeep);
    shoulder.position.set(0, 1.45, -0.5);
    this.addPart(shoulder);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), this.mat.cream);
    helmet.position.set(0, 1.62, -0.42);
    helmet.scale.z = 1.07;
    this.addPart(helmet, { outline: true, outlineScale: 1.04 });

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.13, 0.07), this.mat.ink);
    visor.position.set(0, 1.64, -0.165);
    visor.rotation.x = -0.08;
    this.addPart(visor);

    const helmetStripe = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.52), this.mat.coral);
    helmetStripe.position.set(0, 1.88, -0.43);
    this.addPart(helmetStripe);

    // Windscreen
    const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.07), this.mat.glass);
    windscreen.position.set(0, 1.24, 0.23);
    windscreen.rotation.x = -0.56;
    this.addPart(windscreen, { outline: true, outlineScale: 1.045 });

    // Steering wheel
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 4, 12), this.mat.ink);
    wheel.position.set(0, 1.24, 0.04);
    wheel.rotation.x = 0.35;
    this.addPart(wheel);
    const wheelHub = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.055), this.mat.gold);
    wheelHub.position.set(0, 1.24, 0.04);
    this.addPart(wheelHub);

    // Roll cage
    const cagePoints = [
      [[-0.68, 0.92, -1.18], [-0.63, 1.82, -0.56]],
      [[0.68, 0.92, -1.18], [0.63, 1.82, -0.56]],
      [[-0.63, 1.82, -0.56], [-0.62, 1.58, 0.5]],
      [[0.63, 1.82, -0.56], [0.62, 1.58, 0.5]],
      [[-0.63, 1.82, -0.56], [0.63, 1.82, -0.56]],
      [[-0.62, 1.58, 0.5], [0.62, 1.58, 0.5]],
      [[-0.63, 1.82, -0.56], [0, 1.94, -0.58]],
      [[0, 1.94, -0.58], [0.63, 1.82, -0.56]]
    ];
    for (const [a, b] of cagePoints) {
      this.addPart(tubeBetween(a, b, 0.037, this.mat.ink));
    }

    // Small pennant on the cage
    const miniPole = tubeBetween([0.62, 1.58, 0.5], [0.66, 2.08, 0.14], 0.018, this.mat.ink);
    this.addPart(miniPole);
  }

  buildWheels() {
    const tireGeometry = new THREE.CylinderGeometry(0.7, 0.7, 0.54, 12, 1);
    tireGeometry.rotateZ(Math.PI * 0.5);

    const treadGeometry = new THREE.BoxGeometry(0.565, 0.12, 0.2);
    const rimGeometry = new THREE.CylinderGeometry(0.23, 0.23, 0.58, 10);
    rimGeometry.rotateZ(Math.PI * 0.5);
    const ringGeometry = new THREE.TorusGeometry(0.47, 0.048, 4, 16);
    ringGeometry.rotateY(Math.PI * 0.5);

    for (const front of [true, false]) {
      for (const side of [-1, 1]) {
        const root = new THREE.Group();
        root.position.set(side * 1.12, 0.7, front ? 1.45 : -1.45);
        const steer = new THREE.Group();
        const spin = new THREE.Group();
        root.add(steer);
        steer.add(spin);
        this.body.add(root);

        const tire = new THREE.Mesh(tireGeometry, this.mat.tire);
        tire.castShadow = true;
        tire.receiveShadow = true;
        addOutline(tire, 1.035);
        spin.add(tire);

        for (let i = 0; i < 11; i += 1) {
          const angle = (i / 11) * Math.PI * 2;
          const tread = new THREE.Mesh(treadGeometry, this.mat.ink);
          tread.position.set(0, Math.sin(angle) * 0.685, Math.cos(angle) * 0.685);
          tread.rotation.x = angle;
          tread.castShadow = true;
          spin.add(tread);
        }

        const rim = new THREE.Mesh(rimGeometry, this.mat.sand);
        rim.castShadow = true;
        addOutline(rim, 1.06);
        spin.add(rim);

        for (const face of [-1, 1]) {
          const ring = new THREE.Mesh(ringGeometry, this.mat.cream);
          ring.position.x = face * 0.275;
          spin.add(ring);
        }

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.62, 8), this.mat.ink);
        hub.rotation.z = Math.PI * 0.5;
        spin.add(hub);

        for (let i = 0; i < 5; i += 1) {
          const spokePivot = new THREE.Group();
          spokePivot.rotation.x = (i / 5) * Math.PI * 2;
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.35, 0.075), this.mat.gold);
          spoke.position.set(side * 0.292, 0.19, 0);
          spoke.castShadow = true;
          spokePivot.add(spoke);
          spin.add(spokePivot);
        }

        this.wheels.push({
          root,
          steer,
          spin,
          side,
          front,
          baseX: side * 1.12,
          baseY: 0.7,
          baseZ: front ? 1.45 : -1.45
        });
      }
    }
  }

  buildLiftJets() {
    this.liftJets = [];
    const alphaMap = makeJetAlphaTexture();
    this.liftJetMaterial = new THREE.MeshBasicMaterial({
      color: '#9be9dc',
      transparent: true,
      opacity: 0,
      alphaMap,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      toneMapped: false
    });
    this.liftJetCoreMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0,
      alphaMap,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      toneMapped: false
    });

    const length = 2.55;
    for (const wheel of this.wheels) {
      const group = new THREE.Group();
      group.visible = false;
      const outer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.34, length, 9, 1, true),
        this.liftJetMaterial
      );
      outer.position.y = -length * 0.5;
      group.add(outer);
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.13, length * 0.8, 7, 1, true),
        this.liftJetCoreMaterial
      );
      core.position.y = -length * 0.4;
      group.add(core);
      this.body.add(group);
      this.liftJets.push({ group, wheel, length });
    }
  }

  buildExhausts() {
    const pipeGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.3, 12, 1);
    pipeGeometry.rotateX(Math.PI * 0.5);
    const collarGeometry = new THREE.TorusGeometry(0.31, 0.05, 4, 14);
    const innerGeometry = new THREE.CircleGeometry(0.205, 14);
    const tipGeometry = new THREE.CylinderGeometry(0.345, 0.3, 0.2, 12, 1);
    tipGeometry.rotateX(Math.PI * 0.5);

    for (const side of [-1, 1]) {
      const x = side * 0.68;
      const pipe = new THREE.Mesh(pipeGeometry, this.mat.cream);
      pipe.position.set(x, 0.82, -1.68);
      pipe.rotation.x = -0.05;
      this.addPart(pipe, { outline: true, outlineScale: 1.035 });

      const heatShield = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.065, 0.78), this.mat.gold);
      heatShield.position.set(x, 1.125, -1.5);
      this.addPart(heatShield);

      for (const z of [-1.17, -2.03]) {
        const collar = new THREE.Mesh(collarGeometry, this.mat.ink);
        collar.position.set(x, 0.82, z);
        this.addPart(collar);
      }

      const tip = new THREE.Mesh(tipGeometry, this.mat.sand);
      tip.position.set(x, 0.82, -2.31);
      this.addPart(tip, { outline: true, outlineScale: 1.04 });

      const tipLip = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.022, 4, 16), this.mat.ink);
      tipLip.position.set(x, 0.82, -2.423);
      this.addPart(tipLip);

      const inner = new THREE.Mesh(innerGeometry, toonMaterial('#341b19'));
      inner.position.set(x, 0.82, -2.416);
      inner.rotation.y = Math.PI;
      this.addPart(inner, { cast: false });

      const glowRing = new THREE.Mesh(
        new THREE.RingGeometry(0.212, 0.27, 18),
        basicMaterial(PALETTE.coralLight, {
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide
        })
      );
      glowRing.position.set(x, 0.82, -2.42);
      glowRing.rotation.y = Math.PI;
      this.addPart(glowRing, { cast: false, receive: false });
      this.exhaustGlowMaterials = this.exhaustGlowMaterials || [];
      this.exhaustGlowMaterials.push(glowRing.material);

      const ref = new THREE.Object3D();
      ref.position.set(x, 0.82, -2.45);
      this.body.add(ref);
      this.exhaustTips.push(ref);

      const glow = glowSprite(PALETTE.coralLight, 0.82, 0);
      glow.position.set(x, 0.82, -2.445);
      this.body.add(glow);
      this.exhaustGlowSprites = this.exhaustGlowSprites || [];
      this.exhaustGlowSprites.push(glow);
    }

    // Exhaust headers emerging from the body
    for (const side of [-1, 1]) {
      const header = tubeBetween(
        [side * 0.42, 0.58, -0.55],
        [side * 0.68, 0.82, -1.12],
        0.14,
        this.mat.sand
      );
      this.addPart(header);
    }
  }

  buildWings() {
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0.02, 0.82);
    wingShape.lineTo(0.22, 0.96);
    wingShape.lineTo(0.96, 0.76);
    wingShape.lineTo(2.08, 0.26);
    wingShape.lineTo(1.82, -0.06);
    wingShape.lineTo(1.14, -0.55);
    wingShape.lineTo(0.08, -0.72);
    wingShape.closePath();

    const wingGeometry = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.075,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1
    });
    wingGeometry.rotateX(Math.PI * 0.5);

    const stripeShape = new THREE.Shape();
    stripeShape.moveTo(0.12, 0.64);
    stripeShape.lineTo(0.9, 0.5);
    stripeShape.lineTo(1.88, 0.11);
    stripeShape.lineTo(1.79, -0.04);
    stripeShape.lineTo(0.82, 0.33);
    stripeShape.lineTo(0.12, 0.47);
    stripeShape.closePath();
    const stripeGeometry = new THREE.ExtrudeGeometry(stripeShape, {
      depth: 0.02,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1
    });
    stripeGeometry.rotateX(Math.PI * 0.5);

    const leadingShape = new THREE.Shape();
    leadingShape.moveTo(0.02, 0.82);
    leadingShape.lineTo(0.22, 0.96);
    leadingShape.lineTo(0.96, 0.76);
    leadingShape.lineTo(2.08, 0.26);
    leadingShape.lineTo(1.94, 0.15);
    leadingShape.lineTo(0.9, 0.63);
    leadingShape.lineTo(0.14, 0.78);
    leadingShape.closePath();
    const leadingGeometry = new THREE.ExtrudeGeometry(leadingShape, {
      depth: 0.025,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1
    });
    leadingGeometry.rotateX(Math.PI * 0.5);

    for (const side of [-1, 1]) {
      const wingGroup = new THREE.Group();
      wingGroup.position.set(side * 0.78, 1.04, -0.18);
      wingGroup.scale.x = side * 0.001;
      wingGroup.visible = false;
      this.body.add(wingGroup);

      const wing = new THREE.Mesh(wingGeometry, [this.mat.cream, this.mat.coralDeep]);
      wing.castShadow = true;
      wing.receiveShadow = true;
      addOutline(wing, 1.045);
      wingGroup.add(wing);

      const leading = new THREE.Mesh(leadingGeometry, this.mat.coral);
      leading.position.y = 0.05;
      leading.castShadow = true;
      wingGroup.add(leading);

      const stripe = new THREE.Mesh(stripeGeometry, this.mat.teal);
      stripe.position.y = 0.055;
      stripe.castShadow = true;
      wingGroup.add(stripe);

      // A printed sun roundel gives the wing a hand-drawn comic identity.
      const sunOuter = new THREE.Mesh(
        new THREE.CircleGeometry(0.32, 20),
        basicMaterial(PALETTE.coral, { side: THREE.DoubleSide, toneMapped: false })
      );
      sunOuter.rotation.x = -Math.PI * 0.5;
      sunOuter.position.set(1.44, 0.078, -0.1);
      wingGroup.add(sunOuter);
      const sunRing = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.355, 20),
        basicMaterial(PALETTE.ink, { side: THREE.DoubleSide, toneMapped: false })
      );
      sunRing.rotation.x = -Math.PI * 0.5;
      sunRing.position.set(1.44, 0.078, -0.1);
      wingGroup.add(sunRing);
      const sunCore = new THREE.Mesh(
        new THREE.CircleGeometry(0.115, 16),
        basicMaterial(PALETTE.gold, { side: THREE.DoubleSide, toneMapped: false })
      );
      sunCore.rotation.x = -Math.PI * 0.5;
      sunCore.position.set(1.44, 0.08, -0.1);
      wingGroup.add(sunCore);

      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 8), this.mat.ink);
      hinge.rotation.z = Math.PI * 0.5;
      hinge.position.set(0.1, 0.02, 0.02);
      wingGroup.add(hinge);

      // Exposed mechanical spars under the membrane.
      const sparA = tubeBetween([0.15, -0.015, 0.05], [1.9, -0.015, 0.12], 0.022, this.mat.ink, 5);
      const sparB = tubeBetween([0.12, -0.014, -0.3], [1.5, -0.014, -0.15], 0.02, this.mat.ink, 5);
      wingGroup.add(sparA, sparB);

      const tipPod = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), this.mat.tealDeep);
      tipPod.scale.set(1.5, 0.82, 2.8);
      tipPod.position.set(2.0, 0.0, -0.06);
      tipPod.castShadow = true;
      wingGroup.add(tipPod);

      const tipFin = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.44), this.mat.coralDeep);
      tipFin.position.set(1.88, 0.1, -0.29);
      tipFin.rotation.x = -0.2;
      tipFin.castShadow = true;
      wingGroup.add(tipFin);

      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.22, 8), this.mat.ink);
      nozzle.rotation.x = Math.PI * 0.5;
      nozzle.position.set(2.0, 0.0, -0.38);
      wingGroup.add(nozzle);

      const nozzleGlow = new THREE.Mesh(
        new THREE.CircleGeometry(0.08, 10),
        basicMaterial(PALETTE.glow, { transparent: true, opacity: 0.8, toneMapped: false })
      );
      nozzleGlow.position.set(2.0, 0.0, -0.494);
      nozzleGlow.rotation.y = Math.PI;
      wingGroup.add(nozzleGlow);

      const tipRef = new THREE.Object3D();
      tipRef.position.set(2.0, 0.0, -0.55);
      wingGroup.add(tipRef);
      this.wingTipRefs.push(tipRef);

      const jetGlow = glowSprite(PALETTE.glow, 0.9, 0);
      jetGlow.position.set(2.0, 0.0, -0.5);
      wingGroup.add(jetGlow);

      this.wings.push({
        side,
        group: wingGroup,
        glow: jetGlow,
        glowMaterial: jetGlow.material,
        nozzleGlowMaterial: nozzleGlow.material
      });
    }
  }

  buildFlag() {
    const poleHeight = 2.1;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.035, poleHeight, 6),
      this.mat.ink
    );
    pole.position.set(-0.55, 1.78, -1.1);
    this.addPart(pole);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this.mat.gold);
    finial.position.set(-0.55, 2.85, -1.1);
    this.addPart(finial);

    const flagGeometry = new THREE.PlaneGeometry(1.65, 0.9, 18, 7);
    flagGeometry.translate(0.825, -0.45, 0);
    const flagMaterial = new THREE.MeshBasicMaterial({
      map: makeFlagTexture(),
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.set(-0.55, 2.82, -1.1);
    flag.rotation.y = Math.PI * 0.5;
    flag.castShadow = true;
    this.body.add(flag);

    this.flag = flag;
    this.flagBase = new Float32Array(flagGeometry.attributes.position.array);
  }

  buildLights() {
    for (const side of [-1, 1]) {
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.13, 10), this.mat.sand);
      housing.rotation.x = Math.PI * 0.5;
      housing.position.set(side * 0.52, 0.7, 2.06);
      this.addPart(housing, { outline: true, outlineScale: 1.05 });

      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.125, 12), this.mat.headlight);
      lamp.position.set(side * 0.52, 0.7, 2.135);
      this.addPart(lamp, { cast: false, receive: false });
      this.headlightDiscs.push(lamp);

      const halo = glowSprite('#ffe3a0', 0.9, 0);
      halo.position.set(side * 0.52, 0.7, 2.16);
      this.body.add(halo);
      this.headlightHalos = this.headlightHalos || [];
      this.headlightHalos.push(halo);

      const tailLamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.065), this.mat.tail);
      tailLamp.position.set(side * 0.91, 0.8, -1.77);
      this.addPart(tailLamp, { cast: false });
      this.tailLightMaterials.push(this.mat.tail);

      const tailHalo = glowSprite('#ff4a3d', 0.9, 0);
      tailHalo.position.set(side * 0.91, 0.8, -1.84);
      this.body.add(tailHalo);
      this.tailHalos = this.tailHalos || [];
      this.tailHalos.push(tailHalo);
    }

    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.055, 0.05), this.mat.tail);
    tailBar.position.set(0, 1.0, -1.78);
    this.addPart(tailBar, { cast: false });

    // Chassis neon strips
    for (const side of [-1, 1]) {
      const stripMaterial = basicMaterial(side === -1 ? PALETTE.glow : PALETTE.magenta, {
        transparent: true,
        opacity: 0,
        toneMapped: false
      });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 2.3), stripMaterial);
      strip.position.set(side * 0.74, 0.3, 0.02);
      this.body.add(strip);
      this.underglowStrips.push(stripMaterial);
    }

    // Physical headlights
    this.headlightSpot = new THREE.SpotLight(0xffe1a3, 0, 46, 0.4, 0.65, 1.1);
    this.headlightSpot.position.set(0, 0.72, 1.98);
    this.headlightSpot.target.position.set(0, -0.4, 16);
    this.body.add(this.headlightSpot);
    this.body.add(this.headlightSpot.target);

    // Chassis ambient wash
    this.underLightA = new THREE.PointLight(0x51f5d9, 0, 8, 2);
    this.underLightA.position.set(-0.55, 0.15, 0.4);
    this.body.add(this.underLightA);
    this.underLightB = new THREE.PointLight(0xff58bb, 0, 8, 2);
    this.underLightB.position.set(0.55, 0.15, -0.3);
    this.body.add(this.underLightB);
  }

  buildGroundEffects() {
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: getShadowTexture(),
      color: 0x1b2028,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      toneMapped: false
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 8.4), shadowMaterial);
    shadow.rotation.x = -Math.PI * 0.5;
    this.shadowGroup = new THREE.Group();
    this.shadowGroup.add(shadow);
    this.scene.add(this.shadowGroup);
    this.shadowMaterial = shadowMaterial;
    this.shadowMesh = shadow;

    const makeGlowDisc = (color, scaleX, scaleZ, opacity = 0) => {
      const material = new THREE.MeshBasicMaterial({
        map: getGlowTexture(),
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scaleX, scaleZ), material);
      mesh.rotation.x = -Math.PI * 0.5;
      return mesh;
    };

    this.underglowGroup = new THREE.Group();
    this.underglowTeal = makeGlowDisc(0x48f5d8, 4.2, 5.4, 0);
    this.underglowMagenta = makeGlowDisc(0xff53bf, 2.8, 3.8, 0);
    this.underglowMagenta.position.x = 0.2;
    this.underglowGroup.add(this.underglowTeal, this.underglowMagenta);
    this.scene.add(this.underglowGroup);

    const beamMaterial = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: 0xffe7b1,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    this.beam = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 18), beamMaterial);
    this.beam.rotation.x = -Math.PI * 0.5;
    this.beamGroup = new THREE.Group();
    this.beamGroup.add(this.beam);
    this.scene.add(this.beamGroup);
    this.beamMaterial = beamMaterial;
  }

  setNight(nightFactor) {
    this.night = clamp(nightFactor, 0, 1);
    const n = this.night;

    this.mat.headlight.emissiveIntensity = 0.05 + n * 2.6;
    this.mat.tail.emissiveIntensity = n * 1.9;
    this.headlightSpot.intensity = n * 95;
    this.underLightA.intensity = n * 7;
    this.underLightB.intensity = n * 5;

    this.headlightHalos.forEach((halo) => { halo.material.opacity = n * 0.95; });
    this.tailHalos.forEach((halo) => { halo.material.opacity = n * 0.95; });
    this.underglowStrips.forEach((material) => { material.opacity = n * 0.9; });

    this.underglowTeal.material.opacity = n * 0.34;
    this.underglowMagenta.material.opacity = n * 0.2;
    this.beamMaterial.opacity = n * 0.5;
    this.headlightSpot.visible = n > 0.02;
    this.underLightA.visible = n > 0.02;
    this.underLightB.visible = n > 0.02;
  }

  impact(strength = 1) {
    this.bumpVelocity = -Math.abs(strength) * 0.5;
    this.bump = Math.min(0.22, this.bump + strength * 0.16);
  }

  getForward(target = new THREE.Vector3()) {
    return target.set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
  }

  getRight(target = new THREE.Vector3()) {
    return target.set(Math.cos(this.root.rotation.y), 0, -Math.sin(this.root.rotation.y));
  }

  getExhaustTip(index, target = new THREE.Vector3()) {
    return this.exhaustTips[index % this.exhaustTips.length].getWorldPosition(target);
  }

  getWingTip(index, target = new THREE.Vector3()) {
    return this.wingTipRefs[index % this.wingTipRefs.length].getWorldPosition(target);
  }

  getWheelGroundPosition(index, target = new THREE.Vector3()) {
    const wheel = this.wheels[index % this.wheels.length];
    target.set(wheel.baseX, 0.1, wheel.baseZ);
    this.root.localToWorld(target);
    target.y = 0.08;
    return target;
  }

  updateFlag(time, speedFactor) {
    if (!this.flag) return;
    const positions = this.flag.geometry.attributes.position;
    const base = this.flagBase;
    const flutter = 5.2 + speedFactor * 7.5;
    for (let i = 0; i < positions.count; i += 1) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const u = clamp(x / 1.65, 0, 1);
      const wave = Math.sin(x * 5.6 - time * flutter + y * 2.0) * (0.055 + speedFactor * 0.13);
      positions.setZ(i, wave * u * u + Math.sin(time * 2.2 + y * 3.0) * 0.015 * u);
      positions.setY(i, y + Math.sin(x * 3.2 - time * flutter * 0.8) * 0.04 * u * speedFactor);
    }
    positions.needsUpdate = true;
    this.flag.geometry.computeVertexNormals();
  }

  update(dt, time, state) {
    const {
      speed = 0,
      steer = 0,
      air = 0,
      boost = 0,
      throttle = 0,
      vertical = 0
    } = state;

    const airSmooth = smoothstep(air);
    const speedFactor = clamp(Math.abs(speed) / 32, 0, 1);
    const hoverBob = airSmooth * (Math.sin(time * 2.35) * 0.055 + Math.sin(time * 1.13 + 1.4) * 0.025);

    // Suspension bounce: spring toward zero.
    this.bumpVelocity += (-this.bump * 27 - this.bumpVelocity * 8.5) * dt;
    this.bump += this.bumpVelocity * dt;
    this.bump = clamp(this.bump, -0.12, 0.22);

    const groundRumble = airSmooth < 0.5 && Math.abs(speed) > 1
      ? Math.sin(time * (14 + speedFactor * 17)) * 0.006 * speedFactor
      : 0;

    this.body.position.y = hoverBob + this.bump + groundRumble;
    this.steerVisual = damp(this.steerVisual, steer, 8, dt);

    const groundRoll = this.steerVisual * speedFactor * 0.075;
    const flyingRoll = -this.steerVisual * (0.27 + speedFactor * 0.09);
    const targetRoll = lerp(groundRoll, flyingRoll, airSmooth);
    this.body.rotation.z = damp(this.body.rotation.z, targetRoll, 5.4, dt);

    const groundPitch = -throttle * 0.028 * speedFactor;
    const flyingPitch = -0.035 - throttle * 0.055 - vertical * 0.028;
    const targetPitch = lerp(groundPitch, flyingPitch, airSmooth);
    this.body.rotation.x = damp(this.body.rotation.x, targetPitch, 4.5, dt);

    // Wings unfold with a mechanical overshoot.
    const wingExt = smoothstep(clamp((air - 0.03) / 0.82, 0, 1));
    for (const wing of this.wings) {
      const lift = smoothstep(clamp((air - 0.42) / 0.3, 0, 1));
      wing.group.visible = wingExt > 0.014;
      wing.group.scale.x = wing.side * Math.max(0.001, wingExt);
      wing.group.scale.y = 0.62 + wingExt * 0.38;
      wing.group.scale.z = 0.6 + wingExt * 0.4;
      wing.group.rotation.z = wing.side * ((1 - wingExt) * 0.45 + wingExt * 0.06);
      wing.group.position.y = 1.04 + lift * 0.09 + Math.sin(time * 2.1 + wing.side) * 0.012 * airSmooth;
      wing.glowMaterial.opacity = airSmooth * (0.45 + boost * 0.55);
      wing.glow.scale.setScalar(0.9 + airSmooth * 0.65 + boost * 0.55);
      wing.nozzleGlowMaterial.opacity = 0.5 + airSmooth * 0.5;
    }

    // Wheels fold up and tuck into the body while the wings deploy.
    for (const wheel of this.wheels) {
      const fold = smoothstep(clamp((air - 0.08) / 0.66, 0, 1));
      wheel.root.position.x = wheel.baseX - wheel.side * 0.58 * fold;
      wheel.root.position.y = wheel.baseY - 0.08 * fold;
      wheel.root.rotation.z = -wheel.side * 1.34 * fold;
      wheel.root.rotation.x = -0.12 * fold;
      wheel.root.scale.setScalar(1 - 0.38 * fold);
      wheel.steer.rotation.y = (wheel.front ? this.steerVisual * 0.42 : 0) * (1 - fold);
      wheel.spin.rotation.x += speed * dt / 0.7 * (1 - fold * 1.2);
    }

    // Visible downwash plumes sell the weight of the take-off and landing.
    const jetStrength = air > 0.012 && air < 0.995
      ? Math.sin(air * Math.PI)
      : 0;
    if (this.liftJets) {
      this.liftJetMaterial.opacity = jetStrength * 0.21;
      this.liftJetCoreMaterial.opacity = jetStrength * 0.38;
      for (const jet of this.liftJets) {
        const { wheel } = jet;
        const pulse = 1 + Math.sin(time * 16 + wheel.side * 2.1 + (wheel.front ? 0.5 : 0)) * 0.09;
        jet.group.visible = jetStrength > 0.004;
        jet.group.position.set(wheel.root.position.x, wheel.root.position.y - 0.25, wheel.baseZ);
        jet.group.rotation.z = -this.body.rotation.z;
        jet.group.rotation.x = -this.body.rotation.x;
        jet.group.scale.set(pulse, 0.82 + jetStrength * 0.35, pulse);
      }
    }

    // Exhaust glow follows throttle and boost.
    const exhaustHeat = clamp(0.16 + Math.abs(throttle) * 0.55 + boost * 0.8 + speedFactor * 0.2, 0, 1);
    if (this.exhaustGlowMaterials) {
      for (const material of this.exhaustGlowMaterials) {
        material.opacity = 0.12 + exhaustHeat * 0.82;
      }
    }
    if (this.exhaustGlowSprites) {
      for (const sprite of this.exhaustGlowSprites) {
        sprite.material.opacity = exhaustHeat * (0.12 + this.night * 0.52);
        sprite.scale.setScalar(0.62 + exhaustHeat * 0.5 + boost * 0.3);
      }
    }

    this.updateFlag(time, speedFactor);

    // Contact shadow stays on the ground; it softens with altitude.
    const height = Math.max(0, this.root.position.y);
    const shadowScale = 1 + height * 0.075;
    this.shadowGroup.position.set(this.root.position.x, 0.014, this.root.position.z);
    this.shadowGroup.rotation.y = this.root.rotation.y;
    this.shadowMesh.scale.set(shadowScale, shadowScale, 1);
    this.shadowMaterial.opacity = clamp(0.43 / (1 + height * 0.55), 0.08, 0.43);
    this.shadowMesh.rotation.z = -this.body.rotation.z * 0.2;

    this.underglowGroup.position.set(this.root.position.x, 0.022, this.root.position.z);
    this.underglowGroup.rotation.y = this.root.rotation.y;
    this.underglowTeal.scale.set(1 + height * 0.03, 1 + height * 0.03, 1);
    this.underglowMagenta.scale.set(1 + height * 0.05, 1 + height * 0.05, 1);

    const forward = this.getForward(this.tempA);
    this.beamGroup.position.set(
      this.root.position.x + forward.x * 8.5,
      0.026,
      this.root.position.z + forward.z * 8.5
    );
    this.beamGroup.rotation.y = this.root.rotation.y;
    this.beamMaterial.opacity = this.night * (0.36 + speedFactor * 0.1);
  }
}
