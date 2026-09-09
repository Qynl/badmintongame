import { PITCH, BALL } from '../sim/constants.js';
import { clamp, dist, lerp, smoothstep, normalise } from '../sim/math.js';
import {
  attackDir, goalX, ownGoalX, timeToReach, pressureOn, laneRisk,
  spaceAt, threatValue, xG, offsideLine, isOffsidePosition, shootingAngle,
} from '../sim/analysis.js';
import { TEAM_PHASE } from './teamBrain.js';

// ---------------------------------------------------------------------------
// ON-BALL DECISION ENGINE
//
// A utility system: every plausible action is generated from the live world,
// scored on expected value, discounted by risk and by the player's own ability
// to execute it, then the best is chosen with a noise term proportional to how
// poor the player's decision-making is.  Nothing is hard-coded per scenario --
// a through ball only appears as an option when the geometry actually creates
// one.
// ---------------------------------------------------------------------------

const PASS_SPEEDS = {
  short: 13.5,
  ground: 17.5,
  driven: 24,
  lofted: 19,
  through: 19,
  long: 27,
};

export function decideOnBall(world, p, brain) {
  const team = world.teams[p.team];
  const tb = team.brain;
  const ball = world.ball;
  const dir = attackDir(p.team);
  const press = pressureOn(world, p);
  const options = [];

  const gx = goalX(p.team);
  const distGoal = dist(p.x, p.z, gx, 0);
  const composure = p.eff('composure') / 99;
  const decisions = p.eff('decisions') / 99;
  const vision = p.eff('vision') / 99;

  // Under heavy pressure the player literally sees fewer options.
  const panic = clamp(press.value * (1.15 - composure * 0.75), 0, 2);
  const searchRange = lerp(26, 62, vision) * (1 - panic * 0.16);

  // ---------------- SHOT ----------------
  if (!p.isGK || distGoal < 35) {
    const shotXg = xG(world, p, p.x, p.z);
    if (distGoal < 38) {
      const { open, blocked } = shootingAngle(world, p.x, p.z, p.team);
      const powerNeeded = clamp(distGoal / 30, 0.35, 1);
      const abilityFit = clamp(p.eff('shooting') / 99 / (powerNeeded * 0.85 + 0.25), 0, 1.4);
      // Value: goal probability, plus a little for forcing a save/corner.
      let v = shotXg * 3.9 + shotXg * abilityFit * 0.8;
      v -= blocked * 0.45;
      // Being under pressure makes a quick shot MORE attractive than dawdling.
      v += clamp(press.value - 0.9, 0, 1.5) * shotXg * 1.6;
      // Late & chasing -> shoot from further out.
      v += tb.urgency * shotXg * 1.2;
      if (open < 0.08) v -= 1.2;
      // Fatigued players shoot rather than run.
      v += (1 - p.condition) * shotXg * 0.8;
      if (v > 0) {
        options.push({ type: 'shoot', value: v, xg: shotXg, target: { x: gx, z: 0 } });
      }
    }
  }

  // ---------------- PASSES ----------------
  const mates = team.players;
  const offLine = offsideLine(world, 1 - p.team);
  for (let i = 0; i < mates.length; i++) {
    const m = mates[i];
    if (m === p || !m.onPitch) continue;
    const d = dist(p.x, p.z, m.x, m.z);
    if (d > searchRange || d < 1.4) continue;

    // Lead the pass: aim where the receiver will be, based on their run.
    const leadT = clamp(d / 17, 0.15, 1.5);
    const leadX = m.x + m.vx * leadT * 0.82;
    const leadZ = m.z + m.vz * leadT * 0.82;

    // Two flavours to every target: to feet, and into space ahead.
    for (const kind of ['feet', 'space']) {
      let tx = leadX;
      let tz = leadZ;
      let lofted = false;
      let speed = d < 14 ? PASS_SPEEDS.short : d < 30 ? PASS_SPEEDS.ground : PASS_SPEEDS.long;
      if (kind === 'space') {
        // Play it in front of them, toward goal / into the channel.
        const runAhead = clamp(6 + m.eff('pace') * 0.075, 5, 13);
        tx = m.x + dir * runAhead + m.vx * 0.5;
        tz = m.z + m.vz * 0.5 + (m.z - p.z) * 0.12;
        speed = PASS_SPEEDS.through;
      }
      // Keep the target comfortably inside the pitch -- a pass aimed at the
      // touchline goes out as soon as there is any execution error.
      if (Math.abs(tx) > PITCH.halfLength - 2.5) tx = Math.sign(tx) * (PITCH.halfLength - 2.5);
      if (Math.abs(tz) > PITCH.halfWidth - 2.5) tz = Math.sign(tz) * (PITCH.halfWidth - 2.5);

      // Offside check on the *receiving point*.
      const wouldBeOffside = kind === 'space'
        ? (tx * dir > offLine * dir + 0.4 && tx * dir > 0 && tx * dir > ball.x * dir)
        : (m.x * dir > offLine * dir + 0.3 && m.x * dir > 0 && m.x * dir > ball.x * dir);

      const passDist = dist(p.x, p.z, tx, tz);
      if (passDist < 1.2) continue;
      let risk = laneRisk(world, p.x, p.z, tx, tz, p.team, speed, false);

      // Consider lofting it if the ground lane is blocked and it's long enough.
      let usedLoft = false;
      if (risk > 0.35 && passDist > 12) {
        const airRisk = laneRisk(world, p.x, p.z, tx, tz, p.team, PASS_SPEEDS.lofted, true);
        if (airRisk < risk - 0.12) { risk = airRisk; usedLoft = true; lofted = true; speed = PASS_SPEEDS.lofted; }
      }

      // Can the receiver actually get there before an opponent?
      const flight = passDist / speed + (lofted ? 0.35 : 0);
      const mateTime = timeToReach(m, tx, tz, kind === 'space' ? 1 : 0.85);
      const reachMargin = flight + 0.22 - mateTime;
      if (kind === 'space' && reachMargin < -0.55) continue;
      if (kind === 'feet' && mateTime > flight + 1.25) continue;

      // Value of the receiver's resulting situation.
      const recvThreat = threatValue(tx, tz, p.team);
      const curThreat = threatValue(p.x, p.z, p.team);
      const recvSpace = spaceAt(world, tx, tz, p.team, 9);
      const recvPress = pressureOn(world, m).value;
      // Progressive passes are worth more; backwards passes have value when
      // under pressure (recycling possession is a real, correct choice).
      const progress = (tx - p.x) * dir;
      let v = 0;
      v += (recvThreat - curThreat) * 2.6;
      v += recvSpace * 0.55;
      v += clamp(progress / 26, -0.5, 1.0) * 0.85;
      v -= recvPress * 0.34;
      v -= risk * (2.2 + (1 - tb.riskAppetite) * 1.5);
      // A safe backward/sideways ball is valuable when we're being pressed.
      if (progress < 0 && press.value > 1.0) v += (press.value - 0.7) * 0.8 * (1 - risk);
      // Receiver quality matters: don't play the killer ball to the left back.
      if (kind === 'space') {
        v += (m.eff('pace') / 99) * 0.5 + (m.eff('finishing') / 99) * recvThreat * 0.9;
        v += tb.effTactics.directness * 0.28;
      }
      // Execution: can *this* player hit this pass? Long passes are much more
      // likely to go astray, and the AI must PRICE THAT IN, not just try them.
      const difficulty = clamp(passDist / 42, 0, 1) * 0.6 +
                         risk * 0.5 + (lofted ? 0.2 : 0) + panic * 0.2;
      const skill = (p.eff('passing') * 0.6 + p.eff('technique') * 0.25 + p.eff('vision') * 0.15) / 99;
      const execution = clamp(skill - difficulty * 0.75, 0.03, 1);
      // Price in the chance of misplacing it, but as a SUBTRACTION. Scaling the
      // whole utility by execution also crushed the value of easy short passes,
      // which is what made the AI dribble instead of moving the ball.
      v -= (1 - execution) * (0.5 + risk * 0.85);
      // The baseline merit of simply keeping possession by giving it to a
      // teammate. Real teams pass ~600-900 times a match; the safe five-metre
      // ball to a free man is a positive act, not a neutral one.
      v += 0.55 * clamp(execution, 0, 1) * (1 - clamp(recvPress / 2.2, 0, 0.8));
      // Explicit distance penalty: real teams overwhelmingly play short. The
      // penalty is softened for good passers and for direct tactical setups.
      const rangeComfort = 14 + skill * 16 + tb.effTactics.directness * 14;
      if (passDist > rangeComfort) {
        v -= ((passDist - rangeComfort) / 26) * (1.5 - skill * 0.6);
      }
      // Offside is a wasted attack.
      if (wouldBeOffside) v -= 2.6;
      // Tactical: switch play if there's a big overload elsewhere.
      const isSwitch = Math.abs(tz - p.z) > 22 && Math.abs(progress) < 22;
      if (isSwitch) {
        const switchGain = Math.sign(tz) === Math.sign(tb.freeSpaceZ ?? 0) ? 0.55 : 0;
        v += switchGain + spaceAt(world, tx, tz, p.team, 12) * 0.4;
        if (world.matchSeconds - tb.lastSwitchTime < 6) v -= 0.35;
      }
      // Tempo instruction: slow build prefers short, safe options.
      v += (1 - tb.effTactics.tempo) * clamp(1 - passDist / 20, 0, 1) * 0.28;
      v += tb.effTactics.directness * clamp(progress / 40, 0, 1) * 0.5;

      // Don't immediately return the ball to whoever just gave it to you.
      if (m.id === p.brain.lastPassFrom && p.controlTimer < 0.7) v -= 0.5;

      options.push({
        type: 'pass',
        subtype: kind,
        value: v,
        target: { x: tx, z: tz },
        receiver: m,
        speed,
        lofted: usedLoft,
        risk,
        execution,
      });
    }
  }

  // ---------------- DRIBBLE ----------------
  // NOTE: only the single best dribble direction is entered as a candidate.
  // Entering all nine would give "dribble" nine independent draws from the
  // decision-noise distribution, and the maximum of nine samples beats the
  // maximum of one almost always -- the AI would dribble constantly. Every
  // action category must contribute a comparable number of candidates.
  {
    const dribbleSkill = (p.eff('dribbling') * 0.6 + p.eff('technique') * 0.25 + p.eff('agility') * 0.15) / 99;
    const dirs = 9;
    let bestDribble = null;
    for (let i = 0; i < dirs; i++) {
      const a = (-Math.PI * 0.62) + (Math.PI * 1.24 * i) / (dirs - 1);
      const wx = Math.cos(a) * dir;
      const wz = Math.sin(a);
      const range = 7 + dribbleSkill * 6;
      const tx = clamp(p.x + wx * range, -PITCH.halfLength + 1, PITCH.halfLength - 1);
      const tz = clamp(p.z + wz * range, -PITCH.halfWidth + 0.8, PITCH.halfWidth - 0.8);
      const sp = spaceAt(world, tx, tz, p.team, 8);
      const th = threatValue(tx, tz, p.team);
      const cur = threatValue(p.x, p.z, p.team);
      // Opponent contesting this direction.
      let contest = 0;
      const opps = world.teams[1 - p.team].players;
      for (const o of opps) {
        if (!o.onPitch || o.isGK) continue;
        const od = dist(tx, tz, o.x, o.z);
        if (od > 9) continue;
        const t = timeToReach(o, tx, tz, 1);
        const myT = dist(p.x, p.z, tx, tz) / (p.maxSpeed * 0.78);
        if (t < myT + 0.5) contest += clamp(1 - t / (myT + 0.9), 0, 1) *
          (0.55 + o.eff('tackling') / 190);
      }
      let v = (th - cur) * 2.3 + sp * 0.42 - contest * (1.6 + (1 - dribbleSkill) * 1.5);
      v += dribbleSkill * 0.30;
      v -= press.value * (0.75 - dribbleSkill * 0.32);
      // Carrying the ball is the slowest way to move it and the easiest to
      // defend. Even a good dribbler only beats his man a fraction of the
      // time, so running with it must clear a real bar, not be the default.
      v -= 0.34;
      // Every extra second on the ball makes carrying on less defensible --
      // this is what stops a player soloing across the pitch.
      v -= clamp(p.controlTimer - 0.8, 0, 2.5) * 0.42;
      // Only genuine dribblers should back themselves against a close opponent.
      if (contest > 0.35) v -= (1 - dribbleSkill) * 0.7;
      // Turning backwards is a retreat -- only do it under pressure.
      if (wx < 0) v -= press.value > 1.1 ? 0.1 : 0.7;
      // Keep the ball moving into the final third if we're chasing.
      v += tb.urgency * clamp((tx - p.x) * dir / 30, 0, 1) * 0.3;
      if (!bestDribble || v > bestDribble.value) {
        bestDribble = { type: 'dribble', value: v, target: { x: tx, z: tz }, contest };
      }
    }
    if (bestDribble) options.push(bestDribble);
  }

  // ---------------- CLEARANCE / HOLD ----------------
  {
    // In our own third under pressure, hoofing it is legitimate.
    const ownThird = p.x * dir < -PITCH.halfLength * 0.34;
    if (ownThird) {
      const danger = smoothstep(-PITCH.halfLength * 0.2, -PITCH.halfLength, p.x * dir);
      let v = danger * press.value * 1.5 - 0.9;
      v += (1 - p.eff('composure') / 99) * danger * 0.9;
      if (v > 0) {
        const tz = Math.sign(p.z || 1) * PITCH.halfWidth * 0.72;
        options.push({ type: 'clear', value: v, target: { x: p.x + dir * 45, z: tz } });
      }
    }
    // Shield / hold up the ball -- buys time for support to arrive.
    // Holding is the null action: it must be the option you take when nothing
    // better exists, never a positive choice in its own right.
    let holdV = -0.30;
    holdV += (p.eff('strength') / 99) * clamp(press.value - 0.5, 0, 1.5) * 0.5;
    holdV -= press.value * 0.35;
    // If support is arriving soon, holding is good.
    let supportComing = 0;
    for (const m of mates) {
      if (m === p || !m.onPitch || m.isGK) continue;
      const d = dist(p.x, p.z, m.x, m.z);
      if (d < 18 && d > 3) {
        const closing = ((p.x - m.x) * m.vx + (p.z - m.z) * m.vz) / (d + 1e-3);
        if (closing > 1.2) supportComing += 0.25;
      }
    }
    holdV += clamp(supportComing, 0, 0.7);
    holdV += (1 - tb.effTactics.tempo) * 0.2;
    // Standing on the ball has the same time cost as running with it.
    holdV -= clamp(p.controlTimer - 0.7, 0, 2.5) * 0.5;
    options.push({ type: 'hold', value: holdV, target: null });
  }

  if (!options.length) return { type: 'hold', value: 0, target: null };

  // ---------------- CHOICE ----------------
  // Poor decision-makers pick worse options; good ones pick near-optimally.
  //
  // Noise is applied in two stages to avoid max-selection bias: a single draw
  // per ACTION CATEGORY (so having many pass targets doesn't make passing
  // artificially attractive), plus a small per-option draw to pick between
  // targets within a category.
  const noiseScale = ((1 - decisions) * 0.85 + panic * 0.22 + (1 - p.condition) * 0.3) *
                     (world.aiNoiseByTeam?.[p.team] ?? 1);
  const categoryNoise = new Map();
  let best = null;
  let bestScore = -Infinity;
  for (const o of options) {
    if (!categoryNoise.has(o.type)) {
      categoryNoise.set(o.type, world.rng.gauss(0, noiseScale * 0.5));
    }
    const noisy = o.value + categoryNoise.get(o.type) + world.rng.gauss(0, noiseScale * 0.16);
    if (noisy > bestScore) { bestScore = noisy; best = o; }
  }
  best.score = bestScore;
  best.pressure = press.value;
  if (world.__probe) {
    const byType = {};
    for (const o of options) byType[o.type] = Math.max(byType[o.type] ?? -99, o.value);
    world.__probe.push({ chosen: best.type, byType, n: options.length,
      nPass: options.filter(o => o.type === 'pass').length });
  }
  return best;
}

