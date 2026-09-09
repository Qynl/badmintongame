import { PITCH, BALL, SIM, RULES, PHASE, POS, GRAVITY } from './constants.js';
import { clamp, dist, dist2, lerp, makeRng, normalise, smoothstep, angleDiff } from './math.js';
import { Ball } from './ball.js';
import { Player } from './player.js';
import { EventBus } from './events.js';
import { TeamBrain, TEAM_PHASE } from '../ai/teamBrain.js';
import { decideOnBall, decideOffBall } from '../ai/decisions.js';
import { goalkeeperUpdate, attemptSave } from '../ai/goalkeeper.js';
import {
  executePass, executeShot, executeClear, executeCross, executeHeader,
  firstTouch, resolveTackle, bodyShapeQuality,
} from './actions.js';
import {
  attackDir, goalX, ownGoalX, timeToReach, pressureOn, laneRisk,
  spaceAt, threatValue, xG, offsideLine, isOffsidePosition,
} from './analysis.js';
import { SetPieceManager } from './setpieces.js';
import { Commentary } from './commentary.js';
import { FORMATIONS } from './formations.js';
import { applyFormationToTeam } from './teamFactory.js';

const tmpPred = { x: 0, y: 0, z: 0 };

export class Match {
  constructor(config) {
    this.config = config;
    this.rng = makeRng(config.seed ?? (Date.now() & 0xffffffff));
    this.events = new EventBus();
    this.ball = new Ball();
    this.dt = SIM.dt;

    this.teams = [
      makeTeamState(config.homeTeam, 0, this.rng),
      makeTeamState(config.awayTeam, 1, this.rng),
    ];
    this.teams[0].brain = new TeamBrain(0, this.teams[0].tactics, this.rng);
    this.teams[1].brain = new TeamBrain(1, this.teams[1].tactics, this.rng);

    this.playersById = new Map();
    this.allPlayers = [];
    for (const t of this.teams) {
      for (const p of t.players) {
        this.playersById.set(p.id, p);
        this.allPlayers.push(p);
      }
      for (const p of t.bench) this.playersById.set(p.id, p);
    }

    this.humanPlayerId = config.humanPlayerId ?? -1;
    this.humanTeam = config.humanTeam ?? 0;
    this.setHumanPlayer(this.humanPlayerId);

    // Match state
    this.score = [0, 0];
    this.matchSeconds = 0;
    this.half = 1;
    this.halfSeconds = RULES.halfLengthMinutes * 60 * RULES.timeScale;
    this.totalMatchSeconds = this.halfSeconds * 2;
    this.addedTime = 0;
    this.stoppageAccumulated = 0;
    this.phase = PHASE.PRE_MATCH;
    this.phaseTimer = 0;
    this.possessionTeam = -1;
    this.carrier = null;
    this.lastCarrier = null;
    this.running = false;
    this.finished = false;
    this.paused = false;
    this.restart = null;
    // Per-team multiplier on AI decision noise. 1 = the simulation's honest
    // behaviour. Difficulty raises it for the opposition so they choose worse
    // options -- it never touches their attributes, speed or physics.
    this.aiNoiseByTeam = [1, 1];
    this.kickoffTeam = this.rng.chance(0.5) ? 0 : 1;
    this.firstHalfKickoff = this.kickoffTeam;
    this.sideSwap = false; // after HT teams swap; we swap coordinates instead

    this.setPieces = new SetPieceManager(this);
    this.commentary = new Commentary(this);

    this.stats = {
      possession: [0, 0],
      possessionFrames: [0, 0],
      shots: [0, 0],
      shotsOnTarget: [0, 0],
      corners: [0, 0],
      fouls: [0, 0],
      offsides: [0, 0],
      yellow: [0, 0],
      red: [0, 0],
      passes: [0, 0],
      passesCompleted: [0, 0],
      xg: [0, 0],
      saves: [0, 0],
      tackles: [0, 0],
      throwIns: [0, 0],
      freeKicks: [0, 0],
      distance: [0, 0],
    };

    this.timeline = [];
    this.tick = 0;
    this.lastGoalTime = -99;
    this.pendingSubs = [[], []];
    this.momentum = 0; // -1 away .. +1 home
    this.weather = config.weather ?? 'clear';
    this.applyWeather();

    // Human input state (set by the controller each frame).
    this.input = {
      moveX: 0, moveZ: 0, sprint: false,
      pass: false, throughBall: false, shoot: false, shootPower: 0,
      tackle: false, slide: false, callForBall: false,
      switchPlayer: false, cross: false, lofted: false,
      aimX: 0, aimZ: 0, // camera-relative aim
    };
    this.humanCharge = 0;
    this.humanChargeType = null;

    this.setupKickoff(this.kickoffTeam, true);
  }

  applyWeather() {
    // Weather genuinely affects the physics.
    const w = this.weather;
    this.pitchFriction = 1;
    this.windX = 0; this.windZ = 0;
    if (w === 'rain') {
      this.pitchFriction = 0.82;  // ball skids
      BALL.groundFriction = 0.34;
    } else if (w === 'wet') {
      this.pitchFriction = 0.9;
      BALL.groundFriction = 0.38;
    } else if (w === 'windy') {
      BALL.groundFriction = 0.42;
      this.windX = this.rng.range(-2.6, 2.6);
      this.windZ = this.rng.range(-2.6, 2.6);
    } else {
      BALL.groundFriction = 0.42;
    }
  }

  setHumanPlayer(id) {
    for (const p of this.allPlayers) p.isHuman = false;
    this.humanPlayerId = id;
    const p = this.playersById.get(id);
    if (p) { p.isHuman = true; this.humanTeam = p.team; }
    this.human = p ?? null;
  }

  get humanPlayer() { return this.human; }

  // =========================================================================
  // MAIN LOOP
  // =========================================================================
  step(dt) {
    if (this.paused) return;
    dt = Math.min(dt, 0.05);
    this.dt = dt;
    this.tick++;

    const scaled = dt * RULES.timeScale;

    // Clock only runs in live phases.
    const clockRunning = this.phase === PHASE.OPEN_PLAY || this.phase === PHASE.KICKOFF ||
      this.phase === PHASE.THROW_IN || this.phase === PHASE.CORNER ||
      this.phase === PHASE.FREE_KICK || this.phase === PHASE.GOAL_KICK ||
      this.phase === PHASE.PENALTY;

    if (clockRunning && this.phase !== PHASE.HALF_TIME && this.phase !== PHASE.FULL_TIME) {
      this.matchSeconds += scaled;
    }
    if (this.phase !== PHASE.OPEN_PLAY && this.phase !== PHASE.HALF_TIME &&
        this.phase !== PHASE.FULL_TIME && this.phase !== PHASE.PRE_MATCH) {
      this.stoppageAccumulated += scaled * 0.35;
    }
    this.phaseTimer += dt;

    // Team-level thinking.
    this.teams[0].brain.update(this, dt);
    this.teams[1].brain.update(this, dt);

    // Possession bookkeeping.
    this.updatePossession(dt);

    // Set piece choreography can freeze/steer players.
    const spHandled = this.setPieces.update(dt);

    // Player AI + physics
    for (let i = 0; i < this.allPlayers.length; i++) {
      const p = this.allPlayers[i];
      if (!p.onPitch) continue;
      if (spHandled && this.setPieces.controls(p)) {
        p.integrate(dt);
        continue;
      }
      if (p.isHuman && this.phase !== PHASE.GOAL_CELEBRATION) {
        this.updateHumanPlayer(p, dt);
      } else if (p.isGK) {
        // A keeper with the ball at their feet (not in hands) must play it out
        // like any other footballer, otherwise possession dies with them.
        if (this.ball.owner === p.id && this.setPieces.gkHolding !== p) {
          p.controlTimer += dt;
          this.updateCarrier(p, dt, false);
        } else {
          goalkeeperUpdate(this, p, dt);
        }
      } else {
        this.updateAIPlayer(p, dt);
      }
      p.integrate(dt);
    }

    // Player-player collisions (shoulder to shoulder, no overlap)
    this.resolveCollisions(dt);

    // Ball physics + wind
    if (this.windX || this.windZ) {
      if (this.ball.y > BALL.radius + 0.05 && this.ball.owner === -1) {
        this.ball.vx += this.windX * dt * 0.32;
        this.ball.vz += this.windZ * dt * 0.32;
      }
    }
    this.ball.step(dt);

    // Ball <-> player interactions
    if (this.phase === PHASE.OPEN_PLAY || this.phase === PHASE.KICKOFF) {
      this.resolveBallContacts(dt);
    } else {
      this.resolveBallContactsRestricted(dt);
    }

    // Rules
    if (this.phase === PHASE.OPEN_PLAY || this.phase === PHASE.KICKOFF) {
      this.checkGoal();
      this.checkOutOfPlay();
      this.checkOffside();
    }

    this.updateStats(dt);
    this.updatePhaseTransitions(dt);
    this.commentary.update(dt);
    this.updateSubsAndInjuries(dt);
  }

