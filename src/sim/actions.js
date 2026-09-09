import { PITCH, BALL, GRAVITY } from './constants.js';
import { clamp, dist, lerp, normalise, smoothstep } from './math.js';
import { attackDir, goalX, ownGoalX, xG, pressureOn } from './analysis.js';

// ---------------------------------------------------------------------------
// EXECUTION LAYER
//
// Turning an intention into ball physics.  Every action has an execution error
// that depends on the player's attributes, their body position relative to the
// intended direction, their speed, pressure, and fatigue.  This is where
// "realistic" comes from: a great pass is not guaranteed, and a bad angle
// genuinely ruins the technique.
// ---------------------------------------------------------------------------

// How well is the player's body set up for a kick in this direction?
// 1 = perfectly set, 0 = completely wrong-footed.
export function bodyShapeQuality(p, dirX, dirZ) {
  const [nx, nz] = normalise(dirX, dirZ);
  const fx = Math.cos(p.facing);
  const fz = Math.sin(p.facing);
  const align = nx * fx + nz * fz; // -1..1
  // Running fast in the wrong direction makes it much worse.
  const speedPenalty = clamp(p.speed / (p.maxSpeed + 0.01), 0, 1);
  const base = clamp((align + 0.35) / 1.35, 0, 1);
  return clamp(base * (1 - speedPenalty * 0.32 * (1 - base)), 0.05, 1);
}

// Weak-foot penalty based on which side the ball is being struck from.
export function footQuality(p, dirZ) {
  const preferred = p.footedness === 'L' ? -1 : 1;
  const side = Math.sign(dirZ - Math.sin(p.facing) * 0.0);
  // Simple model: kicking across your body to the weak side is harder.
  const rel = Math.sin(Math.atan2(dirZ, Math.cos(p.facing)) - p.facing);
  const weakSide = Math.sign(rel) !== preferred;
  return weakSide ? 0.80 : 1.0;
}

