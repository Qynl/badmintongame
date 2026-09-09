import * as THREE from 'three';
import { PITCH } from '../sim/constants.js';

// ---------------------------------------------------------------------------
// Pitch, stadium and lighting.
//
// The grass is a procedurally generated canvas texture with mowing stripes,
// wear patterns and painted lines -- one texture, one draw call, no line
// geometry to update.
// ---------------------------------------------------------------------------

export function makeGrassTexture(renderer, quality = 'high') {
  const px = quality === 'low' ? 1024 : quality === 'medium' ? 2048 : 4096;
  const aspect = (PITCH.length + 12) / (PITCH.width + 12);
  const W = px;
  const H = Math.round(px / aspect);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  const totalW = PITCH.length + 12;
  const totalH = PITCH.width + 12;
  const mx = (v) => ((v + totalW / 2) / totalW) * W; // world x -> px
  const my = (v) => ((v + totalH / 2) / totalH) * H; // world z -> px
  const s = W / totalW; // px per metre

  // --- Base grass ---
  ctx.fillStyle = '#2f7a30';
  ctx.fillRect(0, 0, W, H);

  // --- Mowing stripes (alternating light/dark bands across the pitch) ---
  const stripes = 16;
  const stripeW = W / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(i * stripeW, 0, stripeW, H);
  }

  // --- Fine grass noise ---
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i] = Math.max(0, Math.min(255, d[i] + n * 0.6));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.5));
  }
  ctx.putImageData(img, 0, 0);

  // --- Wear patterns: goalmouths and centre circle get scuffed ---
  const wear = (cx, cz, r, a) => {
    const g = ctx.createRadialGradient(mx(cx), my(cz), 0, mx(cx), my(cz), r * s);
    g.addColorStop(0, `rgba(120,105,70,${a})`);
    g.addColorStop(1, 'rgba(120,105,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  wear(-PITCH.halfLength + 6, 0, 9, 0.22);
  wear(PITCH.halfLength - 6, 0, 9, 0.22);
  wear(0, 0, 11, 0.10);
  wear(-PITCH.halfLength + 16, 0, 8, 0.08);
  wear(PITCH.halfLength - 16, 0, 8, 0.08);

  // --- Painted lines ---
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = Math.max(2, 0.12 * s);
  ctx.lineCap = 'butt';

  const L = PITCH.halfLength;
  const Wd = PITCH.halfWidth;

  // Touchlines & goal lines
  ctx.strokeRect(mx(-L), my(-Wd), (2 * L) * s, (2 * Wd) * s);
  // Halfway line
  ctx.beginPath();
  ctx.moveTo(mx(0), my(-Wd));
  ctx.lineTo(mx(0), my(Wd));
  ctx.stroke();
  // Centre circle
  ctx.beginPath();
  ctx.arc(mx(0), my(0), PITCH.centreCircle * s, 0, Math.PI * 2);
  ctx.stroke();
  // Centre spot
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(mx(0), my(0), 0.18 * s, 0, Math.PI * 2);
  ctx.fill();

  for (const sign of [-1, 1]) {
    const gl = sign * L;
    // Penalty area
    const paX = gl - sign * PITCH.penaltyAreaLength;
    ctx.beginPath();
    ctx.moveTo(mx(gl), my(-PITCH.penaltyAreaHalfWidth));
    ctx.lineTo(mx(paX), my(-PITCH.penaltyAreaHalfWidth));
    ctx.lineTo(mx(paX), my(PITCH.penaltyAreaHalfWidth));
    ctx.lineTo(mx(gl), my(PITCH.penaltyAreaHalfWidth));
    ctx.stroke();
    // Six yard box
    const syX = gl - sign * PITCH.sixYardLength;
    ctx.beginPath();
    ctx.moveTo(mx(gl), my(-PITCH.sixYardHalfWidth));
    ctx.lineTo(mx(syX), my(-PITCH.sixYardHalfWidth));
    ctx.lineTo(mx(syX), my(PITCH.sixYardHalfWidth));
    ctx.lineTo(mx(gl), my(PITCH.sixYardHalfWidth));
    ctx.stroke();
    // Penalty spot
    const spotX = gl - sign * PITCH.penaltySpot;
    ctx.beginPath();
    ctx.arc(mx(spotX), my(0), 0.18 * s, 0, Math.PI * 2);
    ctx.fill();
    // D (arc outside the box)
    ctx.beginPath();
    const a0 = sign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    ctx.arc(mx(spotX), my(0), PITCH.centreCircle * s,
      sign > 0 ? Math.PI * 0.63 : -Math.PI * 0.37,
      sign > 0 ? Math.PI * 1.37 : Math.PI * 0.37);
    ctx.stroke();
    // Corner arcs
    for (const zs of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(mx(gl), my(zs * Wd), PITCH.cornerArc * s, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
  tex.needsUpdate = true;
  return tex;
}

// A subtle normal map for the grass so lighting has something to bite on.
function makeGrassNormal() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const nx = (Math.random() - 0.5) * 0.35;
    const ny = (Math.random() - 0.5) * 0.35;
    img.data[i * 4] = 128 + nx * 127;
    img.data[i * 4 + 1] = 128 + ny * 127;
    img.data[i * 4 + 2] = 245;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 40);
  return t;
}

export function buildPitch(scene, renderer, quality) {
  const group = new THREE.Group();
  const totalW = PITCH.length + 12;
  const totalH = PITCH.width + 12;

  const grassTex = makeGrassTexture(renderer, quality);
  const normalTex = makeGrassNormal();
  const mat = new THREE.MeshStandardMaterial({
    map: grassTex,
    normalMap: normalTex,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.92,
    metalness: 0.0,
  });
  const geo = new THREE.PlaneGeometry(totalW, totalH, 1, 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Surrounding apron / running track
  const apronGeo = new THREE.PlaneGeometry(totalW + 26, totalH + 26);
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x1d2a1c, roughness: 1 });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  group.add(apron);

  // Goals
  group.add(buildGoal(-1));
  group.add(buildGoal(1));

  // Corner flags
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(buildCornerFlag(sx * PITCH.halfLength, sz * PITCH.halfWidth));
    }
  }

  scene.add(group);
  return { group, grassTex };
}