  // =========================================================================
  // POSSESSION
  // =========================================================================
  updatePossession(dt) {
    const ball = this.ball;
    let carrier = null;
    if (ball.owner !== -1) {
      carrier = this.playersById.get(ball.owner) ?? null;
      if (carrier && !carrier.onPitch) { carrier = null; ball.owner = -1; }
    }
    this.carrier = carrier;

    if (carrier) {
      if (this.possessionTeam !== carrier.team) {
        this.events.emit('possessionChange', { team: carrier.team, player: carrier });
      }
      this.possessionTeam = carrier.team;
      this.lastCarrier = carrier;
    } else if (ball.lastTouchTeam !== -1 && ball.touchTimer < 1.4 && ball.speed3 < 26) {
      // A team keeps "possession" briefly after a pass is played.
      const intent = ball.intent;
      if (intent && intent.type === 'pass' && ball.touchTimer < 2.2) {
        this.possessionTeam = intent.team;
      } else {
        this.possessionTeam = ball.lastTouchTeam;
      }
    } else if (ball.speed3 > 1.5 && ball.touchTimer > 1.6) {
      this.possessionTeam = -1;
    }
  }

  // =========================================================================
  // AI PLAYER UPDATE
  // =========================================================================
  updateAIPlayer(p, dt) {
    const b = p.brain;
    b.decisionTimer -= dt;

    if (p.recovering > 0 || p.slideTimer > 0) {
      p.steer(p.x, p.z, 0, dt);
      return;
    }

    const hasBall = this.ball.owner === p.id;
    if (hasBall) {
      p.controlTimer += dt;
      this.updateCarrier(p, dt, false);
      return;
    }
    p.controlTimer = 0;

    // Off-ball: re-evaluate at an interval that scales with how close to the
    // action we are (cheap for far-away players -> handles 22 players easily).
    const ballD = dist(p.x, p.z, this.ball.x, this.ball.z);
    const interval = ballD < 14 ? 0.08 : ballD < 30 ? 0.16 : 0.3;
    if (b.decisionTimer <= 0) {
      b.decisionTimer = interval * (0.85 + this.rng() * 0.3);
      const d = decideOffBall(this, p);
      b.offBallTargetX = d.target.x;
      b.offBallTargetZ = d.target.z;
      b.moveIntensity = d.intensity;
      b.intent = d.intent;
      b.faceBall = d.faceBall;
    }

    p.targetX = b.offBallTargetX;
    p.targetZ = b.offBallTargetZ;
    p.steer(b.offBallTargetX, b.offBallTargetZ, b.moveIntensity ?? 0.4, dt);
    if (b.faceBall && p.speed < p.maxSpeed * 0.7) {
      p.faceToward(this.ball.x, this.ball.z);
    }

    // Defensive actions: tackle / intercept when close enough.
    this.tryDefensiveAction(p, dt);
  }

  updateCarrier(p, dt, isHuman) {
    const ball = this.ball;
    const b = p.brain;
    const dir = attackDir(p.team);

    // Dribble: the ball is pushed ahead of the player, not glued to them.
    b.decisionTimer -= dt;
    if (!isHuman && b.decisionTimer <= 0) {
      b.decisionTimer = 0.09 + this.rng() * 0.06;
      // Reaction delay before a player can act on receiving the ball. Under
      // pressure good players release it quicker (one-touch football); in
      // space they take a touch and look up.
      const press = pressureOn(this, p).value;
      const rush = clamp(press * 0.06, 0, 0.16);
      const minControl = clamp(0.16 + (1 - p.eff('reactions') / 99) * 0.24 - rush, 0.05, 0.42);
      if (p.controlTimer > minControl && p.touchCooldown <= 0) {
        const opt = decideOnBall(this, p, b);
        b.currentPlan = opt;
        this.executeAction(p, opt);
      } else {
        b.currentPlan = { type: 'hold' };
      }
    }

    // If the action released the ball, we must stop here. `this.carrier` is
    // only recomputed at the top of the next tick, so we have to test ball
    // ownership directly -- otherwise dribbleBall() below would immediately
    // overwrite the pass velocity with the player's own and glue the ball back
    // to their feet.
    if (ball.owner !== p.id) {
      if (this.carrier === p) this.carrier = null;
      return;
    }

    // Movement while carrying
    const plan = b.currentPlan;
    let tx = p.x;
    let tz = p.z;
    let intensity = 0.3;
    if (plan && plan.type === 'dribble' && plan.target) {
      tx = plan.target.x; tz = plan.target.z;
      const skill = p.eff('dribbling') / 99;
      intensity = clamp(0.55 + skill * 0.45, 0, 1);
      // Slow down in traffic to keep the ball.
      const press = pressureOn(this, p);
      intensity *= clamp(1 - press.value * 0.16, 0.45, 1);
    } else if (plan && plan.type === 'hold') {
      // Shield: put your body between the ball and the nearest opponent.
      const press = pressureOn(this, p);
      if (press.nearest && press.nearestD < 4) {
        const away = Math.atan2(p.z - press.nearest.z, p.x - press.nearest.x);
        tx = p.x + Math.cos(away) * 1.6;
        tz = p.z + Math.sin(away) * 1.6;
        intensity = 0.4;
        p.faceToward(p.x + Math.cos(away) * 3, p.z + Math.sin(away) * 3);
      } else {
        // Drift forward slowly looking for options.
        tx = p.x + dir * 2.5;
        tz = p.z;
        intensity = 0.32;
      }
    } else {
      tx = p.x + dir * 3;
      intensity = 0.4;
    }

    p.targetX = tx;
    p.targetZ = tz;
    p.steer(tx, tz, intensity, dt);
    this.dribbleBall(p, dt);
  }

  // The ball is pushed ahead of the dribbler; the touch distance grows with
  // speed and shrinks with technique, so fast dribblers with poor control push
  // it too far and lose it.
  dribbleBall(p, dt) {
    const ball = this.ball;
    const sp = p.speed;
    const control = p.eff('dribbling') * 0.6 + p.eff('technique') * 0.4;
    const touchDist = clamp(0.5 + (sp / 8) * (2.6 - (control / 99) * 1.5), 0.45, 3.4);
    const dirA = sp > 0.4 ? Math.atan2(p.vz, p.vx) : p.facing;
    const targetX = p.x + Math.cos(dirA) * touchDist;
    const targetZ = p.z + Math.sin(dirA) * touchDist;

    // Move the ball toward the target with some lag, plus per-touch noise.
    const k = clamp(8 + control * 0.06, 6, 16);
    ball.x = lerp(ball.x, targetX, clamp(k * dt, 0, 1));
    ball.z = lerp(ball.z, targetZ, clamp(k * dt, 0, 1));
    ball.y = BALL.radius;
    ball.vx = p.vx;
    ball.vz = p.vz;
    ball.vy = 0;
    ball.rollAngle += (sp / BALL.radius) * dt;

    // Occasional heavy touch -- more likely at speed / low technique / pressure.
    p.dribbleNoiseT = (p.dribbleNoiseT ?? 0) - dt;
    if (p.dribbleNoiseT <= 0) {
      p.dribbleNoiseT = 0.34 + this.rng() * 0.3;
      const press = pressureOn(this, p).value;
      const errChance = clamp((sp / p.maxSpeed) * 0.16 + press * 0.05 - (control / 99) * 0.14, 0.005, 0.4);
      if (this.rng() < errChance) {
        // Heavy touch: release the ball forward, player must chase.
        const err = this.rng.gauss(0, 0.5);
        ball.owner = -1;
        ball.ownerTeam = -1;
        p.hasBall = false;
        p.touchCooldown = 0.20;
        ball.vx = Math.cos(dirA + err) * (sp + 3.5 + this.rng() * 3);
        ball.vz = Math.sin(dirA + err) * (sp + 3.5 + this.rng() * 3);
        this.events.emit('heavyTouch', { player: p });
      }
    }

    if (this.rng() < dt * 0.9) p.stats.dribbles++;
  }

  executeAction(p, opt) {
    if (!opt) return;
    switch (opt.type) {
      case 'pass': {
        // Decide if this is really a cross.
        const dir = attackDir(p.team);
        const gx = goalX(p.team);
        const inWideFinalThird = Math.abs(p.z) > 16 &&
          (gx - p.x) * dir < 26 && (gx - p.x) * dir > 0;
        const targetInBox = Math.abs(opt.target.z) < PITCH.penaltyAreaHalfWidth &&
          Math.abs(gx - opt.target.x) < PITCH.penaltyAreaLength + 3;
        if (inWideFinalThird && targetInBox && dist(p.x, p.z, opt.target.x, opt.target.z) > 9) {
          executeCross(this, p, opt.target.x, opt.target.z, this.rng.chance(0.35));
        } else {
          executePass(this, p, opt);
        }
        break;
      }
      case 'shoot': executeShot(this, p, opt); break;
      case 'clear': executeClear(this, p, opt); break;
      case 'dribble':
      case 'hold':
      default: break;
    }
  }

