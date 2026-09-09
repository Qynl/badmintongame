import * as THREE from 'three';
import { PITCH } from '../sim/constants.js';
import { clamp } from '../sim/math.js';
import { buildPitch, buildStadium, buildLighting, applyWeatherToScene } from './pitch.js';
import { PlayerRig, makeBallMesh } from './playerMesh.js';
import { CameraRig } from './camera.js';

// ---------------------------------------------------------------------------
// MatchRenderer
//
// A pure consumer of simulation state. It owns no game logic; every frame it
// reads the Match and pushes the result to the GPU. This separation is what
// lets the sim run headless in tests at 200x realtime.
// ---------------------------------------------------------------------------

const QUALITY_SETTINGS = {
  low:    { pixelRatio: 1,   shadows: false, crowdAnim: false, particles: false },
  medium: { pixelRatio: 1.25, shadows: true, crowdAnim: true,  particles: true },
  high:   { pixelRatio: 2,   shadows: true, crowdAnim: true,  particles: true },
};

export class MatchRenderer {
  constructor(canvas, match, options = {}) {
    this.canvas = canvas;
    this.match = match;
    this.quality = options.quality ?? 'high';
    this.settings = QUALITY_SETTINGS[this.quality];

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance',
      stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.pixelRatio));
    renderer.shadowMap.enabled = this.settings.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.35, 700);
    this.camera = camera;
    this.cameraRig = new CameraRig(camera);

    this.lights = buildLighting(scene, match.weather, this.quality);
    applyWeatherToScene(scene, match.weather, this.lights);
    const p = buildPitch(scene, renderer, this.quality);
    this.pitchGroup = p.group;
    const kits = { home: match.teams[0].colors.primary, away: match.teams[1].colors.primary };
    const st = buildStadium(scene, this.quality, kits);
    this.crowdMesh = st.crowdMesh;
    this.crowdCount = st.crowdCount;
    this.crowdBase = [];
    if (this.crowdMesh) {
      const m = new THREE.Matrix4();
      for (let i = 0; i < this.crowdCount; i++) {
        this.crowdMesh.getMatrixAt(i, m);
        this.crowdBase.push(m.clone());
      }
    }

    // Player rigs
    this.rigs = new Map();
    for (const team of match.teams) {
      for (const pl of [...team.players, ...team.bench]) {
        const rig = new PlayerRig(pl, team.colors, this.quality);
        rig.root.visible = false;
        scene.add(rig.root);
        this.rigs.set(pl.id, rig);
      }
    }

    // Ball
    this.ballMesh = makeBallMesh();
    scene.add(this.ballMesh);
    this.ballSpin = new THREE.Quaternion();

    // Ball shadow (a cheap dark disc that scales with height)
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false,
    });
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), shadowMat);
    this.ballShadow.rotation.x = -Math.PI / 2;
    scene.add(this.ballShadow);

    // Weather particles
    this.rain = null;
    if (this.settings.particles && (match.weather === 'rain')) this.buildRain();

    // Grass divots kicked up by slides
    this.divots = [];

    this.humanId = options.humanId ?? null;
    this.showNames = options.showNames ?? true;
    this.showDebug = false;
    this.debugGroup = new THREE.Group();
    this.debugGroup.visible = false;
    scene.add(this.debugGroup);

    this.frameTimes = [];
    this.fps = 60;
    this._tmpV = new THREE.Vector3();
    this.resize();
  }

  buildRain() {
    const N = this.quality === 'high' ? 9000 : 4000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 200;
      pos[i * 3 + 1] = Math.random() * 45;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 150;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xbcd4e8, size: 0.11, transparent: true, opacity: 0.5,
      depthWrite: false, sizeAttenuation: true,
    });
    this.rain = new THREE.Points(geo, mat);
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.settings = QUALITY_SETTINGS[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.pixelRatio));
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.lights.sun.castShadow = this.settings.shadows;
    this.renderer.shadowMap.needsUpdate = true;
  }

  setCameraMode(m) { this.cameraRig.setMode(m); }
  setHuman(id) { this.humanId = id; }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  onGoal() { this.cameraRig.shake(0.85); }
  onBigHit() { this.cameraRig.shake(0.25); }

  render(dt) {
    const match = this.match;
    const ball = match.ball;
    const human = this.humanId != null ? match.playersById.get(this.humanId) : null;

    // --- Players ---
    const onPitch = new Set();
    for (const team of match.teams) {
      for (const pl of team.players) if (pl.onPitch) onPitch.add(pl.id);
    }
    for (const [id, rig] of this.rigs) {
      const visible = onPitch.has(id);
      if (rig.root.visible !== visible) rig.root.visible = visible;
      if (!visible) continue;
      rig.update(dt, ball);

      // Status rings.
      const pl = rig.player;
      if (pl === human) {
        rig.setRing(0x39d353, 0.95);
      } else if (match.carrier === pl) {
        rig.setRing(0xffd34d, 0.55);
      } else if (human && pl.team === human.team && pl.brain?.plan?.type === 'run-behind') {
        rig.setRing(0x59a8ff, 0.30);
      } else {
        rig.setRing(0xffffff, 0);
      }
    }

    // --- Ball ---
    this.ballMesh.position.set(ball.x, Math.max(ball.y, 0.11), ball.z);
    // Roll/spin: rotate about the axis perpendicular to travel.
    const sp = Math.hypot(ball.vx, ball.vz);
    if (sp > 0.05) {
      const axis = this._tmpV.set(-ball.vz, 0, ball.vx).normalize();
      const ang = (sp / 0.11) * dt;
      this.ballSpin.setFromAxisAngle(axis, ang);
      this.ballMesh.quaternion.premultiply(this.ballSpin);
    }
    if (ball.spin) this.ballMesh.rotateY(ball.spin * dt * 0.6);

    // Ball shadow shrinks and fades with height.
    const h = Math.max(0, ball.y - 0.11);
    this.ballShadow.position.set(ball.x, 0.012, ball.z);
    const sc = clamp(1 - h * 0.055, 0.35, 1);
    this.ballShadow.scale.setScalar(sc);
    this.ballShadow.material.opacity = 0.34 * clamp(1 - h * 0.07, 0.15, 1);

    // --- Camera ---
    this.cameraRig.update(dt, match, human);

    // Shadow camera follows the action so the shadow map stays high-res.
    if (this.settings.shadows) {
      const sun = this.lights.sun;
      sun.position.set(ball.x - 55, 78, ball.z + 40);
      sun.target.position.set(ball.x, 0, ball.z);
      sun.target.updateMatrixWorld();
    }

    // --- Crowd animation ---
    if (this.settings.crowdAnim && this.crowdMesh) this.animateCrowd(dt);

    // --- Rain ---
    if (this.rain) {
      const pos = this.rain.geometry.attributes.position;
      const arr = pos.array;
      const cam = this.camera.position;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= 24 * dt;
        arr[i] += 3.5 * dt;
        if (arr[i + 1] < 0) {
          arr[i + 1] = 42 + Math.random() * 4;
          arr[i] = cam.x + (Math.random() - 0.5) * 130;
          arr[i + 2] = cam.z + (Math.random() - 0.5) * 130;
        }
      }
      pos.needsUpdate = true;
    }

    // --- Debug overlay ---
    if (this.showDebug) this.updateDebug();

    this.renderer.render(this.scene, this.camera);

    // FPS tracking
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 45) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fps = 1 / Math.max(avg, 1e-4);
  }

  animateCrowd(dt) {
    this._crowdT = (this._crowdT ?? 0) + dt;
    const intensity = this.match.commentary?.crowdIntensity ?? 0.3;
    // Only animate a slice of the crowd each frame -- a Mexican wave of work.
    const slice = Math.min(this.crowdCount, 600);
    const start = (this._crowdI ?? 0) % Math.max(1, this.crowdCount);
    const m = new THREE.Matrix4();
    const dummy = new THREE.Object3D();
    for (let k = 0; k < slice; k++) {
      const i = (start + k) % this.crowdCount;
      const base = this.crowdBase[i];
      base.decompose(dummy.position, dummy.quaternion, dummy.scale);
      const seed = i * 0.618;
      const bounce = Math.sin(this._crowdT * (3 + (i % 7) * 0.4) + seed * 12);
      dummy.position.y += Math.max(0, bounce) * (0.05 + intensity * 0.42);
      dummy.updateMatrix();
      this.crowdMesh.setMatrixAt(i, dummy.matrix);
    }
    this._crowdI = start + slice;
    this.crowdMesh.instanceMatrix.needsUpdate = true;
  }

  setDebug(on) {
    this.showDebug = on;
    this.debugGroup.visible = on;
    if (on && this.debugGroup.children.length === 0) {
      // Offside line markers.
      const mat = new THREE.LineBasicMaterial({ color: 0xff3355 });
      for (let i = 0; i < 2; i++) {
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0.05, -PITCH.halfWidth),
          new THREE.Vector3(0, 0.05, PITCH.halfWidth),
        ]);
        this.debugGroup.add(new THREE.Line(g, mat));
      }
    }
  }

  updateDebug() {
    const m = this.match;
    if (!m.debugOffsideLines) return;
    for (let i = 0; i < 2 && i < this.debugGroup.children.length; i++) {
      this.debugGroup.children[i].position.x = m.debugOffsideLines[i] ?? 0;
    }
  }

  dispose() {
    for (const rig of this.rigs.values()) rig.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const mm of ms) { if (mm.map) mm.map.dispose(); mm.dispose(); }
      }
    });
  }

  // Project a world position to normalised screen coords for HTML overlays.
  project(x, y, z, out) {
    this._tmpV.set(x, y, z).project(this.camera);
    out.x = (this._tmpV.x * 0.5 + 0.5) * 100;
    out.y = (-this._tmpV.y * 0.5 + 0.5) * 100;
    out.visible = this._tmpV.z < 1;
    return out;
  }
}
