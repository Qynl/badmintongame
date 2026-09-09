import * as THREE from 'three';

// ---------------------------------------------------------------------------
// PLAYER RENDERING
//
// Each footballer is a small articulated rig (torso, head, two arms, two legs)
// driven procedurally from the simulation's animation state. There is no
// skeletal animation data -- the gait is generated from speed and stride phase,
// which means it always matches the physics exactly. 22+ rigs at 60fps is
// cheap because every part is a shared geometry with a per-player material.
// ---------------------------------------------------------------------------

const GEO = {};
function geo(key, make) {
  if (!GEO[key]) GEO[key] = make();
  return GEO[key];
}

function bodyGeos() {
  return {
    torso: geo('torso', () => {
      const g = new THREE.CapsuleGeometry(0.19, 0.34, 4, 10);
      return g;
    }),
    hips: geo('hips', () => new THREE.CapsuleGeometry(0.17, 0.1, 3, 8)),
    head: geo('head', () => new THREE.SphereGeometry(0.115, 14, 12)),
    upperArm: geo('uarm', () => new THREE.CapsuleGeometry(0.052, 0.22, 3, 7)),
    lowerArm: geo('larm', () => new THREE.CapsuleGeometry(0.045, 0.21, 3, 7)),
    thigh: geo('thigh', () => new THREE.CapsuleGeometry(0.078, 0.30, 3, 8)),
    shin: geo('shin', () => new THREE.CapsuleGeometry(0.062, 0.30, 3, 8)),
    foot: geo('foot', () => new THREE.BoxGeometry(0.11, 0.06, 0.24)),
  };
}

// Build a skin-tone palette so players aren't all identical.
const SKIN_TONES = [0xf1c8a0, 0xe0ac7e, 0xc68863, 0x9c6644, 0x7a4c33, 0x5a3421];