// --- PASS -------------------------------------------------------------------
export function executePass(world, p, opt) {
  const ball = world.ball;
  const target = opt.target;
  let dx = target.x - p.x;
  let dz = target.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.1) return false;

  const shape = bodyShapeQuality(p, dx, dz);
  const foot = footQuality(p, dz);
  const pressure = opt.pressure ?? 0;

  const skill = (p.eff('passing') * 0.62 + p.eff('technique') * 0.24 + p.eff('composure') * 0.14) / 99;
  // Accuracy: angular error in radians.
  const difficulty = clamp(d / 45, 0, 1.1) * 0.9 + (opt.lofted ? 0.25 : 0) + pressure * 0.22;
  const quality = clamp(skill * shape * foot - difficulty * 0.28, 0.02, 1.05);
  const angError = world.rng.gauss(0, (1 - quality) * 0.155);
  // Weight error: over/under hit.
  const weightError = 1 + world.rng.gauss(0, (1 - quality) * 0.17);

  const a = Math.atan2(dz, dx) + angError;
  // Required speed so the ball arrives at a sensible pace.
  let speed;
  let loft = 0;
  let spin = 0;
  if (opt.lofted) {
    // Ballistic solve for a lofted pass. Use a FLAT launch angle -- a chipped
    // pass in football clears a defender and drops, it does not go into orbit.
    // 0.20-0.38 rad (11-22 degrees) keeps the apex around 1.5-4m.
    loft = clamp(0.19 + d * 0.0035, 0.18, 0.40);
    const g = GRAVITY;
    const denom = Math.sin(2 * loft);
    speed = Math.sqrt(Math.max(4, (d * g) / Math.max(0.15, denom))) * 1.05;
    speed = clamp(speed * weightError, 6, 33);
  } else {
    // Ground pass: weight it so the flight time stays in the 0.4-1.3s band
    // that real passes occupy. Too slow and every ball gets cut out.
    // Weight the pass so it ARRIVES at a controllable pace. A five-yard ball
    // played at 14 m/s is unreceivable, and that -- not the aim -- was why
    // completion sat in the forties: every pass was arriving too hard to
    // control and bouncing off the receiver.
    //
    // Real arrival pace is roughly 5-9 m/s: firm enough that a defender cannot
    // step in front, soft enough that the first touch can kill it.
    const dec = BALL.groundFriction * (1 + 0.045 * 12);
    const arrive = clamp(4.8 + d * 0.075, 4.8, 9.5);
    let s = Math.sqrt(arrive * arrive + 2 * dec * d);
    // A through ball into space is deliberately hit harder to beat the line.
    if (opt.subtype === 'space') s *= 1.14;
    // Only a genuinely floor: a pass must still travel, but the ceiling is what
    // keeps it receivable.
    s = Math.max(s, 6.5);
    speed = clamp(s * weightError, 6, opt.subtype === 'space' ? 27 : 22);
    spin = 0;
  }
  // Curl: better players can bend it round a defender.
  const curl = world.rng.gauss(0, 0.6) + (opt.risk ?? 0) * (skill - 0.5) * 14;

  ball.kick(Math.cos(a), Math.sin(a), speed, loft, curl, opt.lofted ? -6 : 4);
  ball.registerTouch(p.id, p.team);
  ball.intent = {
    type: 'pass',
    from: p.id,
    to: opt.receiver ? opt.receiver.id : -1,
    team: p.team,
    targetX: target.x,
    targetZ: target.z,
    atTime: world.matchSeconds,
    subtype: opt.subtype,
    ballXAtPass: p.x,
  };
  p.stats.passes++;
  world.stats.passes[p.team]++;
  p.stats.touches++;
  p.kickWindup = 0.22;
  p.anim.kickT = 1;
  p.touchCooldown = 0.30;
  p.hasBall = false;
  ball.owner = -1;
  ball.ownerTeam = -1;
  if (opt.receiver) {
    opt.receiver.brain.lastPassFrom = p.id;
    opt.receiver.brain.expectingBall = world.matchSeconds;
    // Force an immediate re-think so they start moving to meet it this frame.
    opt.receiver.brain.decisionTimer = 0;
  }
  // Everyone near the ball should also reassess (second balls, pressing).
  for (const other of world.allPlayers) {
    if (other === p || !other.onPitch) continue;
    if (Math.hypot(other.x - target.x, other.z - target.z) < 22) {
      other.brain.decisionTimer = Math.min(other.brain.decisionTimer, 0.05);
    }
  }
  world.events.emit('pass', { player: p, target: opt.receiver, lofted: opt.lofted, risk: opt.risk });
  return true;
}