// ---------------------------------------------------------------------------
// OFF-BALL MOVEMENT
//
// Decides where a player without the ball should be.  This is where most of
// the "football intelligence" lives -- supporting angles, runs in behind,
// covering, pressing, holding a defensive line, tracking runners.
// ---------------------------------------------------------------------------

export function decideOffBall(world, p) {
  const team = world.teams[p.team];
  const tb = team.brain;
  const ball = world.ball;
  const dir = attackDir(p.team);
  const home = tb.homePosition(p, world);
  const carrier = world.carrier;
  const weHaveIt = world.possessionTeam === p.team;
  const ballDist = dist(p.x, p.z, ball.x, ball.z);

  let target = { x: home.x, z: home.z };
  let intensity = 0.42;
  let intent = 'shape';

  // ------------------------------------------------------------------
  // The ball has been played TO me: go and meet it. This overrides everything
  // -- a pass is worthless if the intended receiver keeps jogging to a shape
  // position while the ball rolls past them.
  // ------------------------------------------------------------------
  const ballIntent = ball.intent;
  if (ballIntent && (ballIntent.type === 'pass' || ballIntent.type === 'cross') &&
      ballIntent.to === p.id && ball.isLoose()) {
    const meet = interceptPoint(world, p, 2.6);
    if (meet) {
      return {
        target: { x: meet.x, z: meet.z },
        intensity: meet.urgency,
        intent: 'receive',
        faceBall: true,
      };
    }
  }

  // ------------------------------------------------------------------
  // Loose ball: whoever can genuinely get there first goes for it.
  // ------------------------------------------------------------------
  if (world.possessionTeam === -1 || (ball.isLoose() && ball.speed > 1.2)) {
    const contest = evaluateLooseBall(world, p);
    if (contest.go) {
      return {
        target: { x: contest.x, z: contest.z },
        intensity: contest.intensity,
        intent: 'chase',
        faceBall: true,
      };
    }
  }

  if (weHaveIt) {
    // ================= IN POSSESSION =================
    const support = attackingMovement(world, p, tb, carrier, home);
    target = support.target;
    intensity = support.intensity;
    intent = support.intent;
  } else {
    // ================= OUT OF POSSESSION =================
    const def = defensiveMovement(world, p, tb, carrier, home);
    target = def.target;
    intensity = def.intensity;
    intent = def.intent;
  }

  // Universal corrections -------------------------------------------------
  // Never stand exactly on a teammate.
  const sep = separationAdjust(world, p, target);
  target = sep;

  // Stay on the pitch.
  target.x = clamp(target.x, -PITCH.halfLength + 0.8, PITCH.halfLength - 0.8);
  target.z = clamp(target.z, -PITCH.halfWidth + 0.6, PITCH.halfWidth - 0.6);

  // Fatigue limits how hard you can actually run.
  const stamGate = p.stamina < 25 ? 0.72 : p.stamina < 45 ? 0.86 : 1;
  const workGate = 0.62 + (p.eff('workrate') / 99) * 0.42;
  intensity = clamp(intensity * stamGate * lerp(1, workGate, 0.55), 0, 1);

  return { target, intensity, intent, faceBall: ballDist < 26 };
}

