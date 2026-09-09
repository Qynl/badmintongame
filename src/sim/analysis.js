import { PITCH } from './constants.js';
import { clamp, dist, dist2, pointSegmentDist, smoothstep } from './math.js';

// ---------------------------------------------------------------------------
// Spatial analysis primitives.
//
// This is the "perception" layer of the football AI.  Every decision made
// higher up is grounded in these functions, which are all evaluated against the
// live world state -- there is no scripted knowledge of what "should" happen.
// ---------------------------------------------------------------------------

// Attacking direction for a team: team 0 -> +X, team 1 -> -X.
export function attackDir(team) { return team === 0 ? 1 : -1; }
export function goalX(team) { return attackDir(team) * PITCH.halfLength; }
export function ownGoalX(team) { return -attackDir(team) * PITCH.halfLength; }

// How long a player needs to reach point (x,z), accounting for their current
// momentum -- running the wrong way costs real time.
export function timeToReach(p, x, z, intensity = 1) {
  const dx = x - p.x;
  const dz = z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.15) return 0;
  const vmax = p.maxSpeed * intensity;
  const sp = p.speed;
  // Component of current velocity toward the target.
  const towards = d > 1e-4 ? (p.vx * dx + p.vz * dz) / d : 0;
  // Turn penalty: how much velocity is pointing the wrong way.
  const wrongWay = Math.max(0, sp - Math.max(0, towards));
  const turnPenalty = wrongWay / (p.decelRate + 1e-3) * 0.75;
  const v0 = clamp(towards, -vmax, vmax);
  // Time to accelerate from v0 to vmax
  const a = p.accelRate;
  const tAcc = Math.max(0, (vmax - Math.max(0, v0)) / a);
  const dAcc = Math.max(0, v0) * tAcc + 0.5 * a * tAcc * tAcc;
  let t;
  if (dAcc >= d) {
    // Solve 0.5*a*t^2 + v0*t - d = 0
    const disc = Math.max(0, v0 * v0 + 2 * a * d);
    t = (-Math.max(0, v0) + Math.sqrt(disc)) / a;
  } else {
    t = tAcc + (d - dAcc) / vmax;
  }
  // Reaction latency
  const react = 0.10 + (1 - p.attrs.reactions / 99) * 0.19;
  return t + turnPenalty + react;
}

// Pressure on a player: sum of nearby opponent threat, weighted by how quickly
// they can close and whether they are goal-side.
export function pressureOn(world, p) {
  const opps = world.teams[1 - p.team].players;
  let pressure = 0;
  let nearest = null;
  let nearestD = 999;
  for (let i = 0; i < opps.length; i++) {
    const o = opps[i];
    if (!o.onPitch || o.isGK) continue;
    const d = dist(p.x, p.z, o.x, o.z);
    if (d > 12) continue;
    if (d < nearestD) { nearestD = d; nearest = o; }
    // Closing speed toward p increases pressure.
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const closing = d > 1e-3 ? (o.vx * dx + o.vz * dz) / d : 0;
    const prox = smoothstep(11, 1.0, d);
    pressure += prox * (0.65 + clamp(closing / 7, -0.3, 0.5)) *
                (0.6 + o.eff('aggression') / 200);
  }
  return { value: clamp(pressure, 0, 4), nearest, nearestD };
}