function buildGoal(side) {
  const g = new THREE.Group();
  const postR = 0.06;
  const hw = PITCH.halfGoalWidth;
  const h = PITCH.goalHeight;
  const x = side * PITCH.halfLength;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.15 });

  const postGeo = new THREE.CylinderGeometry(postR, postR, h, 10);
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, mat);
    post.position.set(x, h / 2, sz * hw);
    post.castShadow = true;
    g.add(post);
  }
  const barGeo = new THREE.CylinderGeometry(postR, postR, hw * 2, 10);
  const bar = new THREE.Mesh(barGeo, mat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(x, h, 0);
  bar.castShadow = true;
  g.add(bar);

  // Net: three planes of a wireframe-ish grid material.
  const netMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const depth = PITCH.goalDepth;
  // Back
  const back = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, h), netMat);
  back.position.set(x + side * depth, h / 2, 0);
  back.rotation.y = Math.PI / 2;
  g.add(back);
  // Sides
  for (const sz of [-1, 1]) {
    const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(depth, h), netMat);
    sideNet.position.set(x + side * depth / 2, h / 2, sz * hw);
    g.add(sideNet);
  }
  // Top
  const top = new THREE.Mesh(new THREE.PlaneGeometry(depth, hw * 2), netMat);
  top.rotation.x = Math.PI / 2;
  top.position.set(x + side * depth / 2, h, 0);
  g.add(top);

  return g;
}

function buildCornerFlag(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6),
    new THREE.MeshStandardMaterial({ color: 0xdddddd })
  );
  pole.position.set(x, 0.75, z);
  g.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xffcc00, side: THREE.DoubleSide })
  );
  flag.position.set(x + Math.sign(x) * -0.2, 1.32, z);
  g.add(flag);
  return g;
}