// --- SHOT -------------------------------------------------------------------
export function executeShot(world, p, opt, aimOverride = null) {
  const ball = world.ball;
  const gx = goalX(p.team);
  const dir = attackDir(p.team);
  const d = dist(p.x, p.z, gx, 0);

  // Pick a corner to aim for -- better finishers pick better spots.
  const finishing = p.eff('finishing') / 99;
  const composure = p.eff('composure') / 99;
  let aimZ;
  let aimY;
  if (aimOverride) {
    aimZ = aimOverride.z;
    aimY = aimOverride.y;
  } else {
    // Find which side the keeper is NOT on.
    const gk = world.teams[1 - p.team].players.find(g => g.isGK && g.onPitch);
    const gkZ = gk ? gk.z : 0;
    const side = gkZ > 0 ? -1 : 1;
    const cornerFrac = 0.45 + finishing * 0.45;
    aimZ = side * PITCH.halfGoalWidth * cornerFrac;
    // Mix in low/high placement.
    aimY = world.rng.chance(0.32 + finishing * 0.2)
      ? lerp(1.1, PITCH.goalHeight * 0.82, world.rng())
      : lerp(0.25, 0.85, world.rng());
  }

  const dz = aimZ - p.z;
  const dxx = gx - p.x;
  const shape = bodyShapeQuality(p, dxx, dz);
  const foot = footQuality(p, dz);
  const pressure = opt.pressure ?? 0;

  const power = p.eff('shooting') / 99;
  const skill = (p.eff('finishing') * 0.5 + p.eff('shooting') * 0.28 + p.eff('composure') * 0.22) / 99;
  // Big chances are missed under pressure and when off balance.
  const difficulty = clamp(d / 34, 0, 1.4) * 0.6 + pressure * 0.30 + (1 - shape) * 0.55;
  const quality = clamp(skill * shape * foot * (0.75 + composure * 0.35) - difficulty * 0.30, 0.02, 1.1);

  const spreadH = (1 - quality) * 0.135 + 0.008;
  const spreadV = (1 - quality) * 0.14 + 0.01;
  const angH = Math.atan2(dz, dxx) + world.rng.gauss(0, spreadH);

  // Vertical: aim for aimY at distance d.
  const speed = clamp(18 + power * 17 + world.rng.gauss(0, 1.6), 12, 38);
  // Elevation needed to hit aimY (approximate ballistic, ignoring drag).
  const g = GRAVITY;
  const flat = Math.hypot(dxx, dz);
  let elev;
  const disc = speed ** 4 - g * (g * flat * flat + 2 * (aimY - 0.4) * speed * speed);
  if (disc > 0) {
    elev = Math.atan((speed * speed - Math.sqrt(disc)) / (g * flat));
  } else {
    elev = 0.22;
  }
  elev += world.rng.gauss(0, spreadV);
  elev = clamp(elev, -0.06, 0.75);

  // Curl for placed shots.
  const curl = world.rng.gauss(0, 2.5) + (aimZ > 0 ? -1 : 1) * quality * 8 * (world.rng.chance(0.4) ? 1 : 0);

  ball.kick(Math.cos(angH), Math.sin(angH), speed, elev, curl, -3);
  ball.registerTouch(p.id, p.team);
  ball.intent = { type: 'shot', from: p.id, team: p.team, atTime: world.matchSeconds, xg: opt.xg ?? 0 };
  p.stats.shots++;
  p.stats.touches++;
  p.kickWindup = 0.28;
  p.anim.kickT = 1;
  p.touchCooldown = 0.34;
  p.hasBall = false;
  ball.owner = -1;
  ball.ownerTeam = -1;
  world.events.emit('shot', { player: p, xg: opt.xg ?? xG(world, p, p.x, p.z) });
  return true;
}

// --- CLEARANCE --------------------------------------------------------------
export function executeClear(world, p, opt) {
  const ball = world.ball;
  const dir = attackDir(p.team);
  const target = opt.target;
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const shape = bodyShapeQuality(p, dx, dz);
  const a = Math.atan2(dz, dx) + world.rng.gauss(0, (1 - shape) * 0.24 + 0.06);
  const speed = clamp(22 + (p.eff('strength') / 99) * 12 + world.rng.gauss(0, 2), 14, 34);
  // A clearance is hit long and reasonably flat -- not vertically.
  const loft = clamp(0.34 + world.rng.gauss(0, 0.07), 0.20, 0.52);
  ball.kick(Math.cos(a), Math.sin(a), speed, loft, world.rng.gauss(0, 2), -4);
  ball.registerTouch(p.id, p.team);
  ball.intent = { type: 'clearance', from: p.id, team: p.team, atTime: world.matchSeconds };
  p.stats.clearances++;
  p.stats.touches++;
  p.kickWindup = 0.24;
  p.anim.kickT = 1;
  p.touchCooldown = 0.30;
  p.hasBall = false;
  ball.owner = -1;
  ball.ownerTeam = -1;
  world.events.emit('clearance', { player: p });
  return true;
}

