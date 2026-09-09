import { PITCH, POS, UNIT } from './constants.js';
import { clamp, angleDiff, approachAngle, lerp } from './math.js';
import { overall } from './attributes.js';

// ---------------------------------------------------------------------------
// A footballer.
//
// Locomotion is momentum based: players accelerate, decelerate, and can only
// turn at a rate limited by their agility and current speed.  Nobody snaps to a
// target -- they run there, overshoot if they were sprinting, and have to
// recover.  This is what makes positioning mistakes real.
// ---------------------------------------------------------------------------

let NEXT_ID = 0;

export class Player {
  constructor(cfg) {
    this.id = NEXT_ID++;
    this.team = cfg.team;
    this.name = cfg.name;
    this.shirt = cfg.shirt;
    this.position = cfg.position;
    this.unit = UNIT[cfg.position];
    this.role = cfg.role || 'balanced';
    this.attrs = cfg.attrs;
    this.ovr = overall(cfg.attrs, cfg.position);
    this.isHuman = false;
    this.isGK = cfg.position === POS.GK;
    this.footedness = cfg.footedness || 'R';
    this.age = cfg.age ?? 24;

    // Kinematics
    this.x = 0; this.z = 0;
    this.vx = 0; this.vz = 0;
    this.facing = cfg.team === 0 ? 0 : Math.PI;
    this.bodyLean = 0;

    // Slot / tactical home position (normalised) -- can be changed by subs and
    // in-match role changes.
    this.slotX = cfg.slotX ?? 0.5;
    this.slotZ = cfg.slotZ ?? 0.5;
    this.homeX = 0; this.homeZ = 0;   // world-space tactical anchor
    this.targetX = 0; this.targetZ = 0; // where the AI currently wants to be
    this.moveIntensity = 0.6;          // 0..1 fraction of max speed requested

    // State
    this.stamina = 100;
    this.freshness = 1;
    this.onPitch = true;
    this.sentOff = false;
    this.yellow = 0;
    this.injury = 0;      // 0..1 severity
    this.knock = 0;       // temporary reduced capability
    this.condition = 1;   // combined multiplier

    // Ball interaction
    this.hasBall = false;
    this.touchCooldown = 0;
    this.controlTimer = 0;   // how long they've been in possession
    this.kickWindup = 0;
    this.pendingAction = null;
    this.lastActionTime = -99;
    this.tackleTimer = 0;
    this.tackleCooldown = 0;
    this.slideTimer = 0;
    this.recovering = 0;
    this.celebrating = 0;

    // AI memory (avoids twitchy re-decisions every frame)
    this.brain = {
      decisionTimer: 0,
      decisionInterval: 0.12,
      intent: 'hold',
      intentTimer: 0,
      markTarget: -1,
      runType: null,
      runTimer: 0,
      lastPassTarget: -1,
      pressCommit: 0,
      supportSide: 0,
      wantsBall: 0,
      offBallTargetX: 0,
      offBallTargetZ: 0,
      lastThink: -1,
    };

    // Per-match stats
    this.stats = {
      passes: 0, passesCompleted: 0, keyPasses: 0,
      shots: 0, shotsOnTarget: 0, goals: 0, assists: 0,
      tackles: 0, tacklesWon: 0, interceptions: 0, clearances: 0,
      duels: 0, duelsWon: 0, fouls: 0, fouled: 0,
      touches: 0, distance: 0, sprintDistance: 0,
      dribbles: 0, dribblesCompleted: 0,
      possessionLost: 0, saves: 0, offsides: 0,
      rating: 6.0, ratingEvents: [],
    };

    // Animation-facing state (renderer reads, sim writes)
    this.anim = {
      phase: 0,
      state: 'idle', // idle|walk|jog|run|sprint|kick|tackle|slide|celebrate|down
      kickT: 0,
      armSwing: 0,
    };
  }

  get speed() { return Math.hypot(this.vx, this.vz); }