  // =========================================================================
  // HUMAN PLAYER
  // =========================================================================
  updateHumanPlayer(p, dt) {
    const inp = this.input;
    const ball = this.ball;
    const hasBall = ball.owner === p.id;

    if (p.recovering > 0 || p.slideTimer > 0) {
      p.steer(p.x, p.z, 0, dt);
      if (p.slideTimer > 0) {
        // keep momentum during the slide
        p.x += p.vx * dt * 0.0;
      }
      return;
    }

    // Movement from input (already camera-relative).
    const mag = Math.hypot(inp.moveX, inp.moveZ);
    let intensity = 0;
    let tx = p.x;
    let tz = p.z;
    if (mag > 0.06) {
      const nx = inp.moveX / mag;
      const nz = inp.moveZ / mag;
      intensity = clamp(mag, 0, 1) * (inp.sprint ? 1 : 0.68);
      // Sprinting costs extra stamina.
      // Extra cost of holding sprint, on the 0..100 stamina scale. Writing
      // `dt * 0.55` here treated stamina as 0..1 and made sprinting free.
      if (inp.sprint) p.stamina -= dt * 1.6;
      tx = p.x + nx * 14;
      tz = p.z + nz * 14;
    }
    p.targetX = tx;
    p.targetZ = tz;
    p.steer(tx, tz, intensity, dt);

    // Look at the ball if we're not moving hard.
    if (!hasBall && intensity < 0.5 && dist(p.x, p.z, ball.x, ball.z) < 30) {
      p.faceToward(ball.x, ball.z);
    }

    if (hasBall) {
      p.controlTimer += dt;
      this.handleHumanBallActions(p, dt);
      // Only keep the ball at their feet if the action didn't release it.
      if (ball.owner === p.id) this.dribbleBall(p, dt);
      else if (this.carrier === p) this.carrier = null;
    } else {
      p.controlTimer = 0;
      this.handleHumanDefensiveActions(p, dt);
    }
  }

  handleHumanBallActions(p, dt) {
    const inp = this.input;
    if (p.touchCooldown > 0) return;

    // Charge-up for shots and long passes.
    if (inp.shoot) {
      this.humanCharge = clamp(this.humanCharge + dt * 1.5, 0, 1);
      this.humanChargeType = 'shoot';
      return;
    }
    if (inp.lofted) {
      this.humanCharge = clamp(this.humanCharge + dt * 1.6, 0, 1);
      this.humanChargeType = 'lofted';
      return;
    }

    if (this.humanChargeType === 'shoot') {
      const power = clamp(0.32 + this.humanCharge * 0.68, 0, 1);
      this.humanShoot(p, power);
      this.humanCharge = 0;
      this.humanChargeType = null;
      return;
    }
    if (this.humanChargeType === 'lofted') {
      const power = clamp(0.35 + this.humanCharge * 0.65, 0, 1);
      this.humanPass(p, { lofted: true, power });
      this.humanCharge = 0;
      this.humanChargeType = null;
      return;
    }

    if (inp.pass) {
      this.humanPass(p, { lofted: false, power: 0.6 });
      inp.pass = false;
      return;
    }
    if (inp.throughBall) {
      this.humanPass(p, { through: true, power: 0.8 });
      inp.throughBall = false;
      return;
    }
    if (inp.cross) {
      const dir = attackDir(p.team);
      const gx = goalX(p.team);
      executeCross(this, p, gx - dir * 8, -Math.sign(p.z || 1) * 3, false);
      inp.cross = false;
    }
  }

  // Find the best teammate in the direction the player is aiming.
  humanPass(p, { lofted, through, power }) {
    const inp = this.input;
    let aimX = inp.aimX;
    let aimZ = inp.aimZ;
    if (Math.hypot(aimX, aimZ) < 0.15) {
      aimX = Math.cos(p.facing);
      aimZ = Math.sin(p.facing);
    }
    const [ax, az] = normalise(aimX, aimZ);
    let best = null;
    let bestScore = -Infinity;
    for (const m of this.teams[p.team].players) {
      if (m === p || !m.onPitch) continue;
      const dx = m.x - p.x;
      const dz = m.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5 || d > (lofted ? 62 : 44)) continue;
      const align = (dx * ax + dz * az) / d;
      if (align < 0.20) continue;
      // Prefer aligned, closer, less marked players.
      const risk = laneRisk(this, p.x, p.z, m.x, m.z, p.team, lofted ? 19 : 17, lofted);
      const score = align * 3.2 - d / 30 - risk * 1.1 +
                    (through && (m.x - p.x) * attackDir(p.team) > 0 ? 0.8 : 0);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (!best) {
      // No teammate: just play it into the space we're aiming at.
      const range = lofted ? 34 : 20;
      executePass(this, p, {
        target: { x: p.x + ax * range, z: p.z + az * range },
        lofted, receiver: null, subtype: 'space', risk: 0.4,
        pressure: pressureOn(this, p).value,
      });
      return;
    }
    const leadT = through ? 0.9 : 0.35;
    const target = through
      ? { x: best.x + attackDir(p.team) * (7 + best.eff('pace') * 0.07), z: best.z + best.vz * leadT }
      : { x: best.x + best.vx * leadT, z: best.z + best.vz * leadT };
    executePass(this, p, {
      target, lofted, receiver: best,
      subtype: through ? 'space' : 'feet',
      risk: laneRisk(this, p.x, p.z, target.x, target.z, p.team, 17, lofted),
      pressure: pressureOn(this, p).value,
    });
  }

  humanShoot(p, power) {
    const inp = this.input;
    const gx = goalX(p.team);
    // Aim influenced by stick direction: nudges the target within the goal.
    let aimZ = 0;
    if (Math.hypot(inp.aimX, inp.aimZ) > 0.2) {
      const dirToGoal = Math.atan2(-p.z, gx - p.x);
      const aimAngle = Math.atan2(inp.aimZ, inp.aimX);
      const off = angleDiff(aimAngle, dirToGoal);
      aimZ = clamp(off * 6, -PITCH.halfGoalWidth * 0.95, PITCH.halfGoalWidth * 0.95);
    } else {
      const gk = this.teams[1 - p.team].players.find(g => g.isGK && g.onPitch);
      aimZ = (gk && gk.z > 0 ? -1 : 1) * PITCH.halfGoalWidth * 0.6;
    }
    const aimY = lerp(0.4, 1.9, clamp(power, 0, 1) * 0.5 + this.rng() * 0.3);
    executeShot(this, p, {
      pressure: pressureOn(this, p).value,
      xg: xG(this, p, p.x, p.z),
      power,
    }, { z: aimZ, y: aimY });
  }

  handleHumanDefensiveActions(p, dt) {
    const inp = this.input;
    const ball = this.ball;
    if (inp.slide && p.tackleCooldown <= 0 && p.speed > 2.5) {
      this.startSlide(p);
      inp.slide = false;
      return;
    }
    if (inp.tackle && p.tackleCooldown <= 0) {
      this.attemptTackle(p, false);
      inp.tackle = false;
      return;
    }
    // Calling for the ball raises this player's priority as a pass target.
    if (inp.callForBall) {
      p.brain.wantsBall = 1.2;
      // Teammates notice: bump their evaluation of passing to us.
      p.callTimer = 1.4;
    }
    if (p.callTimer > 0) p.callTimer -= dt;
  }

  // =========================================================================
  // DEFENSIVE ACTIONS (AI)
  // =========================================================================
  tryDefensiveAction(p, dt) {
    const ball = this.ball;
    const carrier = this.carrier;
    if (p.tackleCooldown > 0) return;

    // Interception: step into the path of a pass. This models a defender
    // *reading* the pass, so it needs both reaction time to have elapsed and
    // the ball to actually be coming into their zone.
    if (ball.owner === -1 && ball.speed3 > 4 && ball.lastTouchTeam !== p.team) {
      const reaction = 0.14 + (1 - p.eff('reactions') / 99) * 0.2;
      if (ball.touchTimer > reaction) {
        const dx = ball.x - p.x;
        const dz = ball.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.6 && d > 0.05 && ball.y < 2.0) {
          // Must be closing, not chasing a ball already past them.
          const closing = -((ball.vx * dx + ball.vz * dz) / d);
          if (closing > 0.5) {
            const reading = p.eff('interception') * 0.55 + p.eff('reactions') * 0.25 +
                            p.eff('positioning') * 0.2;
            const chance = clamp((reading / 99) * 0.9 - d * 0.22 - ball.speed3 * 0.016, 0, 0.8) * dt * 6;
            if (this.rng() < chance) {
              this.takeBallControl(p, 'interception');
              p.stats.interceptions++;
              this.events.emit('interception', { player: p });
              return;
            }
          }
        }
      }
    }