// Earliest point along the ball's path this player can physically reach.
const _ip = { x: 0, y: 0, z: 0 };
function interceptPoint(world, p, horizon = 3.0) {
  const ball = world.ball;
  for (let t = 0.08; t <= horizon; t += 0.1) {
    ball.predict(t, _ip);
    if (Math.abs(_ip.x) > PITCH.halfLength + 1.5 || Math.abs(_ip.z) > PITCH.halfWidth + 1.5) break;
    if (_ip.y > 2.4) continue;
    const mine = timeToReach(p, _ip.x, _ip.z, 1);
    if (mine <= t + 0.05) {
      // Urgency: how tight is it? If we have slack, don't sprint flat out.
      const slack = t - mine;
      return { x: _ip.x, z: _ip.z, urgency: clamp(1.05 - slack * 0.55, 0.55, 1), t };
    }
  }
  // Can't get there in time -- chase where it will end up anyway.
  ball.predict(horizon, _ip);
  return { x: _ip.x, z: _ip.z, urgency: 1, t: horizon };
}

// --- Loose ball contest ----------------------------------------------------
function evaluateLooseBall(world, p) {
  const ball = world.ball;
  const pred = { x: 0, y: 0, z: 0 };
  let bestT = 99;
  let bx = ball.x;
  let bz = ball.z;
  // Find the earliest interception point for this player.
  for (let t = 0.1; t <= 3.2; t += 0.14) {
    ball.predict(t, pred);
    if (Math.abs(pred.x) > PITCH.halfLength + 2 || Math.abs(pred.z) > PITCH.halfWidth + 2) break;
    // Can only play a ball that's low enough (unless heading).
    const reachable = pred.y < 2.5;
    const mine = timeToReach(p, pred.x, pred.z, 1);
    if (mine <= t + 0.06 && reachable) { bestT = t; bx = pred.x; bz = pred.z; break; }
  }
  if (bestT > 3.1) {
    // Can't intercept in flight; head to where it will settle.
    ball.predict(2.6, pred);
    bx = pred.x; bz = pred.z;
    bestT = timeToReach(p, bx, bz, 1);
  }

  // Is anyone on my team closer? Only the best-placed 1-2 players commit.
  let rank = 0;
  const mates = world.teams[p.team].players;
  for (const m of mates) {
    if (m === p || !m.onPitch) continue;
    if (m.isGK) {
      // Keeper only comes for balls in their own area.
      const gx = ownGoalX(p.team);
      if (Math.abs(bx - gx) > 18) continue;
    }
    const t = timeToReach(m, bx, bz, 1);
    if (t < bestT - 0.03) rank++;
  }

  const distToBall = dist(p.x, p.z, bx, bz);
  if (rank === 0) {
    return { go: true, x: bx, z: bz, intensity: 1 };
  }
  if (rank === 1 && distToBall < 18) {
    // Second man: support rather than duplicate -- position for the second ball.
    const dir = attackDir(p.team);
    return {
      go: true,
      x: bx - dir * 4.5,
      z: bz + (p.z - bz) * 0.35,
      intensity: 0.82,
    };
  }
  return { go: false };
}

