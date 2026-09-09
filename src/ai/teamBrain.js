import { PITCH, PHASE } from '../sim/constants.js';
import { clamp, dist, lerp, smoothstep } from '../sim/math.js';
import { attackDir, offsideLine, timeToReach, threatValue, spaceAt } from '../sim/analysis.js';
import { FORMATIONS } from '../sim/formations.js';

// ---------------------------------------------------------------------------
// TEAM BRAIN -- the top layer of the AI hierarchy.
//
// Once per tick (throttled) each team evaluates the global match situation and
// produces a *team plan*: phase of play, where the block sits, who presses,
// who marks whom, where the overloads are.  Individual players then solve
// their own local problem inside that plan.  Nothing here is scripted to a
// particular scenario -- it's all derived from live geometry, so the same
// tactics produce different football every match.
// ---------------------------------------------------------------------------

export const TEAM_PHASE = {
  ATTACK_BUILD: 'build',
  ATTACK_PROGRESS: 'progress',
  ATTACK_FINAL: 'final',
  COUNTER: 'counter',
  DEFEND_PRESS: 'press',
  DEFEND_BLOCK: 'block',
  DEFEND_RECOVER: 'recover',
  TRANSITION_LOST: 'lost',
  TRANSITION_WON: 'won',
  SET_PIECE: 'setpiece',
};

export class TeamBrain {
  constructor(team, tactics, rng) {
    this.team = team;
    this.tactics = tactics;
    this.rng = rng;
    this.phase = TEAM_PHASE.DEFEND_BLOCK;
    this.prevPhase = this.phase;
    this.phaseTimer = 0;
    this.transitionTimer = 0;
    this.hasPossession = false;
    this.blockX = 0;              // world X of the defensive line
    this.blockCentreZ = 0;
    this.compression = 1;
    this.pressTrigger = 0;        // 0..1 how aggressively we press right now
    this.presserId = -1;
    this.secondPresserId = -1;
    this.coverIds = [];
    this.markAssignments = new Map(); // opponentId -> playerId
    this.overloadSide = 0;        // -1 left, 0 centre, +1 right (own view)
    this.attackSide = 0;
    this.targetMan = -1;
    this.urgency = 0.5;           // score/time driven
    this.riskAppetite = 0.5;
    this.lineHeight = 0.5;
    this.effTactics = { ...tactics };
    this.think = 0;
    this.lastSwitchTime = -99;
    this.buildUpSide = rng.chance(0.5) ? -1 : 1;
    this.chanceQuality = 0;
    this.pressResetTimer = 0;
    this.counterWindow = 0;
  }

  get formation() { return FORMATIONS[this.effTactics.formation] || FORMATIONS['4-3-3']; }