    if (!carrier || carrier.team === p.team) return;
    const d = dist(p.x, p.z, carrier.x, carrier.z);
    const ballD = dist(p.x, p.z, ball.x, ball.z);

    // Only the players actually engaged with the ball challenge for it. Without
    // this gate every nearby defender lunges every frame and the match becomes
    // a foul-fest.
    const tb = this.teams[p.team].brain;
    const engaged = p.id === tb.presserId || p.id === tb.secondPresserId ||
                    p.brain.intent === 'press' || p.brain.intent === 'mark' ||
                    p.brain.intent === 'chase';
    if (!engaged && d > 1.6) return;

    // Slide tackle: last resort when beaten and the situation is dangerous.
    if (d < 3.4 && d > 1.4 && p.speed > 4.0) {
      const dir = attackDir(p.team);
      const danger = smoothstep(46, 16, dist(carrier.x, carrier.z, ownGoalX(p.team), 0));
      // Only slide if we're genuinely beaten -- carrier is goal-side of us.
      const beaten = (carrier.x - p.x) * -dir > 0.5 ? 0.5 : 0;
      if (danger < 0.25 && !beaten) return;
      const desire = (danger * 0.5 + beaten) * (0.4 + (p.eff('aggression') / 99) * 0.6);
      if (this.rng() < desire * dt * 0.55) {
        this.startSlide(p);
        return;
      }
    }