// --- In possession ---------------------------------------------------------
function attackingMovement(world, p, tb, carrier, home) {
  const dir = attackDir(p.team);
  const ball = world.ball;
  const e = tb.effTactics;
  const isCarrier = carrier === p;
  if (isCarrier) return { target: { x: p.x, z: p.z }, intensity: 0, intent: 'carry' };

  const distToBall = dist(p.x, p.z, ball.x, ball.z);
  const offLine = offsideLine(world, 1 - p.team);
  const b = p.brain;

  // How far forward should this player go? Role + mentality + score state.
  const attackingLicence = roleLicence(p, e, tb);

  // ---- Decide a movement archetype, and stick with it for a while so
  // ---- players commit to runs instead of flip-flopping every frame.
  b.runTimer -= world.dt;
  if (b.runTimer <= 0 || !b.runType) {
    b.runType = chooseRunType(world, p, tb, carrier, attackingLicence);
    b.runTimer = 0.5 + world.rng() * 1.1;
  }

  let target = { x: home.x, z: home.z };
  let intensity = 0.4;
  let intent = b.runType;

  switch (b.runType) {
    case 'run-behind': {
      // Sprint into the space behind the defensive line, staying onside until
      // the pass is played.
      const line = offLine;
      const targetX = clamp(line * dir + 1.2, -PITCH.halfLength * 0.2, PITCH.halfLength - 6) * 1;
      let tx = (line + dir * 1.0);
      // Aim for the channel between defenders.
      const gap = findDefensiveGap(world, p, tb);
      let tz = gap !== null ? gap : p.z * 0.8;
      // Timing: if the carrier isn't looking up / can't play it, hold the line.
      // The run is TIMED: you hold the shoulder of the last defender and only
      // break when the ball is actually on its way. Going early is offside.
      const ballPlayedThrough = ball.isLoose() && ball.vx * dir > 5 &&
        ball.intent && ball.intent.team === p.team;
      const carrierReady = carrier && carrier.controlTimer > 0.18 &&
                           pressureOn(world, carrier).value < 1.6;
      if (ballPlayedThrough) {
        // Ball is live and forward -- now we can go beyond.
        tx = line + dir * 9;
        intensity = 1;
      } else if (carrierReady) {
        // Coiled on the shoulder, ready to spring, but still onside.
        tx = line - dir * 0.5;
        intensity = 0.72;
      } else {
        tx = line - dir * 2.0;
        intensity = 0.5;
      }
      target = { x: tx, z: tz };
      break;
    }
    case 'overlap': {
      // Run outside and beyond the man in front of you.
      const ahead = findPlayerAhead(world, p);
      const wide = Math.sign(p.slotZ - 0.5) || (p.z >= 0 ? 1 : -1);
      const tz = clamp(wide * (PITCH.halfWidth - 2.5), -PITCH.halfWidth + 2, PITCH.halfWidth - 2);
      const baseX = ahead ? ahead.x : ball.x;
      target = { x: clamp(baseX + dir * 9, -PITCH.halfLength + 6, offLine + dir * 1.0), z: tz };
      intensity = 0.94;
      break;
    }
    case 'underlap': {
      const ahead = findPlayerAhead(world, p);
      const inside = -(Math.sign(p.slotZ - 0.5) || 1);
      const baseX = ahead ? ahead.x : ball.x;
      target = {
        x: clamp(baseX + dir * 7, -PITCH.halfLength + 6, offLine + dir * 0.5),
        z: clamp(p.z + inside * 9, -PITCH.halfWidth + 4, PITCH.halfWidth - 4),
      };
      intensity = 0.9;
      break;
    }
    case 'support': {
      // Offer a clean passing angle to the carrier: not too close, not in the
      // shadow of a defender.
      const pt = bestSupportPoint(world, p, carrier, home, tb);
      target = pt;
      intensity = distToBall > 22 ? 0.7 : 0.55;
      break;
    }
    case 'width': {
      const side = Math.sign(p.slotZ - 0.5) || (p.z >= 0 ? 1 : -1);
      target = {
        x: clamp(home.x + dir * 2, -PITCH.halfLength + 4, offLine + dir * 0.5),
        z: side * (PITCH.halfWidth - 1.8 - (1 - e.width) * 8),
      };
      intensity = 0.6;
      break;
    }
    case 'box': {
      // Attack the penalty area for a cross / cutback.
      const gx = goalX(p.team);
      const spot = pickBoxPosition(world, p, tb);
      target = spot;
      intensity = 0.95;
      break;
    }
    case 'recycle': {
      // Deep option behind the ball for switching / restarting the attack.
      target = {
        x: clamp(ball.x - dir * 11, -PITCH.halfLength + 8, PITCH.halfLength - 8),
        z: clamp(home.z * 0.7 + (tb.freeSpaceZ ?? 0) * 0.3, -PITCH.halfWidth + 3, PITCH.halfWidth - 3),
      };
      intensity = 0.55;
      break;
    }
    case 'hold-shape':
    default: {
      // Stay in position; a defender when we attack still has to think about
      // the counterattack.
      const restDefence = clamp(1 - attackingLicence, 0, 1);
      target = {
        x: home.x - dir * restDefence * 3.5,
        z: home.z,
      };
      intensity = 0.38 + (1 - restDefence) * 0.2;
      break;
    }
  }

  // ---- Offside discipline ----
  // Attackers hold the last line. Good players hold it tightly; poor ones
  // stray. Even a timed run must start from an onside position -- the run only
  // breaks the line once the ball is actually travelling.
  const discipline = clamp((p.eff('positioning') * 0.5 + p.eff('teamwork') * 0.3 +
                            p.eff('decisions') * 0.2) / 99, 0.2, 1);
  // Safety margin: disciplined players stay further behind the line.
  const margin = lerp(0.15, 1.4, discipline);
  const ballTravellingForward = !ball.isLoose() ? false
    : (ball.vx * dir > 4 && ball.intent && ball.intent.team === p.team);

  if (!ballTravellingForward) {
    const limit = offLine - dir * margin;
    if (target.x * dir > limit * dir && limit * dir > 0) {
      target.x = limit;
    }
    // If we're already caught offside, get back onside urgently.
    if (isOffsidePosition(world, p, ball.x)) {
      target.x = offLine - dir * (margin + 0.8);
      intensity = Math.max(intensity, 0.8);
    }
  }

  return { target, intensity, intent };
}