  // ---- Situational tactic adaptation ------------------------------------
  // Score, time and momentum genuinely change how the team plays.
  adapt(world) {
    const t = this.tactics;
    const e = this.effTactics;
    for (const k in t) e[k] = t[k];

    const myScore = world.score[this.team];
    const oppScore = world.score[1 - this.team];
    const diff = myScore - oppScore;
    const minsLeft = Math.max(0, (world.totalMatchSeconds - world.matchSeconds) / 60);
    const late = smoothstep(25, 4, minsLeft); // 0 early, 1 very late

    // Chasing a game late -> push everything forward.
    if (diff < 0) {
      const desperation = clamp((-diff) * 0.35, 0, 1) * late;
      e.mentality = clamp(t.mentality + 0.22 * late + desperation * 0.3, 0, 1);
      e.defensiveLine = clamp(t.defensiveLine + 0.18 * late + desperation * 0.22, 0, 1);
      e.pressing = clamp(t.pressing + 0.2 * late + desperation * 0.25, 0, 1);
      e.tempo = clamp(t.tempo + 0.18 * late, 0, 1);
      e.directness = clamp(t.directness + 0.28 * desperation, 0, 1);
      this.urgency = clamp(0.5 + 0.5 * late + desperation * 0.4, 0, 1.3);
      this.riskAppetite = clamp(0.5 + 0.45 * late + desperation * 0.3, 0, 1.2);
    } else if (diff > 0) {
      // Protecting a lead late -> drop off, slow down, stay compact.
      const comfort = clamp(diff * 0.3, 0, 0.8) * late;
      e.mentality = clamp(t.mentality - 0.2 * late - comfort * 0.2, 0, 1);
      e.defensiveLine = clamp(t.defensiveLine - 0.16 * late - comfort * 0.18, 0, 1);
      e.pressing = clamp(t.pressing - 0.12 * late, 0, 1);
      e.tempo = clamp(t.tempo - 0.2 * late, 0, 1);
      e.compactness = clamp(t.compactness + 0.2 * late, 0, 1);
      this.urgency = clamp(0.5 - 0.25 * late, 0.1, 1);
      this.riskAppetite = clamp(0.45 - 0.25 * late, 0.08, 1);
    } else {
      this.urgency = clamp(0.5 + 0.28 * late, 0, 1);
      this.riskAppetite = clamp(0.5 + 0.12 * late, 0, 1);
    }

    // Fatigue: a knackered team cannot press as hard however much you shout.
    const outfield = world.teams[this.team].players.filter(p => p.onPitch && !p.isGK);
    let avgStam = 0;
    for (const p of outfield) avgStam += p.stamina;
    avgStam /= Math.max(1, outfield.length);
    const fatigue = clamp((70 - avgStam) / 60, 0, 1);
    e.pressing = clamp(e.pressing * (1 - fatigue * 0.45), 0.05, 1);
    e.tempo = clamp(e.tempo * (1 - fatigue * 0.2), 0.1, 1);

    // Playing with 10 men -> sit deeper, narrower.
    const n = outfield.length;
    if (n < 10) {
      const short = 10 - n;
      e.mentality = clamp(e.mentality - 0.18 * short, 0, 1);
      e.defensiveLine = clamp(e.defensiveLine - 0.15 * short, 0, 1);
      e.pressing = clamp(e.pressing - 0.18 * short, 0.05, 1);
      e.compactness = clamp(e.compactness + 0.15 * short, 0, 1);
    }
    this.fatigue = fatigue;
  }

  update(world, dt) {
    this.phaseTimer += dt;
    this.transitionTimer = Math.max(0, this.transitionTimer - dt);
    this.counterWindow = Math.max(0, this.counterWindow - dt);
    this.think -= dt;
    if (this.think > 0) return;
    this.think = 0.09;

    this.adapt(world);
    this.evaluatePhase(world);
    this.computeBlock(world);
    this.assignPressing(world);
    this.assignMarking(world);
    this.evaluateOverloads(world);
  }

  evaluatePhase(world) {
    const ball = world.ball;
    const dir = attackDir(this.team);
    const inControl = world.possessionTeam === this.team;
    const prevPoss = this.hasPossession;
    this.hasPossession = inControl;

    if (prevPoss !== inControl) {
      this.transitionTimer = inControl ? 3.4 : 4.2;
      if (inControl) this.counterWindow = 4.5;
    }

    const bx = ball.x * dir; // -52 own goal .. +52 opponent goal
    let phase;
    if (world.phase !== PHASE.OPEN_PLAY && world.phase !== PHASE.KICKOFF) {
      phase = TEAM_PHASE.SET_PIECE;
    } else if (inControl) {
      if (this.transitionTimer > 2.0 && this.counterWindow > 0 &&
          this.effTactics.counter > 0.35 && bx < 22) {
        phase = TEAM_PHASE.COUNTER;
      } else if (bx < -14) phase = TEAM_PHASE.ATTACK_BUILD;
      else if (bx < 24) phase = TEAM_PHASE.ATTACK_PROGRESS;
      else phase = TEAM_PHASE.ATTACK_FINAL;
    } else {
      const contested = world.possessionTeam === -1;
      if (this.transitionTimer > 2.6 && !contested) {
        phase = TEAM_PHASE.TRANSITION_LOST;
      } else {
        // Do we press or drop?  Depends on instruction, where the ball is, how
        // organised we are, and whether pressing can actually work here.
        const pressWorth = this.evaluatePressOpportunity(world);
        phase = pressWorth > 0.45 ? TEAM_PHASE.DEFEND_PRESS : TEAM_PHASE.DEFEND_BLOCK;
        // If most of the team is upfield of the ball, we're recovering.
        const players = world.teams[this.team].players.filter(p => p.onPitch && !p.isGK);
        let behind = 0;
        for (const p of players) if (p.x * dir > ball.x * dir + 1) behind++;
        if (behind > players.length * 0.62 && bx > -6) phase = TEAM_PHASE.DEFEND_RECOVER;
      }
    }

    if (phase !== this.phase) {
      this.prevPhase = this.phase;
      this.phase = phase;
      this.phaseTimer = 0;
    }
  }