    // Standing tackle: must be within playing distance of the BALL, not just
    // the man, and the carrier must be in front of us.
    if (ballD < p.reachRadius + 0.3 && d < 1.9) {
      // Don't dive in if support is better -- jockey instead. Higher tackling
      // and lower aggression means more patience.
      const patience = clamp((p.eff('tackling') / 99) * 0.35 + 0.25 -
                             (p.eff('aggression') / 99) * 0.3, 0, 0.6);
      const commit = clamp(0.5 + (p.eff('aggression') / 99) * 0.5 +
                           (p.eff('tackling') / 99) * 0.4 - patience, 0.1, 1.2);
      if (this.rng() < commit * dt * 3.2) {
        this.attemptTackle(p, false);
      }
    }
  }

  startSlide(p) {
    p.slideTimer = 0.65;
    p.tackleCooldown = 1.7;
    p.stats.tackles++;
    // Lunge forward
    const sp = Math.max(p.speed, 4.5);
    const a = p.speed > 0.4 ? Math.atan2(p.vz, p.vx) : p.facing;
    p.vx = Math.cos(a) * sp * 1.28;
    p.vz = Math.sin(a) * sp * 1.28;
    p.slidePending = true;
    this.events.emit('slide', { player: p });
  }

  attemptTackle(p, sliding) {
    const carrier = this.carrier;
    p.tackleTimer = 0.34;
    p.tackleCooldown = sliding ? 1.7 : 0.65;
    p.stats.tackles++;
    if (!carrier || carrier.team === p.team) {
      // Tackling thin air, or poking a loose ball.
      const ball = this.ball;
      if (dist(p.x, p.z, ball.x, ball.z) < p.reachRadius + 0.4 && ball.y < 1.2 && ball.owner === -1) {
        this.takeBallControl(p, 'tackle');
      }
      return;
    }
    const d = dist(p.x, p.z, carrier.x, carrier.z);
    if (d > 2.9) return;
    p.stats.duels++;
    carrier.stats.duels++;

    const res = resolveTackle(this, p, carrier, sliding);
    this.stats.tackles[p.team]++;

    if (res.outcome === 'win') {
      p.stats.tacklesWon++;
      p.stats.duelsWon++;
      carrier.stats.possessionLost++;
      this.rateEvent(p, 0.45, 'tackle won');
      this.rateEvent(carrier, -0.12, 'dispossessed');
      if (sliding) {
        // Sliding usually knocks the ball away rather than taking control.
        const a = this.rng() * Math.PI * 2;
        this.ball.owner = -1;
        this.ball.ownerTeam = -1;
        carrier.hasBall = false;
        const sp = 4 + this.rng() * 5;
        this.ball.vx = Math.cos(a) * sp;
        this.ball.vz = Math.sin(a) * sp;
        this.ball.registerTouch(p.id, p.team);
        carrier.touchCooldown = 0.4;
      } else {
        this.takeBallControl(p, 'tackle');
        carrier.touchCooldown = 0.5;
      }
      this.events.emit('tackle', { player: p, victim: carrier, won: true });
      this.bumpMomentum(p.team, 0.05);
    } else if (res.outcome === 'foul') {
      this.awardFoul(p, carrier, res.severity, sliding);
    } else if (res.outcome === 'partial') {
      // Ball squirts loose
      const a = Math.atan2(carrier.vz, carrier.vx) + this.rng.gauss(0, 1.0);
      this.ball.owner = -1;
      this.ball.ownerTeam = -1;
      carrier.hasBall = false;
      const sp = 3 + this.rng() * 4;
      this.ball.vx = Math.cos(a) * sp;
      this.ball.vz = Math.sin(a) * sp;
      carrier.touchCooldown = 0.3;
      p.touchCooldown = 0.3;
      this.events.emit('looseBall', { player: p });
    } else {
      carrier.stats.duelsWon++;
      carrier.stats.dribblesCompleted++;
      this.rateEvent(carrier, 0.12, 'beat man');
      this.events.emit('tackle', { player: p, victim: carrier, won: false });
    }
  }

  awardFoul(offender, victim, severity, sliding) {
    offender.stats.fouls++;
    victim.stats.fouled++;
    this.stats.fouls[offender.team]++;
    this.rateEvent(offender, -0.2 - severity * 0.3, 'foul');

    // Advantage: if the victim's team still has a good situation, play on.
    const dir = attackDir(victim.team);
    const advantage = this.ball.owner === victim.id ||
      (this.possessionTeam === victim.team && threatValue(this.ball.x, this.ball.z, victim.team) > 0.6);
    if (advantage && severity < 0.5 && this.rng.chance(0.4)) {
      this.events.emit('advantage', { offender, victim });
      this.commentary.say('advantage');
      return;
    }

    // Card?
    let card = null;
    if (severity > RULES.cardRedFoulThreshold) card = 'red';
    else if (severity > RULES.cardYellowFoulThreshold) card = 'yellow';
    // Cynical foul stopping a clear break -> more likely to be a card.
    if (!card && severity > 0.45) {
      const breaking = victim.speed > 5.5 && threatValue(victim.x, victim.z, victim.team) > 0.4;
      if (breaking && this.rng.chance(0.45)) card = 'yellow';
    }
    if (card === 'yellow') {
      offender.yellow++;
      this.stats.yellow[offender.team]++;
      if (offender.yellow >= 2) card = 'red';
    }
    if (card === 'red') {
      offender.sentOff = true;
      offender.onPitch = false;
      this.stats.red[offender.team]++;
      this.removeFromPitch(offender);
      this.events.emit('redCard', { player: offender });
      this.commentary.say('redCard', { player: offender });
    } else if (card === 'yellow') {
      this.events.emit('yellowCard', { player: offender });
      this.commentary.say('yellowCard', { player: offender });
    }

    // Injury chance from a heavy challenge.
    if (severity > 0.6 && this.rng.chance(severity * 0.28)) {
      victim.knock = clamp(victim.knock + severity * 0.5, 0, 1);
      if (this.rng.chance(severity * 0.25)) {
        victim.injury = clamp(victim.injury + severity * 0.4, 0, 1);
        this.events.emit('injury', { player: victim, severity });
        this.commentary.say('injury', { player: victim });
      }
    }
    victim.recovering = 0.7 + severity * 0.9;

    this.events.emit('foul', { offender, victim, severity, card });
    this.timeline.push({ t: this.matchSeconds, type: 'foul', team: offender.team, player: offender.name, card });

    // Set up the free kick. The foul location is where the CONTACT happened,
    // i.e. the victim's position -- not wherever the ball has rolled to.
    const fx = clamp(victim.x, -PITCH.halfLength + 1, PITCH.halfLength - 1);
    const fz = clamp(victim.z, -PITCH.halfWidth + 1, PITCH.halfWidth - 1);
    // A penalty is only for a foul inside the DEFENDING (offender's) box.
    const offenderGoalX = ownGoalX(offender.team);
    const inBox = Math.abs(fx - offenderGoalX) < PITCH.penaltyAreaLength &&
                  Math.abs(fz) < PITCH.penaltyAreaHalfWidth;
    if (inBox && offender.team !== victim.team) {
      this.setPieces.setupPenalty(victim.team);
      this.commentary.say('penalty', { team: victim.team });
    } else {
      this.setPieces.setupFreeKick(victim.team, fx, fz);
      this.stats.freeKicks[victim.team]++;
    }
  }

  removeFromPitch(p) {
    p.onPitch = false;
    p.hasBall = false;
    if (this.ball.owner === p.id) { this.ball.owner = -1; this.ball.ownerTeam = -1; }
    const t = this.teams[p.team];
    const i = t.players.indexOf(p);
    if (i >= 0) t.players.splice(i, 1);
    const j = this.allPlayers.indexOf(p);
    if (j >= 0) this.allPlayers.splice(j, 1);
    if (p.isHuman) {
      // Human sent off / subbed -> take control of the nearest teammate.
      const alt = t.players.find(x => !x.isGK && x.onPitch);
      if (alt) this.setHumanPlayer(alt.id);
    }
  }

  // =========================================================================
  // BALL CONTACTS
  // =========================================================================
  resolveBallContacts(dt) {
    const ball = this.ball;
    if (ball.owner !== -1) return;

    // Keeper catch first (they have hands).
    for (const t of this.teams) {
      const gk = t.players.find(g => g.isGK && g.onPitch);
      if (!gk) continue;
      const inBox = Math.abs(ball.x - ownGoalX(gk.team)) < PITCH.penaltyAreaLength &&
                    Math.abs(ball.z) < PITCH.penaltyAreaHalfWidth;
      if (!inBox) continue;
      const isShotAtUs = ball.intent && ball.intent.type === 'shot' && ball.intent.team !== gk.team;
      // A keeper is never "on cooldown" for a shot at their goal -- that would
      // let a rebound roll straight in unchallenged.
      if (gk.touchCooldown > 0 && !isShotAtUs) continue;
      const d3 = Math.hypot(ball.x - gk.x, ball.z - gk.z, (ball.y - 1.0) * 0.7);
      // A keeper facing a shot has a much bigger effective envelope: they are
      // diving, not standing. attemptSave() then decides if they actually
      // reach it, based on real dive geometry.
      const catchR = isShotAtUs
        ? 2.4 + (gk.eff('reflexes') / 99) * 2.2
        : 1.5 + (gk.eff('reflexes') / 99) * 0.9 + (gk.diving ? 0.9 : 0);
      if (d3 < catchR) {
        // Never allow the keeper to claim a backpass with hands.
        const backpass = ball.intent && ball.intent.type === 'pass' &&
                         ball.intent.team === gk.team && ball.y < 0.5 && !ball.intent.header;
        if (backpass) continue;
        const isShot = ball.intent && ball.intent.type === 'shot' && ball.intent.team !== gk.team;
        let saved = true;
        if (isShot) {
          const p = attemptSave(this, gk, ball);
          saved = this.rng() < p;
          if (saved) {
            gk.stats.saves++;
            this.stats.saves[gk.team]++;
            this.rateEvent(gk, 0.35, 'save');
            this.events.emit('save', { keeper: gk, shooter: this.playersById.get(ball.intent.from) });
            this.commentary.say('save', { keeper: gk });
            // Parry or catch?
            const handling = gk.eff('handling') / 99;
            if (this.rng() > handling * 0.82 || ball.speed3 > 28) {
              // Parry. A keeper pushes the ball AWAY from danger -- wide and
              // clear of the six-yard box -- not back into the middle.
              const dirOut = attackDir(gk.team);
              const side = Math.sign(ball.z - gk.z) || (this.rng.chance(0.5) ? 1 : -1);
              const outAngle = Math.atan2(side * 1.5, dirOut * 1.0);
              const power = 9 + this.rng() * 8 + (gk.eff('handling') / 99) * 4;
              ball.vx = Math.cos(outAngle) * power;
              ball.vz = Math.sin(outAngle) * power;
              ball.vy = 2.5 + this.rng() * 2.5;
              // Push the ball clear of the goal line so it can't trickle in.
              ball.x = ownGoalX(gk.team) + dirOut * 1.4;
              ball.registerTouch(gk.id, gk.team);
              ball.intent = null;
              gk.touchCooldown = 0.35;
              this.events.emit('parry', { keeper: gk });
              continue;
            }
            this.gkCatch(gk);
            continue;
          } else {
            // Beaten -- let the ball run on (goal check will catch it).
            gk.touchCooldown = 0.25;
            continue;
          }
        }
        // Not a shot: routine claim.
        const claimChance = clamp((gk.eff('handling') / 99) * 1.1 - ball.speed3 * 0.02, 0.2, 0.98);
        if (this.rng() < claimChance) {
          this.gkCatch(gk);
          continue;
        }
      }
    }
    if (ball.owner !== -1) return;

    // Outfield contacts: find the best-placed player who can touch the ball.
    // A player who has just played the ball cannot immediately re-collect it --
    // otherwise passers repossess their own passes and nothing ever travels.
    const selfLock = ball.lastTouch !== -1 && ball.touchTimer < 0.85 ? ball.lastTouch : -1;
    const ballSpeed = ball.speed3;
    const intendedReceiver = ball.intent && (ball.intent.type === 'pass' || ball.intent.type === 'cross')
      ? ball.intent.to : -1;

    let bestP = null;
    let bestScore = -Infinity;
    let deflector = null;
    for (const p of this.allPlayers) {
      if (!p.onPitch || p.touchCooldown > 0 || p.recovering > 0) continue;
      if (p.id === selfLock) continue;
      const dx = ball.x - p.x;
      const dz = ball.z - p.z;
      const d = Math.hypot(dx, dz);
      // Reach shrinks for a fast ball: you cannot casually stick a foot out and
      // cleanly control a 25 m/s drive at full stretch.
      const speedShrink = clamp(1 - (ballSpeed - 12) * 0.014, 0.72, 1);
      let reach = (p.reachRadius * speedShrink) + (p.slideTimer > 0 ? 1.35 : 0);
      if (ballSpeed > 14) reach += (p.eff('reactions') / 99) * 0.22;
      // Vertical reach: feet on the floor up to a jumping header. Taller /
      // better headers of the ball can attack a higher delivery.
      const maxHeight = 2.15 + (p.eff('heading') / 99) * 0.85;
      if (ball.y > maxHeight) continue;
      if (d > reach) continue;

      // --- REACTION GATE ---
      // A DELIBERATE touch on a ball that has *just* been struck requires the
      // player to have had time to react. Anyone standing next to the kicker
      // has not reacted yet -- at most they deflect it. This is what stops
      // every pass being "intercepted" 16ms after it leaves the boot.
      if (ballSpeed > 7 && p.id !== intendedReceiver) {
        const reaction = 0.12 + (1 - p.eff('reactions') / 99) * 0.16;
        // Already committed to the ball's path means you were anticipating.
        const anticipating = p.brain.intent === 'chase' || p.brain.intent === 'receive' ||
                             p.brain.intent === 'press' || p.slideTimer > 0;
        if (!anticipating && ball.touchTimer < reaction) {
          if (d < 0.6 && !deflector) deflector = p;
          continue;
        }
      }

      // Is the ball actually coming toward this player?
      let approach = 1;
      if (ballSpeed > 3 && d > 0.25) {
        const closing = -((ball.vx * dx + ball.vz * dz) / d);
        approach = closing > 0 ? 1 : 0.45;
      }
      const facing = Math.cos(p.facing) * (dx / (d || 1)) + Math.sin(p.facing) * (dz / (d || 1));
      const score = -d + facing * 0.35 + approach * 0.5 + (p.slideTimer > 0 ? 0.6 : 0) +
                    (p.id === intendedReceiver ? 0.8 : 0);
      if (score > bestScore) { bestScore = score; bestP = p; }
    }

    // Unintentional deflection off a player who couldn't react in time.
    if (!bestP) {
      if (deflector && this.rng() < 0.35) {
        const a = Math.atan2(ball.vz, ball.vx) + this.rng.gauss(0, 0.75);
        const sp = ball.speed3 * (0.45 + this.rng() * 0.3);
        ball.kick(Math.cos(a), Math.sin(a), sp, this.rng() * 0.25, 0, 0);
        ball.registerTouch(deflector.id, deflector.team);
        deflector.touchCooldown = 0.25;
        this.events.emit('deflection', { player: deflector });
      }
      return;
    }

    const p = bestP;
    const highBall = ball.y > 1.15;

    // A sliding player just knocks it away.
    if (p.slideTimer > 0) {
      const a = p.facing + this.rng.gauss(0, 0.5);
      const sp = 5 + this.rng() * 6;
      ball.kick(Math.cos(a), Math.sin(a), sp, 0.12, 0, 0);
      ball.registerTouch(p.id, p.team);
      p.stats.touches++;
      p.stats.clearances++;
      return;
    }

    if (highBall) {
      // Header / volley.
      this.resolveAerial(p, ball);
      return;
    }

    // Ground ball: attempt to control it.
    const wasOpponentBall = ball.lastTouchTeam !== -1 && ball.lastTouchTeam !== p.team;
    const touch = firstTouch(this, p, ball);

    if (touch.result === 'lost') {
      // Bounces off them.
      const a = Math.atan2(ball.vz, ball.vx) + this.rng.gauss(0, 0.9);
      const sp = clamp(ball.speed3 * 0.5 + 1.5, 1.5, 9);
      ball.kick(Math.cos(a), Math.sin(a), sp, 0.06, 0, 0);
      ball.registerTouch(p.id, p.team);
      p.touchCooldown = 0.28;
      p.stats.touches++;
      if (wasOpponentBall) { /* deflection */ } else p.stats.possessionLost++;
      this.events.emit('badTouch', { player: p });
      return;
    }

    if (touch.result === 'heavy') {
      // Ball pushed too far ahead -- a genuine 50/50 follows.
      const a = p.speed > 0.4 ? Math.atan2(p.vz, p.vx) : p.facing;
      const sp = 4 + this.rng() * 4;
      ball.kick(Math.cos(a + this.rng.gauss(0, 0.35)), Math.sin(a + this.rng.gauss(0, 0.35)), sp, 0.04, 0, 0);
      ball.registerTouch(p.id, p.team);
      p.touchCooldown = 0.22;
      p.stats.touches++;
      this.events.emit('heavyTouch', { player: p });
      return;
    }

    // Clean/OK control.
    this.takeBallControl(p, wasOpponentBall ? 'won' : 'received');
  }

  // Restricted contacts during set pieces: only the taker + after the restart.
  resolveBallContactsRestricted(dt) {
    if (this.setPieces.allowContacts) this.resolveBallContacts(dt);
  }

  resolveAerial(p, ball) {
    // Contest: who wins the header?
    let bestOpp = null;
    let bestVal = -Infinity;
    for (const o of this.allPlayers) {
      if (!o.onPitch || o === p) continue;
      const d = dist(o.x, o.z, ball.x, ball.z);
      if (d > 2.2) continue;
      const v = (o.eff('heading') * 0.5 + o.eff('strength') * 0.3 + o.eff('positioning') * 0.2) - d * 12;
      if (v > bestVal) { bestVal = v; bestOpp = o; }
    }
    let winner = p;
    if (bestOpp) {
      const pv = (p.eff('heading') * 0.5 + p.eff('strength') * 0.3 + p.eff('positioning') * 0.2) -
                 dist(p.x, p.z, ball.x, ball.z) * 12;
      const total = Math.max(1, Math.exp(pv / 22) + Math.exp(bestVal / 22));
      winner = this.rng() < Math.exp(pv / 22) / total ? p : bestOpp;
      p.stats.duels++;
      bestOpp.stats.duels++;
      winner.stats.duelsWon++;
    }

    const dir = attackDir(winner.team);
    const gx = goalX(winner.team);
    const dGoal = dist(winner.x, winner.z, gx, 0);
    const isAttackingHeader = dGoal < 18 && this.possessionTeam !== -1;
    if (dGoal < 16) {
      // Header at goal
      const aimZ = this.rng.range(-PITCH.halfGoalWidth * 0.7, PITCH.halfGoalWidth * 0.7);
      executeHeader(this, winner, ball, gx, aimZ, true);
      this.stats.shots[winner.team]++;
      this.rateEvent(winner, 0.1, 'header attempt');
    } else {
      // Defensive/knock-on header: away from our own goal, ideally to a mate,
      // and crucially aimed back INFIELD rather than blindly straight on --
      // heading it out for a throw every time is not football.
      let tx = winner.x + dir * 22;
      // Bias the aim toward the middle of the pitch.
      let tz = winner.z * 0.45 + this.rng.gauss(0, 5);
      // Look for a teammate.
      let best = null;
      let bestD = 99;
      for (const mate of this.teams[winner.team].players) {
        if (mate === winner || !mate.onPitch) continue;
        const d = dist(winner.x, winner.z, mate.x, mate.z);
        if (d > 26 || d < 5) continue;
        if ((mate.x - winner.x) * dir < -3) continue;
        if (d < bestD) { bestD = d; best = mate; }
      }
      if (best && this.rng.chance(0.45 + winner.eff('heading') / 250)) { tx = best.x; tz = best.z; }
      // Never aim a header off the park.
      tx = clamp(tx, -PITCH.halfLength + 4, PITCH.halfLength - 4);
      tz = clamp(tz, -PITCH.halfWidth + 4, PITCH.halfWidth - 4);
      executeHeader(this, winner, ball, tx, tz, false);
    }
  }

  takeBallControl(p, reason) {
    const ball = this.ball;
    const prevTeam = ball.lastTouchTeam;
    ball.owner = p.id;
    ball.ownerTeam = p.team;
    ball.registerTouch(p.id, p.team);
    ball.vy = 0;
    ball.y = BALL.radius;
    p.hasBall = true;
    p.controlTimer = 0;
    p.stats.touches++;
    p.brain.currentPlan = null;
    p.brain.decisionTimer = 0.05;

    // Pass completion tracking.
    // A pass counts as completed when ANY teammate receives it -- that is how
    // the statistic works in football, not just when the intended man gets it.
    const intent = ball.intent;
    if (intent && (intent.type === 'pass' || intent.type === 'clearance') &&
        intent.team === p.team && intent.from !== p.id) {
      const passer = this.playersById.get(intent.from);
      if (passer && intent.type === 'pass') {
        passer.stats.passesCompleted++;
        this.stats.passesCompleted[p.team]++;
        this.rateEvent(passer, 0.02, 'pass');
        // Key pass detection: pass leading directly to a good chance.
        if (threatValue(p.x, p.z, p.team) > 0.65) {
          passer.brain.lastKeyPassTime = this.matchSeconds;
          passer.pendingAssist = { time: this.matchSeconds, to: p.id };
        }
      }
    } else if (intent && intent.type === 'pass' && intent.team !== p.team) {
      const passer = this.playersById.get(intent.from);
      if (passer) {
        this.rateEvent(passer, -0.12, 'misplaced pass');
        passer.stats.possessionLost++;
      }
    }
    if (intent && intent.type === 'cross' && intent.team === p.team) {
      const passer = this.playersById.get(intent.from);
      if (passer) {
        passer.stats.passesCompleted++;
        passer.pendingAssist = { time: this.matchSeconds, to: p.id };
      }
    }
    ball.intent = null;

    if (reason === 'won' || reason === 'interception' || reason === 'tackle') {
      this.events.emit('turnover', { player: p, from: prevTeam });
      this.bumpMomentum(p.team, 0.04);
    }
    this.events.emit('control', { player: p, reason });
  }

  gkCatch(gk) {
    const ball = this.ball;
    ball.owner = gk.id;
    ball.ownerTeam = gk.team;
    ball.registerTouch(gk.id, gk.team);
    gk.hasBall = true;
    gk.holdTimer = 0;
    gk.stats.touches++;
    ball.intent = null;
    this.events.emit('gkClaim', { keeper: gk });
    // Keeper distributes after a short delay.
    this.setPieces.setupGkDistribution(gk);
  }

  // =========================================================================
  // COLLISIONS
  // =========================================================================
  resolveCollisions(dt) {
    const ps = this.allPlayers;
    const R = 0.46;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (!a.onPitch) continue;
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (!b.onPitch) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        const minD = R * 2;
        if (d2 > minD * minD || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const overlap = minD - d;
        const nx = dx / d;
        const nz = dz / d;
        // Stronger player gives less ground.
        const sa = a.eff('strength') + (a.hasBall ? 12 : 0);
        const sb = b.eff('strength') + (b.hasBall ? 12 : 0);
        const total = sa + sb;
        const wa = sb / total;
        const wb = sa / total;
        a.x -= nx * overlap * wa;
        a.z -= nz * overlap * wa;
        b.x += nx * overlap * wb;
        b.z += nz * overlap * wb;
        // Physical duel: a strong shoulder can knock the carrier off the ball.
        if (a.team !== b.team && (a.hasBall || b.hasBall)) {
          const carrier = a.hasBall ? a : b;
          const challenger = a.hasBall ? b : a;
          const relSpeed = Math.abs(challenger.speed - carrier.speed);
          if (relSpeed > 2.2 && challenger.tackleCooldown <= 0) {
            const strengthEdge = (challenger.eff('strength') - carrier.eff('strength')) / 99;
            const chance = clamp(0.1 + strengthEdge * 0.45 + relSpeed * 0.02, 0, 0.55) * dt * 3;
            if (this.rng() < chance) {
              // Shoulder charge wins the ball or gives a foul.
              if (this.rng.chance(0.72)) {
                this.ball.owner = -1;
                this.ball.ownerTeam = -1;
                carrier.hasBall = false;
                carrier.touchCooldown = 0.4;
                const a2 = Math.atan2(nz, nx) * (a.hasBall ? 1 : -1);
                this.ball.vx = Math.cos(a2) * 5;
                this.ball.vz = Math.sin(a2) * 5;
                this.ball.registerTouch(challenger.id, challenger.team);
                challenger.stats.duelsWon++;
                carrier.stats.possessionLost++;
              } else {
                this.awardFoul(challenger, carrier, 0.3 + this.rng() * 0.3, false);
              }
            }
          }
        }
      }
    }
  }

  // =========================================================================
  // RULES
  // =========================================================================
  checkGoal() {
    const ball = this.ball;
    const L = PITCH.halfLength;
    if (Math.abs(ball.x) < L) return;
    if (Math.abs(ball.z) > PITCH.halfGoalWidth) return;
    if (ball.y > PITCH.goalHeight) return;
    if (Math.abs(ball.x) > L + PITCH.goalDepth + 1) return;

    // A ball held in a keeper's hands is not "in play" -- it cannot score, and
    // a keeper standing on their line must never carry it in.
    if (ball.owner !== -1) {
      const holder = this.playersById.get(ball.owner);
      if (holder && holder.isGK) {
        // Push it back onto the pitch and carry on.
        ball.x = clamp(ball.x, -PITCH.halfLength + 1.2, PITCH.halfLength - 1.2);
        return;
      }
    }

    const scoringTeam = ball.x > 0 ? 0 : 1;
    const scorer = this.playersById.get(ball.lastTouch);
    const ownGoal = scorer && scorer.team !== scoringTeam;

    this.score[scoringTeam]++;
    this.lastGoalTime = this.matchSeconds;
    if (scorer && !ownGoal) {
      scorer.stats.goals++;
      scorer.celebrating = 3.4;
      this.rateEvent(scorer, 1.35, 'goal');
      // Assist
      for (const m of this.teams[scoringTeam].players) {
        if (m.pendingAssist && m.pendingAssist.to === scorer.id &&
            this.matchSeconds - m.pendingAssist.time < 14) {
          m.stats.assists++;
          this.rateEvent(m, 0.8, 'assist');
          break;
        }
      }
    }
    this.bumpMomentum(scoringTeam, 0.45);
    this.stats.shotsOnTarget[scoringTeam]++;

    this.timeline.push({
      t: this.matchSeconds,
      type: 'goal',
      team: scoringTeam,
      player: scorer ? scorer.name : 'Unknown',
      ownGoal,
      score: [...this.score],
    });
    this.events.emit('goal', { team: scoringTeam, scorer, ownGoal, score: [...this.score] });
    this.commentary.say('goal', { scorer, team: scoringTeam, ownGoal });

    this.phase = PHASE.GOAL_CELEBRATION;
    this.phaseTimer = 0;
    this.kickoffTeam = 1 - scoringTeam;
    ball.owner = -1;
    ball.ownerTeam = -1;
  }

  checkOutOfPlay() {
    const ball = this.ball;
    const L = PITCH.halfLength;
    const W = PITCH.halfWidth;
    const r = BALL.radius;

    // Touchline -> throw-in
    if (Math.abs(ball.z) > W + r) {
      const team = ball.lastTouchTeam === -1 ? 0 : 1 - ball.lastTouchTeam;
      const x = clamp(ball.x, -L + 0.5, L - 0.5);
      const z = Math.sign(ball.z) * W;
      this.setPieces.setupThrowIn(team, x, z);
      this.stats.throwIns[team]++;
      this.events.emit('throwIn', { team });
      return;
    }

    // Goal line
    if (Math.abs(ball.x) > L + r) {
      // Already handled if it was a goal.
      if (Math.abs(ball.z) < PITCH.halfGoalWidth && ball.y < PITCH.goalHeight) return;
      const defendingTeam = ball.x > 0 ? 1 : 0;
      const lastTeam = ball.lastTouchTeam;
      if (lastTeam === defendingTeam) {
        // Corner
        const z = Math.sign(ball.z || (this.rng.chance(0.5) ? 1 : -1)) * W;
        const x = Math.sign(ball.x) * L;
        this.setPieces.setupCorner(1 - defendingTeam, x, z);
        this.stats.corners[1 - defendingTeam]++;
        this.events.emit('corner', { team: 1 - defendingTeam });
        this.commentary.say('corner', { team: 1 - defendingTeam });
      } else {
        this.setPieces.setupGoalKick(defendingTeam);
        this.events.emit('goalKick', { team: defendingTeam });
      }
    }
  }

  checkOffside() {
    if (!RULES.offsideEnabled) return;
    const ball = this.ball;
    const intent = ball.intent;

    // 1) Snapshot offside positions at the MOMENT the ball is played. Offside
    //    is judged when the pass leaves the boot, not when it arrives.
    if (intent && (intent.type === 'pass' || intent.type === 'cross') && !intent.offsideChecked) {
      intent.offsideChecked = true;
      const passX = intent.ballXAtPass ?? ball.x;
      for (const p of this.teams[intent.team].players) {
        if (!p.onPitch || p.isGK) continue;
        if (p.id === intent.from) continue;
        p.offsideFlag = isOffsidePosition(this, p, passX);
      }
      // Anyone not on the passing team can't be offside from this pass.
      for (const p of this.teams[1 - intent.team].players) p.offsideFlag = false;
      this.offsidePhaseTeam = intent.team;
      this.offsidePhaseTime = this.matchSeconds;
    }

    // 2) The phase of play ends when the defending team wins the ball, the
    //    ball goes dead, or the attack simply breaks down. Flags must not
    //    persist across phases -- a player who was offside two attacks ago is
    //    not offside now.
    if (this.offsidePhaseTeam !== undefined && this.offsidePhaseTeam !== -1) {
      const stale = this.possessionTeam !== -1 && this.possessionTeam !== this.offsidePhaseTeam;
      const expired = this.matchSeconds - (this.offsidePhaseTime ?? 0) > 9;
      if (stale || expired) {
        for (const p of this.allPlayers) p.offsideFlag = false;
        this.offsidePhaseTeam = -1;
      }
    }

    // 3) The flag only goes up if a flagged player actually becomes involved.
    const toucher = this.carrier ||
      (ball.touchTimer < 0.1 ? this.playersById.get(ball.lastTouch) : null);
    if (!toucher || !toucher.offsideFlag) return;

    // Clear all flags -- the phase of play is over.
    for (const p of this.allPlayers) p.offsideFlag = false;

    toucher.stats.offsides++;
    this.stats.offsides[toucher.team]++;
    this.events.emit('offside', { player: toucher });
    this.commentary.say('offside', { player: toucher });
    this.timeline.push({
      t: this.matchSeconds, type: 'offside',
      team: toucher.team, player: toucher.name,
    });
    this.setPieces.setupFreeKick(1 - toucher.team, toucher.x, toucher.z, true);
  }

  // =========================================================================
  // PHASES
  // =========================================================================
  updatePhaseTransitions(dt) {
    if (this.phase === PHASE.GOAL_CELEBRATION) {
      if (this.phaseTimer > 3.6) {
        this.setupKickoff(this.kickoffTeam, false);
      }
      return;
    }

    // Half time / full time
    const halfEnd = this.half * this.halfSeconds;
    const added = this.half === 1 ? this.addedTimeFor(1) : this.addedTimeFor(2);
    if (this.matchSeconds >= halfEnd + added) {
      // Only stop when the ball is in a natural place (or we've run well over).
      const naturalStop = this.phase === PHASE.OPEN_PLAY &&
        (this.possessionTeam === -1 || this.ball.speed3 < 4 ||
         Math.abs(this.ball.x) > PITCH.halfLength * 0.6);
      const overrun = this.matchSeconds > halfEnd + added + 25;
      if (naturalStop || overrun || this.phase !== PHASE.OPEN_PLAY) {
        if (this.half === 1) {
          this.half = 2;
          this.phase = PHASE.HALF_TIME;
          this.phaseTimer = 0;
          this.matchSeconds = this.halfSeconds;
          this.stoppageAccumulated = 0;
          this.events.emit('halfTime', { score: [...this.score] });
          this.commentary.say('halfTime');
          // Recover stamina at half time.
          for (const p of this.allPlayers) p.stamina = clamp(p.stamina + 22, 0, 100);
          for (const t of this.teams) for (const p of t.bench) p.stamina = 100;
        } else {
          this.phase = PHASE.FULL_TIME;
          this.running = false;
          this.finished = true;
          this.events.emit('fullTime', { score: [...this.score], stats: this.stats });
          this.commentary.say('fullTime');
        }
      }
    }
  }

  addedTimeFor(half) {
    // Added time is derived from actual stoppages.
    const base = clamp(this.stoppageAccumulated, 30, 60 * 7 * RULES.timeScale / 6);
    return clamp(base, 20, 60 * 6);
  }

  startSecondHalf() {
    if (this.phase !== PHASE.HALF_TIME) return;
    this.stoppageAccumulated = 0;
    this.setupKickoff(1 - this.firstHalfKickoff, false);
  }

  setupKickoff(team, isMatchStart) {
    this.phase = PHASE.KICKOFF;
    this.phaseTimer = 0;
    this.ball.setPosition(0, BALL.radius, 0);
    this.ball.lastTouch = -1;
    this.ball.lastTouchTeam = -1;
    this.possessionTeam = team;
    this.carrier = null;
    this.setPieces.setupKickoff(team);
    this.events.emit('kickoff', { team, half: this.half });
    if (isMatchStart) this.commentary.say('kickoff');
  }

  // =========================================================================
  // STATS / RATINGS / MOMENTUM
  // =========================================================================
  updateStats(dt) {
    if (this.possessionTeam !== -1) {
      this.stats.possessionFrames[this.possessionTeam] += dt;
    }
    const tot = this.stats.possessionFrames[0] + this.stats.possessionFrames[1];
    if (tot > 0) {
      this.stats.possession[0] = Math.round((this.stats.possessionFrames[0] / tot) * 100);
      this.stats.possession[1] = 100 - this.stats.possession[0];
    }
    this.momentum *= Math.pow(0.94, dt);
  }

  bumpMomentum(team, amount) {
    this.momentum = clamp(this.momentum + (team === 0 ? amount : -amount), -1, 1);
  }

  rateEvent(p, delta, reason) {
    if (!p) return;
    p.stats.rating = clamp(p.stats.rating + delta, 1, 10);
    if (Math.abs(delta) > 0.2) {
      p.stats.ratingEvents.push({ t: this.matchSeconds, delta, reason });
      if (p.stats.ratingEvents.length > 40) p.stats.ratingEvents.shift();
    }
  }

  // =========================================================================
  // SUBS / INJURIES / FATIGUE
  // =========================================================================
  updateSubsAndInjuries(dt) {
    // Injury from overexertion
    if (this.rng() < dt * 0.0022) {
      const candidates = this.allPlayers.filter(p => p.onPitch && p.stamina < 45 && !p.isGK);
      if (candidates.length) {
        const p = this.rng.pick(candidates);
        const sev = this.rng() * 0.5 + 0.15;
        p.injury = clamp(p.injury + sev, 0, 1);
        p.recovering = 1.2;
        this.events.emit('injury', { player: p, severity: sev });
        this.commentary.say('injury', { player: p });
      }
    }

    // AI manager makes substitutions.
    for (let t = 0; t < 2; t++) {
      const team = this.teams[t];
      if (team.isHumanControlled && this.config.manualSubs) continue;
      if (team.subsUsed >= RULES.maxSubs) continue;
      if (this.phase !== PHASE.OPEN_PLAY && this.phase !== PHASE.HALF_TIME &&
          this.phase !== PHASE.THROW_IN && this.phase !== PHASE.GOAL_KICK) continue;
      if (this.matchSeconds < this.halfSeconds * 0.9 && this.phase !== PHASE.HALF_TIME) continue;
      team.subCooldown = (team.subCooldown ?? 0) - dt;
      if (team.subCooldown > 0) continue;

      const sub = this.chooseSubstitution(t);
      if (sub) {
        this.makeSubstitution(t, sub.off, sub.on);
        team.subCooldown = 60;
      } else {
        team.subCooldown = 12;
      }
    }
  }

  chooseSubstitution(t) {
    const team = this.teams[t];
    const bench = team.bench.filter(p => !p.usedAsSub && !p.injury);
    if (!bench.length) return null;
    const brain = team.brain;
    const diff = this.score[t] - this.score[1 - t];
    const minsLeft = (this.totalMatchSeconds - this.matchSeconds) / 60 / RULES.timeScale;

    // Who needs replacing?
    let worst = null;
    let worstScore = -Infinity;
    for (const p of team.players) {
      if (p.isGK) continue;
      if (p.isHuman) continue;
      let need = 0;
      need += clamp((60 - p.stamina) / 40, 0, 1.6) * 1.5;
      need += p.injury * 4;
      need += p.knock * 1.2;
      need += clamp((6.2 - p.stats.rating), 0, 3) * 0.5;
      if (p.yellow >= 1) need += 0.6;
      if (need > worstScore) { worstScore = need; worst = p; }
    }
    if (!worst || worstScore < 1.15) return null;

    // Who comes on? Prefer same position; if chasing, prefer attackers.
    let best = null;
    let bestFit = -Infinity;
    for (const b of bench) {
      if (b.isGK) continue;
      let fit = b.ovr * 0.05;
      if (b.position === worst.position) fit += 2.2;
      else if (b.unit === worst.unit) fit += 1.2;
      if (diff < 0 && minsLeft < 20 && b.unit === 'attack') fit += 1.4;
      if (diff > 0 && minsLeft < 15 && b.unit === 'defence') fit += 1.0;
      if (fit > bestFit) { bestFit = fit; best = b; }
    }
    if (!best) return null;
    return { off: worst, on: best };
  }

  makeSubstitution(t, off, on) {
    const team = this.teams[t];
    const i = team.players.indexOf(off);
    if (i < 0) return false;
    on.slotX = off.slotX;
    on.slotZ = off.slotZ;
    on.position = off.position;
    on.unit = off.unit;
    on.role = off.role;
    on.x = off.x;
    on.z = off.z;
    on.vx = 0; on.vz = 0;
    on.onPitch = true;
    on.usedAsSub = true;
    on.stamina = clamp(on.stamina, 88, 100);
    off.onPitch = false;
    team.players[i] = on;
    const j = this.allPlayers.indexOf(off);
    if (j >= 0) this.allPlayers[j] = on;
    else this.allPlayers.push(on);
    const k = team.bench.indexOf(on);
    if (k >= 0) team.bench.splice(k, 1);
    team.bench.push(off);
    team.subsUsed++;
    if (off.isHuman) {
      off.isHuman = false;
      on.isHuman = true;
      this.setHumanPlayer(on.id);
    }
    this.events.emit('substitution', { team: t, off, on });
    this.commentary.say('substitution', { off, on });
    this.timeline.push({ t: this.matchSeconds, type: 'sub', team: t, off: off.name, on: on.name });
    return true;
  }

  // =========================================================================
  // HELPERS FOR UI
  // =========================================================================
  get displayClock() {
    const mins = Math.floor(this.matchSeconds / 60 / RULES.timeScale * 6 * (45 / (RULES.halfLengthMinutes * 6)));
    return mins;
  }

  matchMinute() {
    // Map simulated seconds onto a 0-90 match minute.
    const frac = this.matchSeconds / this.totalMatchSeconds;
    return Math.min(Math.floor(frac * 90) + (this.matchSeconds > 0 ? 1 : 0), 90 + 9);
  }

  matchClockString() {
    const totalMin = this.matchSeconds / this.totalMatchSeconds * 90;
    const halfLimit = this.half === 1 ? 45 : 90;
    let m = Math.floor(totalMin);
    let extra = 0;
    if (m > halfLimit) { extra = m - halfLimit; m = halfLimit; }
    const s = Math.floor((totalMin - Math.floor(totalMin)) * 60);
    const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return extra > 0 ? `${base} +${extra}` : base;
  }

  setTactics(team, patch) {
    Object.assign(this.teams[team].tactics, patch);
    if (patch.formation) this.applyFormation(team, patch.formation);
  }

  // Change formation mid-match. Slots are re-assigned to the players already on
  // the pitch by minimising how far each has to travel from where they are now,
  // so a reshuffle looks like a reshuffle rather than a teleport.
  applyFormation(team, key) {
    const t = this.teams[team];
    if (!FORMATIONS[key]) return false;
    applyFormationToTeam(t, key);
    t.tactics.formation = key;
    t.brain?.onTacticsChanged?.();
    this.events.emit('formationChange', { team: t.index, formation: key });
    return true;
  }
}

// ---------------------------------------------------------------------------
function makeTeamState(cfg, index, rng) {
  return {
    index,
    name: cfg.name,
    shortName: cfg.shortName ?? cfg.name.slice(0, 3).toUpperCase(),
    colors: cfg.colors,
    players: cfg.players,
    bench: cfg.bench ?? [],
    tactics: cfg.tactics,
    subsUsed: 0,
    brain: null,
    isHumanControlled: !!cfg.isHumanControlled,
    rating: cfg.rating ?? 70,
  };
}