function roleLicence(p, e, tb) {
  let base;
  switch (p.unit) {
    case 'attack': base = 0.92; break;
    case 'midfield': base = 0.58; break;
    case 'defence': base = 0.24; break;
    default: base = 0.05;
  }
  if (p.role === 'attacking-fb' || p.role === 'wingback') base += 0.32;
  if (p.role === 'box-to-box') base += 0.16;
  if (p.role === 'anchor' || p.role === 'holding') base -= 0.20;
  if (p.role === 'sweeper' || p.role === 'cover') base -= 0.10;
  base += (e.mentality - 0.5) * 0.5;
  base += tb.urgency * 0.18;
  base *= 0.7 + (p.eff('workrate') / 99) * 0.5;
  return clamp(base, 0, 1.25);
}

function chooseRunType(world, p, tb, carrier, licence) {
  const dir = attackDir(p.team);
  const ball = world.ball;
  const e = tb.effTactics;
  const ballAdvanced = ball.x * dir;
  const rng = world.rng;
  const inFinalThird = ballAdvanced > PITCH.halfLength * 0.32;
  const wide = Math.abs(p.slotZ - 0.5) > 0.24;
  const ballWide = Math.abs(ball.z) > 18;
  const iAmAhead = p.x * dir > ball.x * dir;

  // Weighted options -- weights come from role, tactics and live geometry.
  const w = {
    'hold-shape': 0.6,
    support: 1.0,
    width: 0.35,
    recycle: 0.3,
    'run-behind': 0,
    overlap: 0,
    underlap: 0,
    box: 0,
  };

  if (p.unit === 'defence') {
    w['hold-shape'] = 2.2 - licence * 1.2;
    w.support = 0.9 + licence * 0.4;
    w.recycle = 0.9;
    if ((p.role === 'attacking-fb' || p.role === 'wingback') && ballAdvanced > -6) {
      w.overlap = 1.1 + licence * 1.4 + (ballWide && Math.sign(ball.z) === Math.sign(p.z) ? 1.2 : 0);
      w.width = 1.0;
    }
    if (tb.phase === TEAM_PHASE.ATTACK_FINAL && (p.role === 'attacking-fb' || p.role === 'wingback')) {
      w.overlap += 0.8;
    }
  } else if (p.unit === 'midfield') {
    w.support = 2.0;
    w['hold-shape'] = 1.0;
    w.recycle = 0.8;
    if (licence > 0.5 && inFinalThird) {
      w.box = 0.8 + licence * 1.2;
      w['run-behind'] = 0.5 + licence * 0.8;
      w.underlap = 0.7;
    }
    if (p.role === 'anchor' || p.role === 'holding') { w['hold-shape'] += 1.6; w.box = 0; w['run-behind'] = 0; }
    if (p.role === 'playmaker') w.support += 1.0;
  } else if (p.unit === 'attack') {
    w.support = 1.1;
    w['run-behind'] = 1.6 + (p.eff('pace') / 99) * 1.2 + e.directness * 1.2;
    w.width = wide ? 1.4 : 0.4;
    w.box = ballWide && inFinalThird ? 2.4 : 0.6;
    w.underlap = wide ? 0.8 : 0.3;
    w['hold-shape'] = 0.3;
    if (p.role === 'target-man') { w.support += 1.1; w['run-behind'] *= 0.6; }
    if (p.role === 'poacher') { w['run-behind'] += 0.9; w.box += 0.9; }
    if (p.role === 'inside-forward') { w.underlap += 0.9; w.box += 0.5; }
  }

  // Counter-attack: everyone who can, goes.
  if (tb.phase === TEAM_PHASE.COUNTER) {
    w['run-behind'] += 1.8 * licence + e.counter * 1.2;
    w.support += 0.8;
    w['hold-shape'] *= 0.55;
    w.recycle *= 0.4;
  }
  if (tb.phase === TEAM_PHASE.ATTACK_BUILD) {
    w.recycle += 1.0;
    w.support += 0.7;
    w.box = 0;
    w['run-behind'] *= 0.45;
  }
  // A cross is imminent -> get bodies in the box.
  if (inFinalThird && ballWide && p.unit !== 'defence') {
    w.box += 1.3;
  }
  // Tactical intelligence: smarter players choose the *right* run more often.
  const iq = p.eff('positioning') * 0.5 + p.eff('decisions') * 0.3 + p.eff('teamwork') * 0.2;
  const smart = clamp(iq / 99, 0.2, 1);

  // Sample.
  const keys = Object.keys(w);
  let total = 0;
  const adj = {};
  for (const k of keys) {
    // Low-IQ players flatten the distribution (more wrong choices).
    adj[k] = Math.pow(Math.max(0.0001, w[k]), 0.6 + smart * 1.5);
    total += adj[k];
  }
  let r = rng() * total;
  for (const k of keys) {
    r -= adj[k];
    if (r <= 0) return k;
  }
  return 'support';
}