  // Pressing is only worth it if we can actually get numbers to the ball
  // before the opponent can play out of it.
  evaluatePressOpportunity(world) {
    const ball = world.ball;
    const dir = attackDir(this.team);
    const carrier = world.carrier;
    const base = this.effTactics.pressing;
    if (!carrier) return base * 0.6;

    // Count our players who can reach the ball quickly.
    const mine = world.teams[this.team].players;
    let close = 0;
    let nearestT = 99;
    for (const p of mine) {
      if (!p.onPitch || p.isGK) continue;
      const t = timeToReach(p, ball.x, ball.z, 1);
      if (t < 1.6) close++;
      if (t < nearestT) nearestT = t;
    }
    // Their support around the ball.
    const theirs = world.teams[1 - this.team].players;
    let theirSupport = 0;
    for (const p of theirs) {
      if (!p.onPitch || p.isGK || p === carrier) continue;
      if (dist(p.x, p.z, ball.x, ball.z) < 14) theirSupport++;
    }

    const numeric = clamp((close - theirSupport * 0.7 + 1) / 3, 0, 1);
    // Pressing high up the pitch is more valuable (higher turnover value).
    const zoneValue = smoothstep(-40, 30, ball.x * dir) * 0.5 + 0.5;
    // Carrier under pressure / facing own goal / poor technique = trigger.
    const facingOwn = Math.cos(carrier.facing) * dir < -0.2 ? 0.3 : 0;
    const weakCarrier = clamp((70 - carrier.eff('technique')) / 60, 0, 1) * 0.25;
    const looseTouch = ball.isLoose() && ball.speed > 3 ? 0.25 : 0;
    const speedBonus = clamp((1.2 - nearestT) * 0.4, -0.2, 0.4);

    return clamp(base * (0.5 + numeric * 0.7) * zoneValue + facingOwn + weakCarrier + looseTouch + speedBonus, 0, 1.4);
  }

  // Where does the defensive block sit and how compressed is it?
  computeBlock(world) {
    const ball = world.ball;
    const dir = attackDir(this.team);
    const e = this.effTactics;
    const L = PITCH.halfLength;

    // Base line height from instruction.
    let lineDepth; // normalised 0 (own goal) .. 1 (opponent goal)
    if (this.hasPossession) {
      lineDepth = 0.32 + e.mentality * 0.30 + e.defensiveLine * 0.16;
      // Push up behind the ball when we have it.
      const ballNorm = (ball.x * dir + L) / (2 * L);
      lineDepth = Math.max(lineDepth, ballNorm - 0.30);
    } else {
      lineDepth = 0.14 + e.defensiveLine * 0.42;
      const ballNorm = (ball.x * dir + L) / (2 * L);
      // The line tracks the ball but never further upfield than ball - small gap
      lineDepth = clamp(Math.min(lineDepth, ballNorm - 0.02), 0.045, 0.86);
      if (this.phase === TEAM_PHASE.DEFEND_PRESS) lineDepth = clamp(lineDepth + 0.10, 0, 0.9);
      if (this.phase === TEAM_PHASE.DEFEND_RECOVER) lineDepth = clamp(lineDepth - 0.06, 0.04, 0.9);
    }
    this.lineHeight = lineDepth;
    this.blockX = (lineDepth * 2 - 1) * L * dir;
    // Block shifts laterally toward the ball (ball-side compactness).
    const shift = this.hasPossession ? 0.24 : 0.5 + e.compactness * 0.24;
    this.blockCentreZ = ball.z * shift;
    this.compression = this.hasPossession
      ? lerp(1.0, 0.86, e.compactness)
      : lerp(0.85, 0.52, e.compactness);
  }