// Can a pass from A to B get through? Returns a risk 0 (safe) .. 1 (suicidal),
// modelled by checking whether any opponent can intercept the ball's path
// before it arrives.
export function laneRisk(world, fromX, fromZ, toX, toZ, team, ballSpeed, lofted = false) {
  const opps = world.teams[1 - team].players;
  const d = dist(fromX, fromZ, toX, toZ);
  if (d < 0.5) return 0;
  const flight = d / Math.max(4, ballSpeed);
  let risk = 0;
  for (let i = 0; i < opps.length; i++) {
    const o = opps[i];
    if (!o.onPitch) continue;
    if (o.isGK && !lofted) {
      // Keeper only threatens passes near their box.
      const gx = ownGoalX(team);
      if (Math.abs(toX - gx) > 30) continue;
    }
    // Closest approach of the opponent to the passing lane.
    const perp = pointSegmentDist(o.x, o.z, fromX, fromZ, toX, toZ);
    if (perp > 14) continue;
    // Where along the lane are they closest? Determines how much time they get.
    const abx = toX - fromX;
    const abz = toZ - fromZ;
    const len2 = abx * abx + abz * abz;
    const t = clamp(((o.x - fromX) * abx + (o.z - fromZ) * abz) / len2, 0, 1);
    const ix = fromX + abx * t;
    const iz = fromZ + abz * t;
    const ballArrival = flight * t + 0.04;
    const oppTime = timeToReach(o, ix, iz, 1);
    const margin = ballArrival - oppTime;
    // Lofted passes over a nearby defender are safer (they can't head it if
    // the ball is high at that point).
    let loftBonus = 0;
    if (lofted) {
      const heightAt = loftedHeightAt(d, t, ballSpeed);
      if (heightAt > 2.6) loftBonus = 0.85;
      else if (heightAt > 1.9) loftBonus = 0.5;
    }
    if (margin > -0.05) {
      const r = smoothstep(-0.05, 1.3, margin) * (1 - loftBonus);
      risk = Math.max(risk, r * clamp(1.2 - perp / 12, 0.15, 1));
    }
  }
  return clamp(risk, 0, 1);
}

function loftedHeightAt(d, t, speed) {
  // Rough parabola for a lofted pass of range d.
  const peak = clamp(d * 0.16, 1.2, 9);
  return 4 * peak * t * (1 - t);
}

// How much free space a point has for `team` -- higher is better.
export function spaceAt(world, x, z, team, radius = 9) {
  const opps = world.teams[1 - team].players;
  let occupancy = 0;
  for (let i = 0; i < opps.length; i++) {
    const o = opps[i];
    if (!o.onPitch || o.isGK) continue;
    const d2 = dist2(x, z, o.x, o.z);
    if (d2 > radius * radius) continue;
    occupancy += 1 - Math.sqrt(d2) / radius;
  }
  // Own teammates crowding the same space is also bad (avoid clustering).
  const mates = world.teams[team].players;
  for (let i = 0; i < mates.length; i++) {
    const m = mates[i];
    if (!m.onPitch || m.isGK) continue;
    const d2 = dist2(x, z, m.x, m.z);
    if (d2 > 36) continue;
    occupancy += (1 - Math.sqrt(d2) / 6) * 0.42;
  }
  return clamp(1 - occupancy * 0.42, 0, 1);
}

// Positional value of holding the ball at (x,z) -- the classic "pitch control /
// expected threat" idea, approximated analytically so it costs nothing.
export function threatValue(x, z, team) {
  const gx = goalX(team);
  const dxGoal = Math.abs(gx - x);
  const dz = Math.abs(z);
  // Distance to goal dominates, central positions worth much more.
  const distTerm = smoothstep(95, 6, dxGoal);
  const centralTerm = 1 - smoothstep(4, 30, dz) * 0.62;
  const boxBonus = dxGoal < PITCH.penaltyAreaLength + 2 && dz < PITCH.penaltyAreaHalfWidth ? 0.28 : 0;
  return clamp(distTerm * distTerm * centralTerm + boxBonus, 0, 1.35);
}

// Angle subtended by the goal from (x,z), blocked portion removed.
export function shootingAngle(world, x, z, team) {
  const gx = goalX(team);
  const hw = PITCH.halfGoalWidth * 0.92;
  const a1 = Math.atan2(hw - z, gx - x);
  const a2 = Math.atan2(-hw - z, gx - x);
  let open = Math.abs(a1 - a2);
  if (Math.abs(gx - x) < 0.5) open = 0;
  // Blockers
  const opps = world.teams[1 - team].players;
  let blocked = 0;
  for (let i = 0; i < opps.length; i++) {
    const o = opps[i];
    if (!o.onPitch) continue;
    const toGoal = (gx - x);
    const toOpp = (o.x - x);
    if (toGoal * toOpp <= 0) continue; // behind the shooter
    if (Math.abs(toOpp) > Math.abs(toGoal)) continue;
    const perp = pointSegmentDist(o.x, o.z, x, z, gx, 0);
    const distToOpp = dist(x, z, o.x, o.z);
    if (perp < 0.85 && distToOpp < 22) {
      blocked += (1 - perp / 0.85) * clamp(1 - distToOpp / 25, 0.2, 1) * (o.isGK ? 1.4 : 1);
    }
  }
  return { open, blocked: clamp(blocked, 0, 2) };
}