  // --- Derived physical capabilities -------------------------------------
  get maxSpeed() {
    // 99 pace ~ 9.4 m/s, 40 pace ~ 6.6 m/s
    const base = 5.4 + (this.attrs.pace / 99) * 4.2;
    return base * this.condition;
  }

  get accelRate() {
    return (3.0 + (this.attrs.acceleration / 99) * 5.5) * this.condition;
  }

  get decelRate() {
    return 7.5 + (this.attrs.agility / 99) * 5.0;
  }

  // Radians per second the player can rotate their run direction, decreasing
  // with speed (you can't turn on a sixpence at full sprint).
  turnRate(speed) {
    const agility = 0.45 + (this.attrs.agility / 99) * 0.55;
    const speedFactor = 1 / (1 + speed * 0.42);
    return (9.5 * agility * speedFactor + 1.1) * this.condition;
  }

  staminaDrain(intensity) {
    const base = 0.34 + intensity * intensity * 1.65;
    const resistance = 0.55 + (this.attrs.stamina / 99) * 0.85;
    return base / resistance;
  }

  updateCondition() {
    const s = this.stamina / 100;
    // Below 60% stamina performance starts to fall off noticeably.
    const fatigueMul = s > 0.6 ? 1 - (1 - s) * 0.09 : 0.964 - (0.6 - s) * 0.42;
    this.freshness = clamp(fatigueMul, 0.6, 1);
    const injMul = 1 - this.injury * 0.5 - this.knock * 0.22;
    this.condition = clamp(this.freshness * injMul, 0.42, 1.06);
  }

  // Effective attribute after fatigue + pressure. Mental attributes degrade
  // more slowly than physical ones but they DO degrade.
  eff(attr) {
    const raw = this.attrs[attr] ?? 50;
    const physical = attr === 'pace' || attr === 'acceleration' || attr === 'agility' || attr === 'strength' || attr === 'workrate';
    const mul = physical ? this.condition : lerp(1, this.condition, 0.55);
    return raw * mul;
  }

  // --- Movement -----------------------------------------------------------
  // Steer toward (tx,tz) at `intensity` (0..1 of max speed). Returns nothing;
  // integrates velocity and position.
  steer(tx, tz, intensity, dt) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    this.moveIntensity = intensity;

    let desiredSpeed = this.maxSpeed * clamp(intensity, 0, 1);
    // Arrive behaviour: slow down as we approach so we don't oscillate.
    const stopDist = (this.speed * this.speed) / (2 * this.decelRate) + 0.28;
    if (d < stopDist) {
      desiredSpeed *= clamp(d / (stopDist + 1e-3), 0, 1);
    }
    if (d < 0.12) desiredSpeed = 0;

    const curSpeed = this.speed;
    let dir;
    if (d > 1e-4) dir = Math.atan2(dz, dx);
    else dir = curSpeed > 0.05 ? Math.atan2(this.vz, this.vx) : this.facing;

    let runDir = curSpeed > 0.05 ? Math.atan2(this.vz, this.vx) : dir;
    const turn = this.turnRate(curSpeed) * dt;
    const angErr = Math.abs(angleDiff(dir, runDir));

    // Sharp direction changes force you to shed speed first.
    if (angErr > 1.1 && curSpeed > 2.2) {
      desiredSpeed = Math.min(desiredSpeed, curSpeed * (1 - dt * 3.2));
    }
    runDir = approachAngle(runDir, dir, turn);

    let newSpeed;
    if (desiredSpeed > curSpeed) {
      // Acceleration falls off near top speed.
      const head = 1 - (curSpeed / (this.maxSpeed + 0.01)) * 0.55;
      newSpeed = Math.min(desiredSpeed, curSpeed + this.accelRate * head * dt);
    } else {
      newSpeed = Math.max(desiredSpeed, curSpeed - this.decelRate * dt);
    }
    if (this.recovering > 0 || this.slideTimer > 0) newSpeed = Math.min(newSpeed, 0.8);

    this.vx = Math.cos(runDir) * newSpeed;
    this.vz = Math.sin(runDir) * newSpeed;