  // Choose the presser (first defender), second presser and cover players.
  assignPressing(world) {
    const ball = world.ball;
    const carrier = world.carrier;
    const mine = world.teams[this.team].players.filter(p => p.onPitch && !p.isGK);
    this.pressTrigger = this.hasPossession ? 0 : this.evaluatePressOpportunity(world);

    if (this.hasPossession && world.possessionTeam === this.team) {
      this.presserId = -1;
      this.secondPresserId = -1;
      return;
    }

    // Rank by time-to-ball, but bias toward players whose *role* makes pressing
    // sensible (don't send the last centre-back to the halfway line).
    const targetX = carrier ? carrier.x : ball.x;
    const targetZ = carrier ? carrier.z : ball.z;
    let best = null;
    let bestCost = Infinity;
    let second = null;
    let secondCost = Infinity;
    const dir = attackDir(this.team);
    for (const p of mine) {
      let t = timeToReach(p, targetX, targetZ, 1);
      // Don't pull the deepest defender out unless nobody else can go.
      const isLastLine = p.unit === 'defence';
      const upfieldPenalty = isLastLine
        ? clamp((targetX * dir - p.x * dir) * 0.09, 0, 2.6)
        : 0;
      // Workrate/aggression makes some players naturally jump.
      const desire = (p.eff('workrate') + p.eff('aggression')) / 200;
      const cost = t + upfieldPenalty - desire * 0.35;
      if (cost < bestCost) {
        secondCost = bestCost; second = best;
        bestCost = cost; best = p;
      } else if (cost < secondCost) {
        secondCost = cost; second = p;
      }
    }
    this.presserId = best ? best.id : -1;
    // Only commit a second presser if we're pressing hard, otherwise cover.
    this.secondPresserId = (second && this.pressTrigger > 0.55) ? second.id : -1;
  }

  // Man-marking assignments for dangerous opponents inside our block.
  assignMarking(world) {
    this.markAssignments.clear();
    if (this.hasPossession) return;
    const dir = attackDir(this.team);
    const opps = world.teams[1 - this.team].players
      .filter(p => p.onPitch && !p.isGK && p.x * dir < 15);
    const mine = world.teams[this.team].players
      .filter(p => p.onPitch && !p.isGK && p.id !== this.presserId);
    if (!opps.length || !mine.length) return;

    // Rank opponents by danger (threat of their position + how free they are).
    const threats = opps.map(o => ({
      o,
      danger: threatValue(o.x, o.z, 1 - this.team) * 1.4 +
              spaceAt(world, o.x, o.z, 1 - this.team, 8) * 0.5 +
              (o.unit === 'attack' ? 0.3 : 0),
    })).sort((a, b) => b.danger - a.danger);

    const used = new Set();
    const limit = Math.min(threats.length, mine.length);
    for (let i = 0; i < limit; i++) {
      const o = threats[i].o;
      let bestP = null;
      let bestCost = Infinity;
      for (const p of mine) {
        if (used.has(p.id)) continue;
        const d = dist(p.x, p.z, o.x, o.z);
        // Prefer the player whose zone the opponent is in, and who is goal-side.
        const goalSide = (p.x * dir < o.x * dir) ? 0 : 2.2;
        const unitMatch = unitAffinity(p, o);
        const cost = d + goalSide + unitMatch - p.eff('marking') * 0.02;
        if (cost < bestCost) { bestCost = cost; bestP = p; }
      }
      if (bestP && bestCost < 26) {
        this.markAssignments.set(o.id, bestP.id);
        used.add(bestP.id);
      }
    }
  }