// Expected goals for a shot from here.
export function xG(world, shooter, x, z) {
  const team = shooter.team;
  const gx = goalX(team);
  const d = dist(x, z, gx, 0);
  const { open, blocked } = shootingAngle(world, x, z, team);
  if (d > 45) return 0.002;
  const distTerm = Math.exp(-d / 11.5);
  const angleTerm = clamp(open / 0.62, 0, 1);
  const blockTerm = clamp(1 - blocked * 0.55, 0.05, 1);
  const skill = 0.6 + (shooter.eff('finishing') / 99) * 0.75;
  return clamp(distTerm * angleTerm * blockTerm * skill * 1.15, 0.002, 0.92);
}

// The offside line for the ATTACKING team `attackingTeam`.
// It is the position of the second-last defender of the opposing team, or the
// halfway line, whichever is further from the attackers' target goal.
//
// Coordinates: attackers move in +dir. "Further forward" = larger x*dir.
export function offsideLine(world, defendingTeam) {
  const attackingTeam = 1 - defendingTeam;
  const adir = attackDir(attackingTeam);
  const ps = world.teams[defendingTeam].players.filter(p => p.onPitch);
  if (!ps.length) return 0;
  // Rank defenders by how far forward they are IN THE ATTACKERS' direction.
  const proj = ps.map(p => p.x * adir).sort((a, b) => b - a);
  // proj[0] is the most advanced defender, proj[1] the second-last defender.
  const secondLast = proj.length >= 2 ? proj[1] : proj[0];
  // The line can never be behind the halfway line (x*adir = 0) from the
  // attackers' point of view -- you cannot be offside in your own half.
  return Math.max(secondLast, 0) * adir;
}

// Is `p` in an offside position right now (p is on the attacking team)?
export function isOffsidePosition(world, p, ballX) {
  if (p.isGK) return false;
  const dir = attackDir(p.team);
  if (p.x * dir <= 0) return false;            // own half -> never offside
  if (p.x * dir <= ballX * dir + 0.05) return false; // level with / behind ball
  const line = offsideLine(world, 1 - p.team);
  return p.x * dir > line * dir + 0.2;
}

// Find the best receiving position for a runner: sample a small arc of options
// ahead of them and score by space + threat + reachability.
export function bestRunTarget(world, p, ball, opts = {}) {
  const dir = attackDir(p.team);
  const samples = opts.samples ?? 9;
  const range = opts.range ?? 16;
  let best = null;
  let bestScore = -Infinity;
  const baseAngle = opts.baseAngle ?? 0;
  const spread = opts.spread ?? Math.PI * 0.72;
  const offLine = offsideLine(world, 1 - p.team);
  for (let i = 0; i < samples; i++) {
    const a = baseAngle - spread / 2 + (spread * i) / (samples - 1);
    for (const r of [range * 0.45, range * 0.8, range]) {
      const tx = p.x + Math.cos(a) * r * dir;
      const tz = p.z + Math.sin(a) * r;
      if (Math.abs(tx) > PITCH.halfLength - 1 || Math.abs(tz) > PITCH.halfWidth - 0.6) continue;
      // Don't run into an offside position unless the ball is about to be played.
      if (tx * dir > offLine * dir + 0.4 && tx * dir > 0) continue;
      const sp = spaceAt(world, tx, tz, p.team, 9);
      const th = threatValue(tx, tz, p.team);
      const lane = 1 - laneRisk(world, ball.x, ball.z, tx, tz, p.team, 17);
      const cost = dist(p.x, p.z, tx, tz) / 30;
      const score = sp * 1.0 + th * 1.5 + lane * 0.9 - cost * 0.5;
      if (score > bestScore) { bestScore = score; best = { x: tx, z: tz, score }; }
    }
  }
  return best;
}
