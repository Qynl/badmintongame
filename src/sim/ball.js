import { BALL, GRAVITY, PITCH } from './constants.js';
import { clamp } from './math.js';

// ---------------------------------------------------------------------------
// Ball physics.
//
// The ball is a full 3D rigid body with drag, Magnus lift from spin, ground
// bounce with restitution + friction, and rolling resistance.  It is the single
// source of truth for "where the ball is" -- nothing may teleport it except
// restarts.  Player contacts apply impulses, they never set position.
// ---------------------------------------------------------------------------

export class Ball {
  constructor() {
    this.x = 0; this.y = BALL.radius; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    // Spin vector (rad/s) -- sy is sidespin about the vertical axis (curl),
    // sx/sz give topspin/backspin about horizontal axes.
    this.sx = 0; this.sy = 0; this.sz = 0;
    this.rollAngle = 0;
    // Which player last touched the ball, and which team. -1 = nobody.
    this.lastTouch = -1;
    this.lastTouchTeam = -1;
    this.prevTouch = -1;
    this.prevTouchTeam = -1;
    this.touchTimer = 999;
    // Owner is set only when a player is actively dribbling in close control.
    this.owner = -1;
    this.ownerTeam = -1;
    // Set when a pass/shot is in flight so AI can reason about the intent.
    this.intent = null; // { type, from, to, targetX, targetZ, team, atTime }
    this.airTime = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  get speed3() {
    return Math.hypot(this.vx, this.vy, this.vz);
  }

  isLoose() {
    return this.owner === -1;
  }

  setPosition(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.sx = 0; this.sy = 0; this.sz = 0;
    this.owner = -1;
    this.ownerTeam = -1;
    this.intent = null;
  }

  // Apply a kick impulse. dirX/dirZ need not be normalised.
  kick(dirX, dirZ, power, loft, spin = 0, topspin = 0) {
    const l = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / l;
    const nz = dirZ / l;
    const p = clamp(power, 0, BALL.maxSpeed);
    const horiz = p * Math.cos(loft);
    this.vx = nx * horiz;
    this.vz = nz * horiz;
    this.vy = p * Math.sin(loft);
    this.sy = spin;
    // Topspin/backspin acts about the axis perpendicular to travel.
    this.sx = -nz * topspin;
    this.sz = nx * topspin;
    this.owner = -1;
    this.ownerTeam = -1;
    this.airTime = 0;
  }

  step(dt) {
    this.touchTimer += dt;
    if (this.owner !== -1) {
      // Owned balls are integrated by the dribble controller, not here.
      return;
    }

    const r = BALL.radius;
    const onGround = this.y <= r + 1e-4 && Math.abs(this.vy) < 0.35;

    // --- Aerodynamic drag (quadratic) ---
    const v = Math.hypot(this.vx, this.vy, this.vz);
    if (v > 0.01) {
      const d = BALL.dragK * v;
      this.vx -= this.vx * d * dt;
      this.vy -= this.vy * d * dt;
      this.vz -= this.vz * d * dt;
    }

    if (!onGround) {
      this.airTime += dt;
      // --- Gravity ---
      this.vy -= GRAVITY * dt;
      // --- Magnus force: F = k * (omega x v) ---
      const mx = this.sy * this.vz - this.sz * this.vy;
      const my = this.sz * this.vx - this.sx * this.vz;
      const mz = this.sx * this.vy - this.sy * this.vx;
      const k = BALL.magnusK;
      this.vx += mx * k * dt;
      this.vy += my * k * dt;
      this.vz += mz * k * dt;
    } else {
      this.airTime = 0;
      this.y = r;
      this.vy = 0;
      // --- Rolling resistance + grass friction ---
      const s = Math.hypot(this.vx, this.vz);
      if (s > 0.02) {
        const dec = BALL.groundFriction * (1 + s * 0.045) * dt;
        const f = Math.max(0, s - dec) / s;
        this.vx *= f;
        this.vz *= f;
      } else {
        this.vx = 0;
        this.vz = 0;
      }
      // A rolling ball still curls slightly from sidespin.
      if (Math.abs(this.sy) > 0.5 && s > 1) {
        const px = -this.vz / s;
        const pz = this.vx / s;
        const curl = this.sy * 0.0009 * s * dt;
        this.vx += px * curl;
        this.vz += pz * curl;
      }
    }

    // --- Spin decay ---
    const decay = Math.pow(BALL.spinDecay, dt);
    this.sx *= decay;
    this.sy *= decay;
    this.sz *= decay;

    // --- Integrate ---
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    // --- Ground collision ---
    if (this.y < r) {
      this.y = r;
      if (this.vy < 0) {
        // Vertical bounce loses energy; more for a fast, spinning ball.
        this.vy = -this.vy * BALL.restitution;
        if (this.vy < 0.55) this.vy = 0;
        // Horizontal component scrubs off on impact, spin converts to motion.
        const grip = 0.78;
        this.vx *= grip;
        this.vz *= grip;
        const s = Math.hypot(this.vx, this.vz);
        if (s > 0.5) {
          const nx = this.vx / s;
          const nz = this.vz / s;
          const topspinAmount = this.sz * nx - this.sx * nz;
          const push = clamp(topspinAmount * 0.012, -3, 3);
          this.vx += nx * push;
          this.vz += nz * push;
        }
        this.sx *= 0.6;
        this.sy *= 0.85;
        this.sz *= 0.6;
      }
    }

    // Speed clamp for stability.
    const sp = Math.hypot(this.vx, this.vy, this.vz);
    if (sp > BALL.maxSpeed * 1.2) {
      const f = (BALL.maxSpeed * 1.2) / sp;
      this.vx *= f; this.vy *= f; this.vz *= f;
    }

    // Rolling visual angle.
    this.rollAngle += (Math.hypot(this.vx, this.vz) / BALL.radius) * dt;

    this.collideGoalFrame();
  }

  // Posts and crossbar are solid.
  collideGoalFrame() {
    const gx = PITCH.halfLength;
    const hw = PITCH.halfGoalWidth;
    const postR = 0.06 + BALL.radius;
    for (const sx of [-1, 1]) {
      const px = sx * gx;
      if (Math.abs(this.x - px) > 1.6) continue;
      // Posts
      for (const sz of [-1, 1]) {
        const pz = sz * hw;
        const dx = this.x - px;
        const dz = this.z - pz;
        const d = Math.hypot(dx, dz);
        if (d < postR && this.y < PITCH.goalHeight) {
          const nx = dx / (d || 1);
          const nz = dz / (d || 1);
          this.x = px + nx * postR;
          this.z = pz + nz * postR;
          const vn = this.vx * nx + this.vz * nz;
          if (vn < 0) {
            this.vx -= 2 * vn * nx * 0.7;
            this.vz -= 2 * vn * nz * 0.7;
          }
        }
      }
      // Crossbar
      if (Math.abs(this.z) < hw && Math.abs(this.x - px) < postR &&
          Math.abs(this.y - PITCH.goalHeight) < BALL.radius + 0.06) {
        this.y = PITCH.goalHeight - BALL.radius - 0.06;
        if (this.vy > 0) this.vy = -this.vy * 0.6;
        this.vx *= 0.7;
      }
    }
  }

  registerTouch(playerId, team) {
    if (playerId !== this.lastTouch) {
      this.prevTouch = this.lastTouch;
      this.prevTouchTeam = this.lastTouchTeam;
    }
    this.lastTouch = playerId;
    this.lastTouchTeam = team;
    this.touchTimer = 0;
  }

  // Predict where the ball will be in t seconds (cheap: drag-free ballistic +
  // friction approximation). Used constantly by AI interception logic.
  predict(t, out) {
    if (this.owner !== -1) {
      out.x = this.x; out.y = this.y; out.z = this.z;
      return out;
    }
    const dragScale = Math.exp(-BALL.dragK * this.speed3 * t * 0.5);
    let px = this.x + this.vx * t * dragScale;
    let pz = this.z + this.vz * t * dragScale;
    let py = this.y + this.vy * t - 0.5 * GRAVITY * t * t;
    if (this.y <= BALL.radius + 0.02 && Math.abs(this.vy) < 0.35) {
      // Rolling: apply friction deceleration.
      const s = this.speed;
      const dec = BALL.groundFriction * (1 + s * 0.045);
      const stopT = s / (dec || 1e-6);
      const tt = Math.min(t, stopT);
      const travel = s * tt - 0.5 * dec * tt * tt;
      const nx = s > 0.01 ? this.vx / s : 0;
      const nz = s > 0.01 ? this.vz / s : 0;
      px = this.x + nx * travel;
      pz = this.z + nz * travel;
      py = BALL.radius;
    } else if (py < BALL.radius) {
      py = BALL.radius;
    }
    out.x = px; out.y = py; out.z = pz;
    return out;
  }
}