// --- CROSS ------------------------------------------------------------------
export function executeCross(world, p, targetX, targetZ, driven = false) {
  const ball = world.ball;
  const dx = targetX - p.x;
  const dz = targetZ - p.z;
  const d = Math.hypot(dx, dz);
  const shape = bodyShapeQuality(p, dx, dz);
  const skill = (p.eff('passing') * 0.55 + p.eff('technique') * 0.45) / 99;
  const quality = clamp(skill * shape - 0.15, 0.05, 1);
  const a = Math.atan2(dz, dx) + world.rng.gauss(0, (1 - quality) * 0.16);
  const loft = driven ? clamp(0.16 + world.rng.gauss(0, 0.04), 0.06, 0.3)
                      : clamp(0.36 + world.rng.gauss(0, 0.06), 0.24, 0.55);
  const g = GRAVITY;
  const denom = Math.max(0.2, Math.sin(2 * loft));
  let speed = Math.sqrt((d * g) / denom) * (driven ? 1.18 : 1.03);
  speed = clamp(speed * (1 + world.rng.gauss(0, (1 - quality) * 0.14)), 10, 34);
  const curl = world.rng.gauss(0, 3) + (p.footedness === 'L' ? 6 : -6) * quality;
  ball.kick(Math.cos(a), Math.sin(a), speed, loft, curl, -5);
  ball.registerTouch(p.id, p.team);
  ball.intent = { type: 'cross', from: p.id, team: p.team, targetX, targetZ, atTime: world.matchSeconds, ballXAtPass: p.x };
  p.stats.passes++;
  world.stats.passes[p.team]++;
  p.stats.touches++;
  p.kickWindup = 0.26;
  p.anim.kickT = 1;
  p.touchCooldown = 0.32;
  p.hasBall = false;
  ball.owner = -1;
  ball.ownerTeam = -1;
  world.events.emit('cross', { player: p });
  return true;
}

// --- FIRST TOUCH ------------------------------------------------------------
// When a player receives a ball, the touch quality determines whether they take
// it in stride, take a heavy touch, or fail to control it entirely.
export function firstTouch(world, p, ball) {
  const incoming = ball.speed3;
  const control = p.eff('technique') * 0.5 + p.eff('reactions') * 0.2 + p.eff('composure') * 0.3;
  // How hard is this to control? A firmly-struck pass to feet from a teammate
  // is routine for a professional; a bouncing 25 m/s clearance is not.
  const heightPenalty = clamp((ball.y - 0.45) / 1.9, 0, 1) * 0.30;
  const speedPenalty = clamp((incoming - 8) / 26, 0, 1) * 0.45;
  const shape = bodyShapeQuality(p, ball.x - p.x, ball.z - p.z);
  // Receiving a pass meant for you is much easier than reacting to a stray one.
  const expected = ball.intent && ball.intent.to === p.id ? 0.22 : 0;
  const underPressure = clamp(pressureOn(world, p).value * 0.10, 0, 0.28);
  const difficulty = speedPenalty + heightPenalty + (1 - shape) * 0.20 +
                     (p.speed / (p.maxSpeed + 0.01)) * 0.14 + underPressure;
  const skill = control / 99;
  const success = clamp(skill * 1.32 + expected - difficulty * 0.85, 0.12, 0.985);
  const roll = world.rng();

  if (roll < success * 0.72) return { result: 'clean', errorScale: 0.35 };
  if (roll < success) return { result: 'ok', errorScale: 0.85 };
  if (roll < success + (1 - success) * 0.72) return { result: 'heavy', errorScale: 2.2 };
  return { result: 'lost', errorScale: 4.0 };
}