export class PlayerRig {
  constructor(player, kit, quality) {
    this.player = player;
    this.quality = quality;
    const g = bodyGeos();

    const shirtCol = new THREE.Color(player.isGK ? kit.gk : kit.primary);
    const shortsCol = new THREE.Color(player.isGK ? kit.gk : kit.shorts);
    const skin = SKIN_TONES[player.id % SKIN_TONES.length];

    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtCol, roughness: 0.72 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: shortsCol, roughness: 0.78 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.65 });
    const sockMat = new THREE.MeshStandardMaterial({ color: shirtCol, roughness: 0.8 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.45 });
    this.materials = [shirtMat, shortsMat, skinMat, sockMat, bootMat];

    const root = new THREE.Group();
    this.root = root;

    // --- Torso ---
    const torso = new THREE.Mesh(g.torso, shirtMat);
    torso.position.y = 1.16;
    torso.castShadow = quality !== 'low';
    root.add(torso);
    this.torso = torso;

    const hips = new THREE.Mesh(g.hips, shortsMat);
    hips.position.y = 0.90;
    hips.castShadow = quality !== 'low';
    root.add(hips);
    this.hips = hips;

    // --- Head + neck ---
    const head = new THREE.Mesh(g.head, skinMat);
    head.position.y = 1.50;
    head.castShadow = quality !== 'low';
    root.add(head);
    this.head = head;

    // --- Arms (pivot at shoulder) ---
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0, 1.32, side * 0.215);
      const upper = new THREE.Mesh(g.upperArm, shirtMat);
      upper.position.y = -0.155;
      upper.castShadow = quality === 'high';
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.30;
      const lower = new THREE.Mesh(g.lowerArm, skinMat);
      lower.position.y = -0.14;
      lower.castShadow = quality === 'high';
      elbow.add(lower);
      shoulder.add(elbow);
      root.add(shoulder);
      this.arms.push({ shoulder, elbow, side });
    }

    // --- Legs (pivot at hip) ---
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0, 0.88, side * 0.105);
      const thigh = new THREE.Mesh(g.thigh, shortsMat);
      thigh.position.y = -0.20;
      thigh.castShadow = quality !== 'low';
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.40;
      const shin = new THREE.Mesh(g.shin, sockMat);
      shin.position.y = -0.20;
      shin.castShadow = quality === 'high';
      knee.add(shin);
      const foot = new THREE.Mesh(g.foot, bootMat);
      foot.position.set(0, -0.40, 0.05);
      knee.add(foot);
      hip.add(knee);
      root.add(hip);
      this.legs.push({ hip, knee, foot, side });
    }

    // --- Shirt number (billboard sprite on the back) ---
    if (quality !== 'low') {
      const numTex = makeNumberTexture(player.shirt, shirtCol);
      const numMat = new THREE.MeshBasicMaterial({
        map: numTex, transparent: true, depthWrite: false,
      });
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), numMat);
      num.position.set(-0.20, 1.22, 0);
      num.rotation.y = -Math.PI / 2;
      root.add(num);
      this.numberMesh = num;
      this.numberTex = numTex;
    }

    // --- Selection / status ring on the ground ---
    const ringGeo = geo('ring', () => new THREE.RingGeometry(0.42, 0.55, 24));
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    root.add(ring);
    this.ring = ring;
    this.ringMat = ringMat;

    // Animation smoothing state
    this.legPhase = 0;
    this.leanX = 0;
    this.kickBlend = 0;
    this.diveBlend = 0;
    this.slideBlend = 0;
    this.headTurn = 0;
  }

  setKit(kit) {
    const p = this.player;
    const shirtCol = new THREE.Color(p.isGK ? kit.gk : kit.primary);
    this.materials[0].color.copy(shirtCol);
    this.materials[1].color.set(p.isGK ? kit.gk : kit.shorts);
    this.materials[3].color.copy(shirtCol);
  }

  update(dt, lookAt) {
    const p = this.player;
    const a = p.anim;
    const root = this.root;

    root.position.set(p.x, 0, p.z);
    root.rotation.y = -p.facing + Math.PI / 2;

    const speed = p.speed;
    const speedN = Math.min(1, speed / (p.maxSpeed + 0.01));

    // --- Blend targets for special states ---
    const wantSlide = p.slideTimer > 0 ? 1 : 0;
    const wantDive = (p.isGK && p.diving) ? 1 : 0;
    const wantKick = a.kickT > 0 ? Math.min(1, a.kickT) : 0;
    const wantDown = p.recovering > 0 ? 1 : 0;
    const k = Math.min(1, dt * 12);
    this.slideBlend += (Math.max(wantSlide, wantDown) - this.slideBlend) * k;
    this.diveBlend += (wantDive - this.diveBlend) * Math.min(1, dt * 16);
    this.kickBlend += (wantKick - this.kickBlend) * Math.min(1, dt * 18);

    // --- Gait ---
    // Stride length grows with speed; cadence too, but sub-linearly, exactly
    // like real running. Phase comes from the sim so feet match ground speed.
    const phase = a.phase * Math.PI * 2;
    const stride = 0.25 + speedN * 0.95;
    const swing = Math.sin(phase);
    const swing2 = Math.sin(phase + Math.PI);
    const lift = Math.max(0, Math.sin(phase * 2)) * speedN;

    const legs = this.legs;
    for (let i = 0; i < 2; i++) {
      const leg = legs[i];
      const s = i === 0 ? swing : swing2;
      const opp = i === 0 ? swing2 : swing;
      // Hip swing
      let hipAngle = s * stride * 0.62;
      // Knee bends on the recovery half of the cycle.
      let kneeAngle = Math.max(0, -s) * stride * 1.15 + speedN * 0.15;
      // Standing pose when still: slight bend.
      if (speed < 0.3) {
        hipAngle *= 0.06;
        kneeAngle = 0.10;
      }
      leg.hip.rotation.z = hipAngle;
      leg.knee.rotation.z = -kneeAngle;
      leg.foot.rotation.z = kneeAngle * 0.4 - hipAngle * 0.2;
    }

    // --- Arms: counter-swing to the legs ---
    const armSwing = (0.20 + speedN * 0.85);
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      const s = i === 0 ? swing2 : swing;
      arm.shoulder.rotation.z = s * armSwing * 0.75;
      arm.shoulder.rotation.x = arm.side * (0.14 + speedN * 0.20);
      arm.elbow.rotation.z = -(0.35 + speedN * 0.75 + Math.max(0, s) * 0.35);
    }

    // --- Torso lean: forward with speed, sideways when turning ---
    const forwardLean = speedN * 0.30;
    const sideLean = p.bodyLean * 0.5;
    this.torso.rotation.z = forwardLean;
    this.torso.rotation.x = sideLean;
    this.hips.rotation.z = forwardLean * 0.3;
    // Bob with the stride.
    const bob = Math.abs(Math.sin(phase)) * speedN * 0.045;
    this.torso.position.y = 1.16 - bob;
    this.hips.position.y = 0.90 - bob;
    this.head.position.y = 1.50 - bob * 1.2;

    // --- Head looks at the ball / target ---
    if (lookAt) {
      const dx = lookAt.x - p.x;
      const dz = lookAt.z - p.z;
      const want = Math.atan2(dz, dx);
      let rel = want - p.facing;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      rel = Math.max(-1.15, Math.min(1.15, rel));
      this.headTurn += (rel - this.headTurn) * Math.min(1, dt * 8);
      this.head.rotation.y = this.headTurn;
    }

    // --- Kick pose: plant one foot, swing the other through ---
    if (this.kickBlend > 0.01) {
      const b = this.kickBlend;
      const kickLeg = this.legs[p.footedness === 'L' ? 0 : 1];
      const plantLeg = this.legs[p.footedness === 'L' ? 1 : 0];
      // Swing through: from cocked back to follow-through.
      const t = 1 - b; // 0 at strike, 1 at end of anim
      const swingAngle = -1.25 + t * 2.2;
      kickLeg.hip.rotation.z += (swingAngle - kickLeg.hip.rotation.z) * b;
      kickLeg.knee.rotation.z += ((-0.9 + t * 0.85) - kickLeg.knee.rotation.z) * b;
      plantLeg.hip.rotation.z += (0.18 - plantLeg.hip.rotation.z) * b;
      plantLeg.knee.rotation.z += (-0.28 - plantLeg.knee.rotation.z) * b;
      // Opposite arm flies out for balance.
      const balanceArm = this.arms[p.footedness === 'L' ? 1 : 0];
      balanceArm.shoulder.rotation.x += (balanceArm.side * 1.15 - balanceArm.shoulder.rotation.x) * b;
      this.torso.rotation.x += (0.28 * (p.footedness === 'L' ? 1 : -1)) * b;
    }

    // --- Slide tackle / on the floor ---
    if (this.slideBlend > 0.01) {
      const b = this.slideBlend;
      root.rotation.x = -1.32 * b;
      root.position.y = -0.42 * b;
      for (const leg of this.legs) {
        leg.hip.rotation.z += (-0.45 - leg.hip.rotation.z) * b;
        leg.knee.rotation.z += (-0.25 - leg.knee.rotation.z) * b;
      }
      this.legs[0].hip.rotation.z += (0.85 - this.legs[0].hip.rotation.z) * b * 0.8;
    } else {
      root.rotation.x = 0;
      root.position.y = 0;
    }

    // --- Keeper dive ---
    if (this.diveBlend > 0.01) {
      const b = this.diveBlend;
      const side = p.diving || 1;
      root.rotation.z = side * -1.15 * b;
      root.position.y = 0.30 * b;
      const heightT = Math.min(1, Math.max(0, (p.diveHeight ?? 1) / 2.44));
      for (const arm of this.arms) {
        arm.shoulder.rotation.z += (-2.4 * heightT - 0.4 - arm.shoulder.rotation.z) * b;
        arm.shoulder.rotation.x += (arm.side * 0.5 - arm.shoulder.rotation.x) * b;
        arm.elbow.rotation.z += (-0.15 - arm.elbow.rotation.z) * b;
      }
    } else if (p.isGK) {
      root.rotation.z = 0;
      // Ready stance: crouched, arms out.
      if (speed < 1.5) {
        for (const arm of this.arms) {
          arm.shoulder.rotation.z += (-0.55 - arm.shoulder.rotation.z) * 0.5;
          arm.shoulder.rotation.x += (arm.side * 0.65 - arm.shoulder.rotation.x) * 0.5;
          arm.elbow.rotation.z += (-0.9 - arm.elbow.rotation.z) * 0.5;
        }
        for (const leg of this.legs) leg.knee.rotation.z -= 0.22;
        this.torso.rotation.z += 0.15;
      }
    } else {
      root.rotation.z = 0;
    }

    // --- Celebration ---
    if (p.celebrating > 0) {
      const t = p.celebrating;
      for (const arm of this.arms) {
        arm.shoulder.rotation.z = -2.6 + Math.sin(t * 9) * 0.25;
        arm.shoulder.rotation.x = arm.side * 0.4;
        arm.elbow.rotation.z = -0.2;
      }
      root.position.y += Math.abs(Math.sin(t * 6)) * 0.12;
    }
  }

  setRing(color, opacity) {
    this.ringMat.color.set(color);
    this.ringMat.opacity = opacity;
  }

  dispose() {
    for (const m of this.materials) m.dispose();
    if (this.numberTex) this.numberTex.dispose();
    this.ringMat.dispose();
  }
}

function makeNumberTexture(num, shirtColor) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  // Choose a contrasting number colour.
  const lum = shirtColor.r * 0.299 + shirtColor.g * 0.587 + shirtColor.b * 0.114;
  ctx.fillStyle = lum > 0.55 ? '#101010' : '#ffffff';
  ctx.font = 'bold 46px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
export function makeBallMesh() {
  const geo = new THREE.SphereGeometry(0.11, 20, 16);
  const tex = makeBallTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.42, metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

function makeBallTexture() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = N; c.height = N / 2;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, N, N / 2);
  // Classic pentagon-ish pattern approximated with dark patches.
  ctx.fillStyle = '#1a1a1a';
  const spots = [
    [0.12, 0.28], [0.37, 0.22], [0.62, 0.30], [0.87, 0.24],
    [0.25, 0.62], [0.50, 0.70], [0.75, 0.62], [0.98, 0.68],
    [0.0, 0.68],
  ];
  for (const [u, v] of spots) {
    ctx.beginPath();
    const cx = u * N;
    const cy = v * (N / 2);
    const r = 15;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Panel seams
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo((i / 6) * N, 0);
    ctx.lineTo((i / 6) * N, N / 2);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