// A good support position: reachable pass, decent angle, in space, progressive.
function bestSupportPoint(world, p, carrier, home, tb) {
  const dir = attackDir(p.team);
  const ball = world.ball;
  const cx = carrier ? carrier.x : ball.x;
  const cz = carrier ? carrier.z : ball.z;
  let best = { x: home.x, z: home.z };
  let bestScore = -Infinity;
  // Sample points around the player's zone.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (const r of [4.5, 9, 14]) {
      const tx = home.x + Math.cos(a) * r;
      const tz = home.z + Math.sin(a) * r;
      if (Math.abs(tx) > PITCH.halfLength - 2 || Math.abs(tz) > PITCH.halfWidth - 1) continue;
      const d = dist(tx, tz, cx, cz);
      if (d < 5 || d > 34) continue;
      const sp = spaceAt(world, tx, tz, p.team, 9);
      const risk = laneRisk(world, cx, cz, tx, tz, p.team, 17);
      const th = threatValue(tx, tz, p.team);
      const homeCost = dist(tx, tz, home.x, home.z) / 22;
      const travel = dist(p.x, p.z, tx, tz) / 24;
      const score = sp * 1.2 + (1 - risk) * 1.5 + th * 1.1 - homeCost * 0.8 - travel * 0.35;
      if (score > bestScore) { bestScore = score; best = { x: tx, z: tz }; }
    }
  }
  return best;
}

// Find the biggest gap between opposition defenders to run into.
function findDefensiveGap(world, p, tb) {
  const opps = world.teams[1 - p.team].players
    .filter(o => o.onPitch && !o.isGK && o.unit === 'defence')
    .sort((a, b) => a.z - b.z);
  if (opps.length < 2) return null;
  let bestGap = 0;
  let bestZ = null;
  for (let i = 0; i < opps.length - 1; i++) {
    const gap = opps[i + 1].z - opps[i].z;
    const mid = (opps[i].z + opps[i + 1].z) / 2;
    // Prefer gaps near where the player already is.
    const score = gap - Math.abs(mid - p.z) * 0.25;
    if (score > bestGap) { bestGap = score; bestZ = mid; }
  }
  // Also consider going round the outside.
  const outsideL = opps[0].z - 6;
  const outsideR = opps[opps.length - 1].z + 6;
  for (const oz of [outsideL, outsideR]) {
    if (Math.abs(oz) > PITCH.halfWidth - 3) continue;
    const score = 7 - Math.abs(oz - p.z) * 0.25;
    if (score > bestGap) { bestGap = score; bestZ = oz; }
  }
  return bestZ;
}