// --- TACKLE -----------------------------------------------------------------
// Returns {outcome: 'win'|'foul'|'miss'|'partial', severity}
export function resolveTackle(world, tackler, carrier, sliding) {
  const rng = world.rng;
  const d = dist(tackler.x, tackler.z, carrier.x, carrier.z);
  const tackling = tackler.eff('tackling') / 99;
  const aggression = tackler.eff('aggression') / 99;
  const strength = tackler.eff('strength') / 99;
  const dribbling = carrier.eff('dribbling') / 99;
  const balance = (carrier.eff('strength') * 0.5 + carrier.eff('agility') * 0.5) / 99;
  const carrierComposure = carrier.eff('composure') / 99;

  // Approach angle: coming in from the side/front is better than from behind.
  const toC = Math.atan2(carrier.z - tackler.z, carrier.x - tackler.x);
  const carrierDir = Math.atan2(carrier.vz, carrier.vx);
  const behind = Math.cos(toC - carrierDir) > 0.55; // tackler chasing from behind
  const angleQuality = behind ? 0.55 : 0.95;

  // Closing speed differential.
  const speedDiff = clamp((tackler.speed - carrier.speed) / 6, -0.6, 0.6);

  let winChance = (tackling * 0.55 + strength * 0.2 + angleQuality * 0.25) -
                  (dribbling * 0.42 + balance * 0.22 + carrierComposure * 0.10);
  winChance += speedDiff * 0.12;
  winChance += sliding ? 0.16 : 0;
  winChance -= clamp((d - 1.1) * 0.35, 0, 0.5);
  winChance = clamp(winChance + 0.42, 0.04, 0.94);

  // Foul chance rises with aggression, sliding, coming from behind, and being
  // beaten for pace.
  let foulChance = 0.05 + aggression * 0.13 + (sliding ? 0.15 : 0) +
                   (behind ? 0.12 : 0) + clamp(-speedDiff, 0, 0.6) * 0.16;
  foulChance *= (1.5 - tackling);
  foulChance = clamp(foulChance, 0.02, 0.62);

  const roll = rng();
  if (roll < winChance) {
    // Clean win... unless we also caught the man.
    if (rng() < foulChance * 0.35) {
      return { outcome: 'foul', severity: foulSeverity(rng, aggression, sliding, behind, speedDiff) };
    }
    return { outcome: 'win', clean: true };
  }
  if (roll < winChance + foulChance) {
    return { outcome: 'foul', severity: foulSeverity(rng, aggression, sliding, behind, speedDiff) };
  }
  if (rng() < 0.3) return { outcome: 'partial' }; // ball squirts loose
  return { outcome: 'miss' };
}

function foulSeverity(rng, aggression, sliding, behind, speedDiff) {
  let s = rng() * 0.55 + aggression * 0.25;
  if (sliding) s += 0.18;
  if (behind) s += 0.10;
  s += clamp(-speedDiff, 0, 0.6) * 0.12;
  return clamp(s, 0, 1);
}

// --- HEADER -----------------------------------------------------------------
export function executeHeader(world, p, ball, aimX, aimZ, isShot) {
  const heading = p.eff('heading') / 99;
  const dx = aimX - p.x;
  const dz = aimZ - p.z;
  const a = Math.atan2(dz, dx) + world.rng.gauss(0, (1 - heading) * 0.20 + 0.045);
  const power = clamp(9 + heading * 11 + ball.speed3 * 0.28, 6, 26);
  const loft = isShot ? clamp(0.02 + world.rng.gauss(0, 0.07), -0.12, 0.28)
                      : clamp(0.26 + world.rng.gauss(0, 0.08), 0.08, 0.48);
  ball.kick(Math.cos(a), Math.sin(a), power, loft, world.rng.gauss(0, 1.5), 0);
  ball.registerTouch(p.id, p.team);
  ball.intent = { type: isShot ? 'shot' : 'header', from: p.id, team: p.team, atTime: world.matchSeconds };
  p.stats.touches++;
  if (isShot) p.stats.shots++;
  p.kickWindup = 0.2;
  p.anim.kickT = 1;
  p.touchCooldown = 0.3;
  p.hasBall = false;
  ball.owner = -1;
  ball.ownerTeam = -1;
  world.events.emit(isShot ? 'shot' : 'header', { player: p, xg: isShot ? xG(world, p, p.x, p.z) * 0.7 : 0 });
  return true;
}