// ---------------------------------------------------------------------------
// Stadium: tiered stands with an instanced crowd.
// ---------------------------------------------------------------------------
export function buildStadium(scene, quality, colors) {
  const group = new THREE.Group();
  const L = PITCH.halfLength + 10;
  const W = PITCH.halfWidth + 10;

  const concrete = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x151a20, roughness: 1 });

  // Four stands, each a sloped block.
  const stands = [
    { w: L * 2 + 30, d: 30, x: 0, z: -(W + 15), rot: 0 },
    { w: L * 2 + 30, d: 30, x: 0, z: (W + 15), rot: Math.PI },
    { w: W * 2 + 30, d: 30, x: -(L + 15), z: 0, rot: Math.PI / 2 },
    { w: W * 2 + 30, d: 30, x: (L + 15), z: 0, rot: -Math.PI / 2 },
  ];

  const crowdCount = quality === 'low' ? 900 : quality === 'medium' ? 2600 : 5200;
  const perStand = Math.floor(crowdCount / 4);
  const crowdGeo = new THREE.BoxGeometry(0.42, 0.75, 0.32);
  const crowdMat = new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true });
  const crowdMesh = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdCount);
  crowdMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const crowdColors = new Float32Array(crowdCount * 3);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let ci = 0;

  const homeCol = new THREE.Color(colors?.home ?? '#d92027');
  const awayCol = new THREE.Color(colors?.away ?? '#0b4ea2');

  for (const st of stands) {
    // Stand structure: a sloped ramp of rows.
    const rows = 14;
    const rowH = 0.85;
    const rowD = 1.5;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(rows * rowD, rows * rowH);
    shape.lineTo(rows * rowD, 0);
    shape.lineTo(0, 0);
    const extrude = new THREE.ExtrudeGeometry(shape, { depth: st.w, bevelEnabled: false });
    const standMesh = new THREE.Mesh(extrude, concrete);
    standMesh.rotation.y = st.rot;
    // Position so the low edge faces the pitch.
    const g2 = new THREE.Group();
    g2.add(standMesh);
    standMesh.position.set(0, 0, -st.w / 2);
    standMesh.rotation.set(0, 0, 0);
    g2.position.set(st.x, 0, st.z);
    g2.rotation.y = st.rot;
    // Orient: rows recede away from the pitch.
    standMesh.rotation.y = 0;
    standMesh.scale.x = st.z > 0 || st.x > 0 ? 1 : 1;
    group.add(g2);

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(rows * rowD + 4, 0.6, st.w),
      dark
    );
    roof.position.set(st.x + (st.rot % Math.PI === 0 ? 0 : 0), rows * rowH + 5.5, st.z);
    roof.rotation.y = st.rot;
    group.add(roof);

    // Crowd instances on this stand.
    const isHomeEnd = st.z < 0;
    for (let i = 0; i < perStand && ci < crowdCount; i++, ci++) {
      const row = Math.floor(Math.random() * rows);
      const alongT = Math.random() - 0.5;
      const local = new THREE.Vector3(
        row * rowD + 0.8,
        row * rowH + 0.75,
        alongT * st.w * 0.94
      );
      local.applyAxisAngle(new THREE.Vector3(0, 1, 0), st.rot);
      dummy.position.set(st.x + local.x, local.y, st.z + local.z);
      dummy.rotation.y = st.rot + Math.PI + (Math.random() - 0.5) * 0.3;
      dummy.scale.setScalar(0.85 + Math.random() * 0.3);
      dummy.updateMatrix();
      crowdMesh.setMatrixAt(ci, dummy.matrix);
      // Colour: mostly the home team's colours, with pockets of away fans.
      const base = (isHomeEnd || Math.random() > 0.18) ? homeCol : awayCol;
      col.copy(base).offsetHSL(
        (Math.random() - 0.5) * 0.06,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.35
      );
      crowdColors[ci * 3] = col.r;
      crowdColors[ci * 3 + 1] = col.g;
      crowdColors[ci * 3 + 2] = col.b;
    }
  }
  crowdGeo.setAttribute('color', new THREE.InstancedBufferAttribute(crowdColors, 3));
  crowdMesh.count = ci;
  crowdMesh.frustumCulled = false;
  group.add(crowdMesh);

  // Floodlight pylons
  if (quality !== 'low') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pylon = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.9, 34, 8),
          new THREE.MeshStandardMaterial({ color: 0x333a42, roughness: 0.8 })
        );
        pylon.position.set(sx * (L + 26), 17, sz * (W + 26));
        group.add(pylon);
        const bank = new THREE.Mesh(
          new THREE.BoxGeometry(7, 4, 1.2),
          new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: 0xfff4d0, emissiveIntensity: 1.6,
          })
        );
        bank.position.set(sx * (L + 24), 33, sz * (W + 24));
        bank.lookAt(0, 0, 0);
        group.add(bank);
      }
    }
  }

  scene.add(group);
  return { group, crowdMesh, crowdCount: ci };
}

export function buildLighting(scene, weather, quality) {
  const lights = {};
  const night = weather === 'night';

  const hemi = new THREE.HemisphereLight(
    night ? 0x334455 : 0x9fc6ff,
    night ? 0x101418 : 0x3a5a2a,
    night ? 0.55 : 1.05
  );
  scene.add(hemi);
  lights.hemi = hemi;

  const sun = new THREE.DirectionalLight(
    night ? 0xdfe8ff : 0xfff2d8,
    night ? 1.5 : 2.4
  );
  sun.position.set(-55, 78, 40);
  sun.castShadow = quality !== 'low';
  if (sun.castShadow) {
    const s = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(s, s);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
  }
  scene.add(sun);
  scene.add(sun.target);
  lights.sun = sun;

  const fill = new THREE.DirectionalLight(0xbdd6ff, night ? 0.5 : 0.65);
  fill.position.set(60, 45, -50);
  scene.add(fill);
  lights.fill = fill;

  return lights;
}

export function applyWeatherToScene(scene, weather, lights) {
  const cfg = {
    clear: { fog: 0xa8c8e8, density: 0.0016, sky: 0x87b6e8 },
    cloudy: { fog: 0x9aa6b2, density: 0.0035, sky: 0x8f9ba8 },
    rain: { fog: 0x6d7784, density: 0.0075, sky: 0x5d6773 },
    wet: { fog: 0x8d97a4, density: 0.0045, sky: 0x7d8794 },
    windy: { fog: 0x9fb4c8, density: 0.0022, sky: 0x88a8c8 },
    night: { fog: 0x0b1018, density: 0.0032, sky: 0x060a10 },
  }[weather] ?? { fog: 0xa8c8e8, density: 0.0016, sky: 0x87b6e8 };

  scene.fog = new THREE.FogExp2(cfg.fog, cfg.density);
  scene.background = new THREE.Color(cfg.sky);

  if (lights) {
    const dim = weather === 'rain' ? 0.55 : weather === 'cloudy' ? 0.7 :
                weather === 'wet' ? 0.8 : weather === 'night' ? 0.7 : 1;
    lights.sun.intensity = (weather === 'night' ? 1.5 : 2.4) * dim;
    lights.hemi.intensity = (weather === 'night' ? 0.55 : 1.05) * dim;
  }
  return cfg;
}