function findPlayerAhead(world, p) {
  const dir = attackDir(p.team);
  let best = null;
  let bestD = 99;
  for (const m of world.teams[p.team].players) {
    if (m === p || !m.onPitch) continue;
    if (m.x * dir <= p.x * dir) continue;
    if (Math.abs(m.z - p.z) > 15) continue;
    const d = dist(p.x, p.z, m.x, m.z);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

// Pick a box position: near post, penalty spot, far post, cutback zone.
function pickBoxPosition(world, p, tb) {
  const dir = attackDir(p.team);
  const gx = goalX(p.team);
  const ball = world.ball;
  const ballSide = Math.sign(ball.z) || 1;
  const spots = [
    { x: gx - dir * 5.5, z: ballSide * 3.2, name: 'near' },
    { x: gx - dir * 10.5, z: 0, name: 'spot' },
    { x: gx - dir * 8.0, z: -ballSide * 5.5, name: 'far' },
    { x: gx - dir * 15.5, z: -ballSide * 2.0, name: 'cutback' },
    { x: gx - dir * 19.0, z: 0, name: 'edge' },
  ];
  let best = spots[1];
  let bestScore = -Infinity;
  for (const s of spots) {
    const sp = spaceAt(world, s.x, s.z, p.team, 7);
    const travel = dist(p.x, p.z, s.x, s.z);
    // Don't have two players attacking the same spot.
    let taken = 0;
    for (const m of world.teams[p.team].players) {
      if (m === p || !m.onPitch) continue;
      if (dist(m.x, m.z, s.x, s.z) < 4.5) taken++;
    }
    const heightBonus = s.name === 'far' ? (p.eff('heading') / 99) * 0.5 : 0;
    const poachBonus = s.name === 'near' ? (p.eff('positioning') / 99) * 0.4 : 0;
    const edgeBonus = s.name === 'edge' ? (p.eff('shooting') / 99) * 0.35 + (p.unit === 'midfield' ? 0.5 : 0) : 0;
    const score = sp * 1.4 - travel / 26 - taken * 1.1 + heightBonus + poachBonus + edgeBonus;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return { x: best.x, z: best.z };
}

// --- Out of possession -----------------------------------------------------
function defensiveMovement(world, p, tb, carrier, home) {
  const dir = attackDir(p.team);
  const ball = world.ball;
  const e = tb.effTactics;

  // 1) Am I the designated presser?
  if (p.id === tb.presserId && tb.pressTrigger > 0.28) {
    const t = pressTarget(world, p, carrier || null);
    return { target: t, intensity: clamp(0.72 + tb.pressTrigger * 0.4, 0, 1), intent: 'press' };
  }
  // 2) Second presser: cut the nearest passing option / support the press.
  if (p.id === tb.secondPresserId) {
    const cover = coverPresser(world, p, carrier, tb);
    return { target: cover, intensity: 0.82, intent: 'press-support' };
  }

  // 3) Do I have a marking assignment?
  let markId = -1;
  for (const [oppId, myId] of tb.markAssignments) {
    if (myId === p.id) { markId = oppId; break; }
  }
  if (markId !== -1) {
    const opp = world.playersById.get(markId);
    if (opp && opp.onPitch) {
      const t = markPosition(world, p, opp, tb);
      const urgency = dist(p.x, p.z, opp.x, opp.z) > 4 ? 0.85 : 0.55;
      // Tight marking near our goal, looser further out.
      const dangerScale = smoothstep(50, 16, dist(opp.x, opp.z, ownGoalX(p.team), 0));
      return { target: t, intensity: clamp(urgency + dangerScale * 0.2, 0, 1), intent: 'mark' };
    }
  }

  // 4) Hold the defensive line / zone, shifted ball-side.
  const zone = zonalPosition(world, p, tb, home);
  const distFromZone = dist(p.x, p.z, zone.x, zone.z);
  let intensity = clamp(0.32 + distFromZone / 22, 0.3, 1);
  if (tb.phase === TEAM_PHASE.DEFEND_RECOVER) intensity = clamp(intensity + 0.35, 0, 1);
  if (tb.phase === TEAM_PHASE.TRANSITION_LOST) intensity = clamp(intensity + 0.28, 0, 1);
  return { target: zone, intensity, intent: 'zone' };
}

function pressTarget(world, p, carrier) {
  const ball = world.ball;
  const dir = attackDir(p.team);
  if (!carrier) {
    return { x: ball.x, z: ball.z };
  }
  // Approach on a curve that shows the carrier away from goal / onto their weak
  // foot, and arrive slightly goal-side rather than diving in flat.
  const gx = ownGoalX(p.team);
  const toGoalX = gx - carrier.x;
  const toGoalZ = 0 - carrier.z;
  const [ngx, ngz] = normalise(toGoalX, toGoalZ);
  const d = dist(p.x, p.z, carrier.x, carrier.z);
  // Standoff distance shrinks as we get closer and as aggression rises.
  const aggression = p.eff('aggression') / 99;
  const standoff = clamp(1.35 - aggression * 0.5, 0.7, 1.6);
  // Show them wide: bias the approach point toward the touchline side.
  const sideBias = Math.sign(carrier.z) || 1;
  const showWide = clamp((1 - aggression) * 0.9, 0.15, 0.9);
  const tx = carrier.x + ngx * standoff + carrier.vx * 0.16;
  const tz = carrier.z + ngz * standoff - sideBias * showWide * 0.55 + carrier.vz * 0.16;
  return { x: tx, z: tz };
}

function coverPresser(world, p, carrier, tb) {
  const ball = world.ball;
  if (!carrier) return { x: ball.x, z: ball.z };
  // Cut off the most dangerous forward pass from the carrier.
  const opps = world.teams[1 - p.team].players;
  let bestOpt = null;
  let bestVal = -Infinity;
  const dir = attackDir(carrier.team);
  for (const o of opps) {
    if (o === carrier || !o.onPitch || o.isGK) continue;
    const d = dist(carrier.x, carrier.z, o.x, o.z);
    if (d > 34 || d < 3) continue;
    const th = threatValue(o.x, o.z, carrier.team);
    const risk = laneRisk(world, carrier.x, carrier.z, o.x, o.z, carrier.team, 17);
    const val = th * 2 + (1 - risk) - dist(p.x, p.z, o.x, o.z) / 30;
    if (val > bestVal) { bestVal = val; bestOpt = o; }
  }
  if (!bestOpt) return { x: ball.x - dir * 4, z: ball.z };
  // Stand in the lane, closer to the receiver so we can step out and intercept.
  const t = 0.62;
  return {
    x: carrier.x + (bestOpt.x - carrier.x) * t,
    z: carrier.z + (bestOpt.z - carrier.z) * t,
  };
}

function markPosition(world, p, opp, tb) {
  const dir = attackDir(p.team);
  const gx = ownGoalX(p.team);
  const ball = world.ball;
  // Goal-side and ball-side: the classic defensive position.
  const [tgx, tgz] = normalise(gx - opp.x, 0 - opp.z);
  const [tbx, tbz] = normalise(ball.x - opp.x, ball.z - opp.z);
  // Tightness depends on marking ability, danger and distance from goal.
  const danger = smoothstep(55, 12, dist(opp.x, opp.z, gx, 0));
  const tight = lerp(2.8, 1.05, (p.eff('marking') / 99) * 0.6 + danger * 0.4);
  // Blend goal-side with ball-side so we can also intercept.
  const gw = 0.62;
  const bw = 0.38;
  let tx = opp.x + (tgx * gw + tbx * bw) * tight;
  let tz = opp.z + (tgz * gw + tbz * bw) * tight;
  // Anticipate their run.
  tx += opp.vx * 0.28;
  tz += opp.vz * 0.28;
  // Never let the man get in behind: cap our position at the offside line when
  // holding a high line.
  return { x: tx, z: tz };
}

function zonalPosition(world, p, tb, home) {
  const dir = attackDir(p.team);
  const ball = world.ball;
  let tx = home.x;
  let tz = home.z;

  // Defenders hold a coordinated line.
  if (p.unit === 'defence' && !p.isGK) {
    const lineX = tb.blockX;
    tx = lineX + (p.slotX - 0.17) * 12 * dir;
    // Slide across as a unit, but keep the shape spread.
    const spread = (p.slotZ - 0.5) * 2 * (PITCH.halfWidth - 3) * (0.60 + tb.effTactics.width * 0.2);
    tz = spread * 0.72 + ball.z * (0.34 + tb.effTactics.compactness * 0.14);
    // The far-side defender tucks in to cover.
    if (Math.sign(tz) !== Math.sign(ball.z) && Math.abs(ball.z) > 14) {
      tz *= 0.55;
    }
    // Cover behind the ball-side defender (depth stagger).
    const ballSide = Math.sign(ball.z) || 1;
    const isFarSide = Math.sign(p.slotZ - 0.5) !== ballSide;
    if (isFarSide) tx -= dir * 2.2;
  } else if (p.unit === 'midfield') {
    // Screen the space in front of the defence, shift toward the ball.
    tx = tb.blockX + dir * (9 + (p.slotX - 0.36) * 22);
    const spread = (p.slotZ - 0.5) * 2 * (PITCH.halfWidth - 6) * (0.55 + tb.effTactics.width * 0.25);
    tz = spread * 0.7 + ball.z * (0.4 + tb.effTactics.compactness * 0.16);
  } else if (p.unit === 'attack') {
    // Forwards screen passing lanes into the opposition midfield and stay high
    // enough to be an outlet (unless we're desperately defending).
    const outletBias = 1 - tb.effTactics.pressing * 0.35;
    tx = tb.blockX + dir * (26 + (p.slotX - 0.74) * 26) * outletBias;
    const spread = (p.slotZ - 0.5) * 2 * (PITCH.halfWidth - 8) * (0.5 + tb.effTactics.width * 0.3);
    tz = spread * 0.75 + ball.z * 0.30;
    // When the opponent is building from the back, cut the lane to their pivot.
    if (tb.phase === TEAM_PHASE.DEFEND_PRESS) {
      const pivot = findOppPivot(world, p.team);
      if (pivot) {
        tz = lerp(tz, pivot.z, 0.35);
        tx = lerp(tx, pivot.x - dir * -2.5, 0.25);
      }
    }
  }

  // Never let the defensive line drift behind the goal line.
  const maxDepth = -dir * (PITCH.halfLength - 5.5);
  if (tx * dir < maxDepth * dir) tx = maxDepth;
  return { x: tx, z: tz };
}

function findOppPivot(world, team) {
  const opps = world.teams[1 - team].players;
  let best = null;
  let bestX = -999;
  const dir = attackDir(1 - team);
  for (const o of opps) {
    if (!o.onPitch || o.isGK || o.unit !== 'midfield') continue;
    const v = -o.x * dir; // deepest midfielder
    if (v > bestX) { bestX = v; best = o; }
  }
  return best;
}

// Avoid stacking on top of teammates.
function separationAdjust(world, p, target) {
  const mates = world.teams[p.team].players;
  let ax = 0;
  let az = 0;
  for (const m of mates) {
    if (m === p || !m.onPitch || m.isGK) continue;
    const d = dist(target.x, target.z, m.targetX, m.targetZ);
    if (d < 5.2 && d > 0.01) {
      const push = (5.2 - d) / 5.2;
      // Lower shirt number yields (deterministic tie-break).
      const yield_ = p.id > m.id ? 1 : 0.35;
      ax += ((target.x - m.targetX) / d) * push * 3.2 * yield_;
      az += ((target.z - m.targetZ) / d) * push * 3.2 * yield_;
    }
  }
  return { x: target.x + ax, z: target.z + az };
}

export { evaluateLooseBall, pressTarget };