    // Body facing: normally where you run, but you can look elsewhere while
    // moving (set by AI via faceTarget).
    const faceGoal = this.faceOverride ?? runDir;
    this.facing = approachAngle(this.facing, faceGoal, (7.5 + this.attrs.agility * 0.045) * dt);
    this.faceOverride = null;

    this.bodyLean = lerp(this.bodyLean, clamp(angleDiff(dir, runDir) * 0.5, -0.5, 0.5), dt * 6);
  }

  integrate(dt) {
    const prevX = this.x;
    const prevZ = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    const moved = Math.hypot(this.x - prevX, this.z - prevZ);
    this.stats.distance += moved;
    const sp = this.speed;
    if (sp > this.maxSpeed * 0.82) this.stats.sprintDistance += moved;

    // Keep players roughly on/near the pitch (they can go a little wide for
    // throw-ins but not into orbit).
    const marginX = PITCH.halfLength + 3.5;
    const marginZ = PITCH.halfWidth + 3.0;
    if (this.x > marginX) { this.x = marginX; this.vx = Math.min(0, this.vx); }
    if (this.x < -marginX) { this.x = -marginX; this.vx = Math.max(0, this.vx); }
    if (this.z > marginZ) { this.z = marginZ; this.vz = Math.min(0, this.vz); }
    if (this.z < -marginZ) { this.z = -marginZ; this.vz = Math.max(0, this.vz); }

    // Stamina
    const intensity = clamp(sp / (this.maxSpeed + 1e-3), 0, 1);
    this.stamina -= this.staminaDrain(intensity) * dt * 0.5;
    if (intensity < 0.25) {
      this.stamina += (0.9 + this.attrs.stamina * 0.014) * dt * 0.34;
    }
    this.stamina = clamp(this.stamina, 4, 100);

    if (this.knock > 0) this.knock = Math.max(0, this.knock - dt * 0.035);
    if (this.touchCooldown > 0) this.touchCooldown -= dt;
    if (this.tackleCooldown > 0) this.tackleCooldown -= dt;
    if (this.tackleTimer > 0) this.tackleTimer -= dt;
    if (this.slideTimer > 0) this.slideTimer -= dt;
    if (this.recovering > 0) this.recovering -= dt;
    if (this.celebrating > 0) this.celebrating -= dt;
    if (this.kickWindup > 0) this.kickWindup -= dt;
    this.updateCondition();
    this.updateAnim(dt);
  }

  updateAnim(dt) {
    const sp = this.speed;
    const a = this.anim;
    if (this.slideTimer > 0) a.state = 'slide';
    else if (this.recovering > 0) a.state = 'down';
    else if (this.celebrating > 0) a.state = 'celebrate';
    else if (this.kickWindup > 0) a.state = 'kick';
    else if (this.tackleTimer > 0) a.state = 'tackle';
    else if (sp < 0.35) a.state = 'idle';
    else if (sp < 1.9) a.state = 'walk';
    else if (sp < 4.2) a.state = 'jog';
    else if (sp < this.maxSpeed * 0.85) a.state = 'run';
    else a.state = 'sprint';

    // Stride frequency scales with speed (roughly like real gait).
    const cadence = sp < 0.2 ? 0 : 1.35 + sp * 0.52;
    a.phase = (a.phase + cadence * dt) % 1;
    a.armSwing = lerp(a.armSwing, clamp(sp / 8, 0, 1), dt * 6);
    if (a.kickT > 0) a.kickT -= dt * 3.2;
  }

  faceToward(x, z) {
    this.faceOverride = Math.atan2(z - this.z, x - this.x);
  }

  // Distance in front of the player at which they control the ball.
  get controlRadius() {
    return 0.62 + (this.attrs.technique / 99) * 0.30;
  }

  get reachRadius() {
    return 1.05 + (this.attrs.reactions / 99) * 0.35;
  }

  reset() {
    this.vx = 0; this.vz = 0;
    this.hasBall = false;
    this.tackleTimer = 0;
    this.slideTimer = 0;
    this.recovering = 0;
    this.pendingAction = null;
  }
}

export function resetPlayerIds() { NEXT_ID = 0; }