  // Where is the numerical advantage? Drives switches of play and overloads.
  evaluateOverloads(world) {
    const ball = world.ball;
    const mine = world.teams[this.team].players;
    const theirs = world.teams[1 - this.team].players;
    // Compare our vs their presence on each flank in the attacking half-ish.
    const bands = [0, 0, 0]; // left, centre, right (in world Z: -,0,+)
    for (const p of mine) {
      if (!p.onPitch || p.isGK) continue;
      bands[bandOf(p.z)] += 1;
    }
    const oppBands = [0, 0, 0];
    for (const p of theirs) {
      if (!p.onPitch || p.isGK) continue;
      oppBands[bandOf(p.z)] += 1;
    }
    let bestBand = 1;
    let bestAdv = -99;
    for (let i = 0; i < 3; i++) {
      const adv = bands[i] - oppBands[i];
      // Weight for being away from the ball (a switch is only useful if the
      // space is on the *other* side).
      const away = Math.abs(bandCentre(i) - ball.z) / 45;
      const score = adv + away * 1.4;
      if (score > bestAdv) { bestAdv = score; bestBand = i; }
    }
    this.overloadSide = bestBand - 1;
    this.attackSide = bandOf(ball.z) - 1;
    this.freeSpaceZ = bandCentre(bestBand);
  }

  // Public helper: the tactical home position of a player, in world space.
  homePosition(p, world) {
    const dir = attackDir(this.team);
    const e = this.effTactics;
    const L = PITCH.halfLength;
    const W = PITCH.halfWidth;

    // Keepers are never part of the outfield shape -- they belong to the goal.
    if (p.isGK) {
      const gx = -dir * L;
      const ball = world.ball;
      return {
        x: gx + dir * clamp(3 + (ball.x * dir + L) * 0.06, 1.5, 9),
        z: clamp(ball.z * 0.12, -5, 5),
        baseX: gx, baseZ: 0,
      };
    }

    // Base slot in normalised own-half-forward space.
    let nx = p.slotX;
    let nz = p.slotZ;

    // Mentality slides the whole shape up/down the pitch.
    const mentalityShift = (e.mentality - 0.5) * 0.20;
    nx = clamp(nx + mentalityShift * (0.5 + nx), 0.02, 0.96);

    // Width instruction spreads wide players out.
    const zc = nz - 0.5;
    nz = 0.5 + zc * (0.62 + e.width * 0.78);

    // Compactness pulls units toward the block centre.
    const world_x = (nx * 2 - 1) * L * dir;
    const world_z = (nz - 0.5) * 2 * W;

    // Anchor the shape to the block: defenders sit on the line, the rest
    // stagger forward from it based on their slot.
    const shapeDepth = (nx - this.formation.slots[0].x) / 0.95; // 0 at GK
    let ax = this.blockX + shapeDepth * (L * 1.28) * this.compression * dir;
    // Attacking teams stretch further; defending teams squash.
    if (!this.hasPossession) {
      ax = this.blockX + shapeDepth * (L * 1.12) * this.compression * dir;
    }
    ax = clamp(ax * dir, -L + 3, L - 2) * dir;

    // Lateral: blend the formation slot with the ball-side shift.
    const lateralPull = this.hasPossession ? 0.20 : 0.42 + e.compactness * 0.2;
    let az = world_z * (this.hasPossession ? 1 : (1 - lateralPull * 0.5)) +
             this.blockCentreZ * lateralPull;
    az = clamp(az, -W + 1.2, W - 1.2);

    return { x: ax, z: az, baseX: world_x, baseZ: world_z };
  }
}

function unitAffinity(p, o) {
  if (p.unit === 'defence' && o.unit === 'attack') return 0;
  if (p.unit === 'midfield' && o.unit === 'midfield') return 0;
  if (p.unit === 'attack' && o.unit === 'defence') return 1.5;
  if (p.unit === 'defence' && o.unit === 'midfield') return 1.0;
  return 1.8;
}

function bandOf(z) {
  if (z < -11.3) return 0;
  if (z > 11.3) return 2;
  return 1;
}
function bandCentre(i) { return [-22, 0, 22][i]; }
