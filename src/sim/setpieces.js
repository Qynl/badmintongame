import { PITCH, BALL, PHASE, GRAVITY } from './constants.js';
import { clamp, dist, lerp, normalise, smoothstep } from './math.js';
import { attackDir, goalX, ownGoalX, spaceAt, threatValue, laneRisk, timeToReach, xG } from './analysis.js';
import { executePass, executeShot, executeCross, executeClear } from './actions.js';

// ---------------------------------------------------------------------------
// SET PIECES
//
// Kickoffs, throw-ins, goal kicks, corners, free kicks and penalties.  Each has
// a genuine choreography: players take up sensible positions, the taker makes a
// real decision, and once the ball is live the normal simulation resumes.
// ---------------------------------------------------------------------------

export class SetPieceManager {
  constructor(match) {
    this.m = match;
    this.active = false;
    this.type = null;
    this.team = -1;
    this.taker = null;
    this.spot = { x: 0, z: 0 };
    this.timer = 0;
    this.delay = 1.4;
    this.allowContacts = false;
    this.positions = new Map(); // playerId -> {x,z}
    this.taken = false;
    this.wallPlayers = [];
  }

  controls(p) {
    return this.active && !this.taken;
  }

  // ------------------------------------------------------------------
  begin(type, team, x, z, delay) {
    const m = this.m;
    this.active = true;
    this.taken = false;
    this.type = type;
    this.team = team;
    this.spot.x = x;
    this.spot.z = z;
    this.timer = 0;
    this.delay = delay;
    this.allowContacts = false;
    this.positions.clear();
    this.wallPlayers = [];
    m.ball.setPosition(x, BALL.radius, z);
    m.carrier = null;
    m.possessionTeam = team;
    for (const p of m.allPlayers) {
      p.hasBall = false;
      p.brain.currentPlan = null;
      p.touchCooldown = 0.1;
      p.pendingOffside = false;
      p.offsideFlag = false;
    }
  }

  // ------------------------------------------------------------------
  setupKickoff(team) {
    const m = this.m;
    this.begin('kickoff', team, 0, 0, 1.6);
    m.phase = PHASE.KICKOFF;
    const dir = attackDir(team);

    for (const t of m.teams) {
      const tdir = attackDir(t.index);
      for (const p of t.players) {
        if (!p.onPitch) continue;
        const home = t.brain.homePosition(p, m);
        // Everyone in their own half.
        let hx = -Math.abs(home.x) * tdir * 0 + home.x;
        // Force own half
        if (hx * tdir > -1.5) hx = -1.5 * tdir;
        let hz = home.z;
        if (t.index !== team) {
          // Defending team must be outside the centre circle.
          const d = Math.hypot(hx, hz);
          if (d < PITCH.centreCircle + 0.6) {
            const [nx, nz] = normalise(hx || -tdir, hz || 0.01);
            hx = nx * (PITCH.centreCircle + 1.2);
            hz = nz * (PITCH.centreCircle + 1.2);
            if (hx * tdir > 0) hx = -Math.abs(hx) * tdir;
          }
        }
        this.positions.set(p.id, { x: hx, z: hz });
      }
    }
    // Two players on the ball.
    const t = m.teams[team];
    const forwards = t.players.filter(p => !p.isGK).sort((a, b) => b.slotX - a.slotX);
    this.taker = forwards[0] ?? t.players[1];
    const partner = forwards[1] ?? t.players[2];
    if (this.taker) this.positions.set(this.taker.id, { x: -0.6 * dir, z: 0 });
    if (partner) this.positions.set(partner.id, { x: -2.2 * dir, z: 2.0 });
    this.partner = partner;
  }

  setupThrowIn(team, x, z) {
    const m = this.m;
    const side = Math.sign(z) || 1;
    // The ball must sit just INSIDE the touchline, otherwise the out-of-play
    // check re-triggers the instant play resumes (infinite restart loop).
    this.begin('throw', team, x, side * (PITCH.halfWidth - 0.35), 1.5);
    m.phase = PHASE.THROW_IN;
    const dir = attackDir(team);
    const t = m.teams[team];
    this.throwSide = side;
    // Nearest suitable player takes it (usually a fullback / winger).
    let best = null;
    let bestD = 999;
    for (const p of t.players) {
      if (p.isGK) continue;
      const d = dist(p.x, p.z, x, z) + (p.unit === 'defence' ? -2 : 0);
      if (d < bestD) { bestD = d; best = p; }
    }
    this.taker = best;
    if (best) this.positions.set(best.id, { x, z: side * (PITCH.halfWidth + 0.9) });

    // Everyone else takes up sensible positions relative to the throw.
    for (const tt of m.teams) {
      for (const p of tt.players) {
        if (!p.onPitch || p === best) continue;
        const home = tt.brain.homePosition(p, m);
        let tx = lerp(home.x, x, 0.35);
        let tz = lerp(home.z, z, 0.42);
        if (tt.index === team && !p.isGK) {
          // Offer short options.
          const d = dist(p.x, p.z, x, z);
          if (d < 20) {
            tz = lerp(tz, z - Math.sign(z) * 5, 0.5);
          }
        }
        this.positions.set(p.id, { x: clamp(tx, -PITCH.halfLength + 2, PITCH.halfLength - 2), z: clamp(tz, -PITCH.halfWidth + 1, PITCH.halfWidth - 1) });
      }
    }
  }

  setupGoalKick(team) {
    const m = this.m;
    const gx = ownGoalX(team);
    const dir = attackDir(team);
    const z = m.ball.z > 0 ? PITCH.sixYardHalfWidth * 0.7 : -PITCH.sixYardHalfWidth * 0.7;
    this.begin('goalkick', team, gx + dir * PITCH.sixYardLength, z, 2.0);
    m.phase = PHASE.GOAL_KICK;
    const t = m.teams[team];
    const gk = t.players.find(p => p.isGK);
    this.taker = gk;
    if (gk) this.positions.set(gk.id, { x: gx + dir * (PITCH.sixYardLength - 1.2), z: z * 0.8 });

    // Shape for building out: CBs split wide, fullbacks high, midfield offers.
    for (const tt of m.teams) {
      for (const p of tt.players) {
        if (!p.onPitch || p === gk) continue;
        const home = tt.brain.homePosition(p, m);
        let tx = home.x;
        let tz = home.z;
        if (tt.index === team) {
          if (p.unit === 'defence') {
            tx = gx + dir * clamp(14 + (p.slotX - 0.17) * 20, 8, 24);
            tz = (p.slotZ - 0.5) * 2 * (PITCH.penaltyAreaHalfWidth + 2);
          } else if (p.unit === 'midfield') {
            tx = gx + dir * 32;
          }
        } else {
          // Pressing team: press the outlets or drop into a mid block.
          const press = tt.brain.effTactics.pressing;
          tx = lerp(home.x, gx + dir * 26, press * 0.55);
        }
        this.positions.set(p.id, { x: clamp(tx, -PITCH.halfLength + 2, PITCH.halfLength - 2), z: clamp(tz, -PITCH.halfWidth + 1, PITCH.halfWidth - 1) });
      }
    }
  }

  setupCorner(team, x, z) {
    const m = this.m;
    const cx = Math.sign(x) * (PITCH.halfLength - 0.3);
    const cz = Math.sign(z) * (PITCH.halfWidth - 0.3);
    this.begin('corner', team, cx, cz, 2.6);
    m.phase = PHASE.CORNER;
    const t = m.teams[team];
    const dir = attackDir(team);
    const gx = goalX(team);

    // Best crosser takes it, preferring the foot that swings it in.
    let best = null;
    let bestScore = -Infinity;
    for (const p of t.players) {
      if (p.isGK) continue;
      const inswinger = (cz > 0 && p.footedness === 'R') || (cz < 0 && p.footedness === 'L');
      const s = p.eff('passing') * 0.5 + p.eff('technique') * 0.5 + (inswinger ? 8 : 0) - p.eff('heading') * 0.18;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    this.taker = best;
    if (best) this.positions.set(best.id, { x: cx - dir * 0.6, z: cz - Math.sign(cz) * 0.6 });

    // Attacking box positions.
    const attackers = t.players.filter(p => p !== best && !p.isGK)
      .sort((a, b) => (b.eff('heading') + b.eff('strength')) - (a.eff('heading') + a.eff('strength')));
    const boxSpots = [
      { x: gx - dir * 5.2, z: Math.sign(cz) * 3.2 },   // near post
      { x: gx - dir * 8.0, z: 0.5 },                    // centre
      { x: gx - dir * 9.5, z: -Math.sign(cz) * 4.0 },   // far post
      { x: gx - dir * 12.5, z: Math.sign(cz) * 2.0 },   // edge of six
      { x: gx - dir * 16.5, z: -Math.sign(cz) * 1.0 },  // penalty spot area
      { x: gx - dir * 21.0, z: 0 },                     // edge of box (2nd ball)
      { x: gx - dir * 26.0, z: -Math.sign(cz) * 9 },    // recycle
    ];
    // Leave 2 back for the counter.
    const backCount = 2;
    const defenders = attackers.slice(-backCount);
    const inBox = attackers.slice(0, Math.max(0, attackers.length - backCount));
    inBox.forEach((p, i) => {
      const s = boxSpots[Math.min(i, boxSpots.length - 1)];
      this.positions.set(p.id, { x: s.x, z: s.z });
    });
    defenders.forEach((p, i) => {
      this.positions.set(p.id, { x: gx - dir * 42, z: (i === 0 ? -12 : 12) });
    });
    const gk = t.players.find(p => p.isGK);
    if (gk) this.positions.set(gk.id, { x: ownGoalX(team) + dir * 2.5, z: 0 });

    // Defending team: mixture of zonal + man marking.
    const dt = m.teams[1 - team];
    const dgx = ownGoalX(1 - team);
    const ddir = attackDir(1 - team);
    const defList = dt.players.filter(p => !p.isGK)
      .sort((a, b) => (b.eff('heading') + b.eff('marking')) - (a.eff('heading') + a.eff('marking')));
    const zonal = [
      { x: dgx - ddir * 5.5, z: Math.sign(cz) * 2.8 },
      { x: dgx - ddir * 5.5, z: -Math.sign(cz) * 2.8 },
      { x: dgx - ddir * 9.5, z: Math.sign(cz) * 1.2 },
      { x: dgx - ddir * 9.5, z: -Math.sign(cz) * 4.5 },
      { x: dgx - ddir * 13.0, z: 0 },
      { x: dgx - ddir * 13.0, z: Math.sign(cz) * 6.5 },
      { x: dgx - ddir * 18.0, z: -Math.sign(cz) * 3.0 },
      { x: dgx - ddir * 4.5, z: Math.sign(cz) * 6.4 },  // near post cover
      { x: dgx - ddir * 24.0, z: 0 },                    // edge
      { x: cx - dir * 9, z: cz - Math.sign(cz) * 6 },    // short corner cover
    ];
    defList.forEach((p, i) => {
      const s = zonal[Math.min(i, zonal.length - 1)];
      this.positions.set(p.id, { x: s.x, z: s.z });
    });
    const dgk = dt.players.find(p => p.isGK);
    if (dgk) this.positions.set(dgk.id, { x: dgx - ddir * -1.4, z: Math.sign(cz) * 1.2 });
  }

  setupFreeKick(team, x, z, isOffside = false) {
    const m = this.m;
    const fx = clamp(x, -PITCH.halfLength + 2, PITCH.halfLength - 2);
    const fz = clamp(z, -PITCH.halfWidth + 1.5, PITCH.halfWidth - 1.5);
    this.begin('freekick', team, fx, fz, 2.4);
    m.phase = PHASE.FREE_KICK;
    const dir = attackDir(team);
    const gx = goalX(team);
    const dGoal = dist(fx, fz, gx, 0);
    this.shootable = dGoal < 32 && Math.abs(fz) < 26 && !isOffside;

    const t = m.teams[team];
    // Taker: best striker of a dead ball if shootable, else nearest.
    let best = null;
    let bestScore = -Infinity;
    for (const p of t.players) {
      if (p.isGK) continue;
      const s = this.shootable
        ? p.eff('shooting') * 0.5 + p.eff('technique') * 0.5
        : p.eff('passing') * 0.6 + p.eff('vision') * 0.4 - dist(p.x, p.z, fx, fz) * 1.5;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    this.taker = best;
    if (best) this.positions.set(best.id, { x: fx - dir * 1.8, z: fz - Math.sign(fz || 1) * 0.4 });

    // Wall for the defending team.
    const dt = m.teams[1 - team];
    const dgx = ownGoalX(1 - team);
    const wallSize = this.shootable ? (dGoal < 20 ? 4 : dGoal < 26 ? 3 : 2) : 0;
    const [wx, wz] = normalise(dgx - fx, 0 - fz);
    const wallDist = 9.15;
    const wallCx = fx + wx * wallDist;
    const wallCz = fz + wz * wallDist;
    const perpX = -wz;
    const perpZ = wx;

    const defList = dt.players.filter(p => !p.isGK)
      .sort((a, b) => b.eff('heading') - a.eff('heading'));
    let idx = 0;
    for (let i = 0; i < wallSize && idx < defList.length; i++, idx++) {
      const off = (i - (wallSize - 1) / 2) * 0.62;
      this.positions.set(defList[idx].id, {
        x: wallCx + perpX * off,
        z: wallCz + perpZ * off,
      });
      this.wallPlayers.push(defList[idx].id);
    }
    // Rest hold a line / mark.
    const attackers = t.players.filter(p => p !== best && !p.isGK);
    const lineX = this.shootable ? dgx - attackDir(1 - team) * -16 : lerp(fx, dgx, 0.55);
    for (let i = idx; i < defList.length; i++) {
      const p = defList[i];
      const spread = ((i - idx) / Math.max(1, defList.length - idx - 1) - 0.5) * 30;
      this.positions.set(p.id, {
        x: this.shootable ? dgx - attackDir(1 - team) * -14 : lineX,
        z: clamp(spread + fz * 0.2, -PITCH.halfWidth + 2, PITCH.halfWidth - 2),
      });
    }
    // Attackers position for the delivery.
    attackers.forEach((p, i) => {
      if (this.shootable) {
        // A couple in the wall-adjacent zone, rest at the edge of the box.
        const spread = (i / Math.max(1, attackers.length - 1) - 0.5) * 26;
        this.positions.set(p.id, {
          x: gx - dir * (dGoal < 22 ? 14 : 18),
          z: clamp(spread, -PITCH.halfWidth + 3, PITCH.halfWidth - 3),
        });
      } else {
        const home = t.brain.homePosition(p, m);
        const inBoxDelivery = dGoal < 45 && p.unit !== 'defence';
        if (inBoxDelivery) {
          const spots = [
            { x: gx - dir * 6, z: Math.sign(fz || 1) * 4 },
            { x: gx - dir * 10, z: 0 },
            { x: gx - dir * 9, z: -Math.sign(fz || 1) * 5 },
            { x: gx - dir * 15, z: Math.sign(fz || 1) * 2 },
          ];
          const s = spots[i % spots.length];
          this.positions.set(p.id, s);
        } else {
          this.positions.set(p.id, { x: home.x, z: home.z });
        }
      }
    });
    const gk = t.players.find(p => p.isGK);
    if (gk) this.positions.set(gk.id, { x: ownGoalX(team) + dir * 6, z: 0 });
    const dgk = dt.players.find(p => p.isGK);
    if (dgk) {
      // Keeper covers the far post for a direct free kick.
      const side = Math.sign(fz) || 1;
      this.positions.set(dgk.id, { x: dgx + attackDir(1 - team) * 0.9, z: -side * 1.6 });
    }
  }

  setupPenalty(team) {
    const m = this.m;
    const dir = attackDir(team);
    const gx = goalX(team);
    const spotX = gx - dir * PITCH.penaltySpot;
    this.begin('penalty', team, spotX, 0, 3.4);
    m.phase = PHASE.PENALTY;

    const t = m.teams[team];
    let best = null;
    let bestScore = -Infinity;
    for (const p of t.players) {
      if (p.isGK) continue;
      const s = p.eff('finishing') * 0.5 + p.eff('composure') * 0.4 + p.eff('shooting') * 0.1;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    this.taker = best;
    if (best) this.positions.set(best.id, { x: spotX - dir * 3.2, z: 0 });

    // Everyone else outside the box, behind the ball.
    const others = [...t.players, ...m.teams[1 - team].players].filter(p => p !== best && !p.isGK);
    others.forEach((p, i) => {
      const angle = (i / others.length) * Math.PI * 2;
      const r = PITCH.penaltyAreaLength + 3.5;
      this.positions.set(p.id, {
        x: clamp(spotX - dir * (6 + Math.abs(Math.cos(angle)) * 8), -PITCH.halfLength + 3, PITCH.halfLength - 3),
        z: clamp(Math.sin(angle) * 14, -PITCH.halfWidth + 3, PITCH.halfWidth - 3),
      });
    });
    const dgk = m.teams[1 - team].players.find(p => p.isGK);
    if (dgk) this.positions.set(dgk.id, { x: gx - dir * 0.35, z: 0 });
    const gk = t.players.find(p => p.isGK);
    if (gk) this.positions.set(gk.id, { x: ownGoalX(team) + dir * 8, z: 0 });
  }

  setupGkDistribution(gk) {
    // Keeper has the ball in hand: give them a moment then distribute.
    this.gkHolding = gk;
    this.gkHoldTimer = 0.9 + this.m.rng() * 1.4;
  }

  // ------------------------------------------------------------------
  update(dt) {
    const m = this.m;

    // Keeper distribution (not a formal set piece -- play is live).
    if (this.gkHolding) {
      const gk = this.gkHolding;
      if (!gk.onPitch || m.ball.owner !== gk.id) {
        this.gkHolding = null;
      } else {
        this.gkHoldTimer -= dt;
        // Ball stays in hands. Hold it in FRONT of the keeper relative to the
        // pitch, never behind them -- otherwise a keeper standing on their line
        // carries the ball over it and concedes.
        const outDir = attackDir(gk.team);
        const hx = clamp(gk.x + outDir * 0.55,
          -PITCH.halfLength + 1.2, PITCH.halfLength - 1.2);
        m.ball.x = hx;
        m.ball.z = clamp(gk.z, -PITCH.halfWidth + 1, PITCH.halfWidth - 1);
        m.ball.y = 1.1;
        m.ball.vx = 0; m.ball.vy = 0; m.ball.vz = 0;
        if (this.gkHoldTimer <= 0) {
          this.distributeFromKeeper(gk);
          this.gkHolding = null;
        }
        return false;
      }
    }

    if (!this.active) return false;
    this.timer += dt;

    // Move everyone to their set-piece positions.
    if (!this.taken) {
      for (const p of m.allPlayers) {
        if (!p.onPitch) continue;
        const pos = this.positions.get(p.id);
        if (!pos) { p.steer(p.x, p.z, 0, dt); continue; }
        const d = dist(p.x, p.z, pos.x, pos.z);
        const intensity = d > 18 ? 1 : d > 6 ? 0.8 : d > 1.4 ? 0.5 : 0;
        p.targetX = pos.x; p.targetZ = pos.z;
        p.steer(pos.x, pos.z, intensity, dt);
        if (p === this.taker) {
          p.faceToward(this.aimPoint()?.x ?? m.ball.x, this.aimPoint()?.z ?? m.ball.z);
        } else {
          p.faceToward(m.ball.x, m.ball.z);
        }
      }
      // Hold the ball on the spot.
      m.ball.x = this.spot.x;
      m.ball.z = this.spot.z;
      m.ball.y = this.type === 'throw' ? 1.9 : BALL.radius;
      m.ball.vx = 0; m.ball.vy = 0; m.ball.vz = 0;

      // Human takes the set piece if it's theirs and they're the taker.
      if (this.taker && this.taker.isHuman && this.timer > 0.6) {
        if (m.input.pass || m.input.shoot || m.input.cross || m.input.lofted || m.input.throughBall) {
          this.takeSetPiece(true);
          return true;
        }
        // Give the human 6 seconds then auto-take.
        if (this.timer > this.delay + 6) this.takeSetPiece(false);
        return true;
      }

      const takerReady = !this.taker ||
        dist(this.taker.x, this.taker.z, this.spot.x, this.spot.z) < 2.4;
      if (this.timer > this.delay && takerReady) {
        this.takeSetPiece(false);
      } else if (this.timer > this.delay + 4.5) {
        this.takeSetPiece(false); // safety valve
      }
      return true;
    }

    // Ball is live again.
    if (this.timer > this.delay + 0.35) {
      this.active = false;
      this.allowContacts = true;
      m.phase = PHASE.OPEN_PLAY;
    }
    return this.active;
  }

  aimPoint() {
    const m = this.m;
    const dir = attackDir(this.team);
    const gx = goalX(this.team);
    if (this.type === 'corner' || (this.type === 'freekick' && !this.shootable)) {
      return { x: gx - dir * 8, z: 0 };
    }
    if (this.type === 'penalty' || (this.type === 'freekick' && this.shootable)) {
      return { x: gx, z: 0 };
    }
    return null;
  }

  takeSetPiece(humanInitiated) {
    const m = this.m;
    const taker = this.taker;
    this.taken = true;
    this.allowContacts = true;
    m.ball.owner = -1;
    m.ball.ownerTeam = -1;
    if (!taker || !taker.onPitch) {
      m.phase = PHASE.OPEN_PLAY;
      this.active = false;
      return;
    }

    switch (this.type) {
      case 'kickoff': this.takeKickoff(taker, humanInitiated); break;
      case 'throw': this.takeThrowIn(taker, humanInitiated); break;
      case 'goalkick': this.takeGoalKick(taker, humanInitiated); break;
      case 'corner': this.takeCorner(taker, humanInitiated); break;
      case 'freekick': this.takeFreeKick(taker, humanInitiated); break;
      case 'penalty': this.takePenalty(taker, humanInitiated); break;
      default: m.phase = PHASE.OPEN_PLAY; this.active = false;
    }
  }

  takeKickoff(taker, human) {
    const m = this.m;
    const dir = attackDir(this.team);
    if (human) { m.humanPass(taker, { lofted: false, power: 0.6 }); }
    else {
      const target = this.partner && this.partner.onPitch
        ? { x: this.partner.x, z: this.partner.z }
        : { x: -6 * dir, z: 6 };
      executePass(m, taker, { target, receiver: this.partner, subtype: 'feet', risk: 0, pressure: 0 });
    }
    m.phase = PHASE.OPEN_PLAY;
    m.possessionTeam = this.team;
  }

  takeThrowIn(taker, human) {
    const m = this.m;
    const dir = attackDir(this.team);
    const side = this.throwSide ?? (Math.sign(this.spot.z) || 1);
    if (human) { m.humanPass(taker, { lofted: false, power: 0.5 }); m.phase = PHASE.OPEN_PLAY; return; }
    // Find the best option -- must be meaningfully INFIELD of the touchline,
    // otherwise the throw goes straight back out.
    let best = null;
    let bestScore = -Infinity;
    for (const p of m.teams[this.team].players) {
      if (p === taker || !p.onPitch || p.isGK) continue;
      const d = dist(taker.x, taker.z, p.x, p.z);
      if (d > 26 || d < 3) continue;
      // Reject targets that sit right on the line we're throwing from.
      if (Math.abs(p.z) > PITCH.halfWidth - 2.0 && Math.sign(p.z) === side && d < 8) continue;
      const risk = laneRisk(m, taker.x, taker.z, p.x, p.z, this.team, 15);
      const sp = spaceAt(m, p.x, p.z, this.team, 8);
      const prog = (p.x - taker.x) * dir;
      const infield = (PITCH.halfWidth - Math.abs(p.z)) / PITCH.halfWidth;
      const score = sp * 1.5 + (1 - risk) * 2 + prog / 22 - d / 32 + infield * 1.2;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    let tx;
    let tz;
    let receiver = null;
    if (best) {
      receiver = best;
      tx = best.x + best.vx * 0.3;
      tz = best.z + best.vz * 0.3;
    } else {
      // Long throw down the line, but angled back into the pitch.
      tx = taker.x + dir * 14;
      tz = taker.z - side * 8;
    }
    // Hard guarantee: the throw target is inside the pitch with margin.
    tz = clamp(tz, -PITCH.halfWidth + 2.5, PITCH.halfWidth - 2.5);
    tx = clamp(tx, -PITCH.halfLength + 2.5, PITCH.halfLength - 2.5);
    executePass(m, taker, {
      target: { x: tx, z: tz },
      receiver, subtype: 'feet',
      lofted: dist(taker.x, taker.z, tx, tz) > 16,
      risk: 0.2, pressure: 0,
    });
    // Move the taker back onto the pitch so they can rejoin play.
    taker.z = side * (PITCH.halfWidth - 0.6);
    m.phase = PHASE.OPEN_PLAY;
  }

  takeGoalKick(taker, human) {
    const m = this.m;
    const dir = attackDir(this.team);
    if (human) { m.humanPass(taker, { lofted: true, power: 0.8 }); m.phase = PHASE.OPEN_PLAY; return; }
    const tactics = m.teams[this.team].brain.effTactics;
    // Short build-up vs long ball, decided by tactics and by whether the
    // opponent is pressing high.
    const oppBrain = m.teams[1 - this.team].brain;
    const pressedHigh = oppBrain.lineHeight > 0.55 || oppBrain.effTactics.pressing > 0.65;
    const goShort = tactics.directness < 0.5 && !pressedHigh &&
                    m.rng() > tactics.directness;

    if (goShort) {
      let best = null;
      let bestScore = -Infinity;
      for (const p of m.teams[this.team].players) {
        if (p === taker || !p.onPitch) continue;
        const d = dist(taker.x, taker.z, p.x, p.z);
        if (d > 30 || d < 6) continue;
        const risk = laneRisk(m, taker.x, taker.z, p.x, p.z, this.team, 16);
        const score = (1 - risk) * 3 + spaceAt(m, p.x, p.z, this.team, 9) - d / 40;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best) {
        executePass(m, taker, { target: { x: best.x, z: best.z }, receiver: best, subtype: 'feet', risk: 0.2, pressure: 0 });
        m.phase = PHASE.OPEN_PLAY;
        return;
      }
    }
    // Long: aim at the target man / best aerial player.
    let target = null;
    let bestS = -Infinity;
    for (const p of m.teams[this.team].players) {
      if (p === taker || !p.onPitch || p.isGK) continue;
      if ((p.x - taker.x) * dir < 30) continue;
      const s = p.eff('heading') + p.eff('strength') * 0.5 + (p.x - taker.x) * dir * 0.3;
      if (s > bestS) { bestS = s; target = p; }
    }
    const tx = target ? target.x + dir * 3 : taker.x + dir * 58;
    const tz = target ? target.z : m.rng.range(-14, 14);
    executePass(m, taker, {
      target: { x: tx, z: tz }, receiver: target, subtype: 'space',
      lofted: true, risk: 0.5, pressure: 0,
    });
    m.phase = PHASE.OPEN_PLAY;
  }

  takeCorner(taker, human) {
    const m = this.m;
    const dir = attackDir(this.team);
    const gx = goalX(this.team);
    if (human) { m.humanPass(taker, { lofted: true, power: 0.75 }); m.phase = PHASE.OPEN_PLAY; return; }

    // Short corner if a teammate is free nearby and the routine calls for it.
    const shortOption = m.teams[this.team].players.find(p =>
      p !== taker && p.onPitch && dist(p.x, p.z, taker.x, taker.z) < 10 &&
      spaceAt(m, p.x, p.z, this.team, 6) > 0.7);
    if (shortOption && m.rng.chance(0.16)) {
      executePass(m, taker, { target: { x: shortOption.x, z: shortOption.z }, receiver: shortOption, subtype: 'feet', risk: 0.1, pressure: 0 });
      m.phase = PHASE.OPEN_PLAY;
      return;
    }

    // Pick a delivery zone: near post, centre, far post, or pulled back.
    const zones = [
      { x: gx - dir * 5.0, z: Math.sign(taker.z) * 2.6, w: 1.0 },
      { x: gx - dir * 8.0, z: 0, w: 1.5 },
      { x: gx - dir * 9.5, z: -Math.sign(taker.z) * 4.0, w: 1.2 },
      { x: gx - dir * 15.0, z: -Math.sign(taker.z) * 1.0, w: 0.5 },
    ];
    // Prefer the zone with our best aerial presence.
    let best = zones[1];
    let bestScore = -Infinity;
    for (const z of zones) {
      let pres = 0;
      for (const p of m.teams[this.team].players) {
        if (p === taker || !p.onPitch) continue;
        const d = dist(p.x, p.z, z.x, z.z);
        if (d < 6) pres += (p.eff('heading') / 99) * (1 - d / 6);
      }
      const s = pres * 2 + z.w + m.rng() * 0.6;
      if (s > bestScore) { bestScore = s; best = z; }
    }
    executeCross(m, taker, best.x, best.z, false);
    m.phase = PHASE.OPEN_PLAY;
  }

  takeFreeKick(taker, human) {
    const m = this.m;
    const dir = attackDir(this.team);
    const gx = goalX(this.team);
    const d = dist(taker.x, taker.z, gx, 0);
    if (human) {
      if (m.input.shoot || (this.shootable && !m.input.pass && !m.input.cross)) {
        m.humanShoot(taker, 0.9);
      } else {
        m.humanPass(taker, { lofted: m.input.lofted, power: 0.7 });
      }
      m.phase = PHASE.OPEN_PLAY;
      return;
    }

    if (this.shootable && m.rng.chance(0.55 + taker.eff('shooting') / 400)) {
      // Direct free kick: bend it over/around the wall.
      const gk = m.teams[1 - this.team].players.find(p => p.isGK && p.onPitch);
      const side = gk && gk.z > 0 ? -1 : 1;
      const aimZ = side * PITCH.halfGoalWidth * (0.55 + m.rng() * 0.35);
      const aimY = m.rng.chance(0.6) ? 1.7 + m.rng() * 0.5 : 0.4 + m.rng() * 0.5;
      const technique = taker.eff('technique') / 99;
      const dx = gx - taker.x;
      const dz = aimZ - taker.z;
      const flat = Math.hypot(dx, dz);
      const speed = clamp(20 + (taker.eff('shooting') / 99) * 12, 16, 32);
      const disc = speed ** 4 - GRAVITY * (GRAVITY * flat * flat + 2 * aimY * speed * speed);
      let elev = disc > 0 ? Math.atan((speed * speed - Math.sqrt(disc)) / (GRAVITY * flat)) : 0.24;
      const err = (1 - technique) * 0.09;
      const a = Math.atan2(dz, dx) + m.rng.gauss(0, err);
      elev += m.rng.gauss(0, err * 0.9);
      // Big curl on a free kick.
      const curl = (aimZ > 0 ? -1 : 1) * (14 + technique * 22);
      m.ball.kick(Math.cos(a), Math.sin(a), speed, clamp(elev, 0.02, 0.6), curl, -4);
      m.ball.registerTouch(taker.id, taker.team);
      m.ball.intent = { type: 'shot', from: taker.id, team: taker.team, atTime: m.matchSeconds };
      taker.stats.shots++;
      m.stats.shots[taker.team]++;
      taker.anim.kickT = 1;
      m.events.emit('shot', { player: taker, xg: 0.07, freeKick: true });
      m.commentary.say('freeKickShot', { player: taker });
    } else if (d < 48 && Math.abs(taker.z) > 8) {
      // Whipped delivery into the box.
      executeCross(m, taker, gx - dir * 8, m.rng.range(-6, 6), false);
    } else {
      // Play it short and restart the attack.
      let best = null;
      let bestScore = -Infinity;
      for (const p of m.teams[this.team].players) {
        if (p === taker || !p.onPitch) continue;
        const dd = dist(taker.x, taker.z, p.x, p.z);
        if (dd > 32 || dd < 4) continue;
        const risk = laneRisk(m, taker.x, taker.z, p.x, p.z, this.team, 16);
        const score = (1 - risk) * 2 + threatValue(p.x, p.z, this.team) * 1.5 - dd / 40;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best) {
        executePass(m, taker, { target: { x: best.x, z: best.z }, receiver: best, subtype: 'feet', risk: 0.2, pressure: 0 });
      } else {
        executeClear(m, taker, { target: { x: taker.x + dir * 40, z: taker.z } });
      }
    }
    m.phase = PHASE.OPEN_PLAY;
  }

  takePenalty(taker, human) {
    const m = this.m;
    const dir = attackDir(this.team);
    const gx = goalX(this.team);
    const gk = m.teams[1 - this.team].players.find(p => p.isGK && p.onPitch);

    if (human) {
      m.humanShoot(taker, 0.85);
      m.phase = PHASE.OPEN_PLAY;
      m.commentary.say('penaltyTaken', { player: taker });
      return;
    }

    const composure = taker.eff('composure') / 99;
    const finishing = taker.eff('finishing') / 99;
    // Placement: better takers hit the corners.
    const side = m.rng.chance(0.5) ? 1 : -1;
    const accuracy = composure * 0.5 + finishing * 0.5;
    const aimZ = side * PITCH.halfGoalWidth * (0.55 + accuracy * 0.38);
    const aimY = m.rng.chance(0.35) ? 1.1 + m.rng() * 0.9 : 0.35 + m.rng() * 0.4;
    const speed = 20 + finishing * 8;
    const flat = Math.hypot(gx - taker.x, aimZ - taker.z);
    const disc = speed ** 4 - GRAVITY * (GRAVITY * flat * flat + 2 * aimY * speed * speed);
    let elev = disc > 0 ? Math.atan((speed * speed - Math.sqrt(disc)) / (GRAVITY * flat)) : 0.12;
    const err = (1 - accuracy) * 0.075 + 0.012;
    const a = Math.atan2(aimZ - taker.z, gx - taker.x) + m.rng.gauss(0, err);
    elev += m.rng.gauss(0, err);
    m.ball.kick(Math.cos(a), Math.sin(a), speed, clamp(elev, -0.02, 0.5), m.rng.gauss(0, 2), 0);
    m.ball.registerTouch(taker.id, taker.team);
    m.ball.intent = { type: 'shot', from: taker.id, team: taker.team, atTime: m.matchSeconds, penalty: true };
    taker.stats.shots++;
    m.stats.shots[taker.team]++;
    taker.anim.kickT = 1;
    // Keeper guesses.
    if (gk) {
      const guess = m.rng.chance(0.55) ? Math.sign(aimZ) : -Math.sign(aimZ);
      gk.penaltyDive = guess;
      gk.vz = guess * (5 + gk.eff('reflexes') / 20);
    }
    m.events.emit('shot', { player: taker, xg: 0.78, penalty: true });
    m.commentary.say('penaltyTaken', { player: taker });
    m.phase = PHASE.OPEN_PLAY;
  }

  distributeFromKeeper(gk) {
    const m = this.m;
    const dir = attackDir(gk.team);
    const tactics = m.teams[gk.team].brain.effTactics;
    gk.hasBall = false;
    m.ball.owner = -1;
    m.ball.ownerTeam = -1;

    // Throw short, or kick long?
    let best = null;
    let bestScore = -Infinity;
    for (const p of m.teams[gk.team].players) {
      if (p === gk || !p.onPitch) continue;
      const d = dist(gk.x, gk.z, p.x, p.z);
      if (d > 62) continue;
      const risk = laneRisk(m, gk.x, gk.z, p.x, p.z, gk.team, d < 26 ? 15 : 22, d > 26);
      const sp = spaceAt(m, p.x, p.z, gk.team, 9);
      const prog = (p.x - gk.x) * dir;
      const shortBias = (1 - tactics.directness) * clamp(1 - d / 34, 0, 1) * 2.2;
      const longBias = tactics.directness * clamp(d / 60, 0, 1) * 2.0 * (p.eff('heading') / 99 + 0.5);
      const score = (1 - risk) * 2.4 + sp * 1.2 + prog / 42 + shortBias + longBias;
      if (score > bestScore) { bestScore = score; best = p; }
    }

    if (best) {
      const d = dist(gk.x, gk.z, best.x, best.z);
      if (d < 26) {
        // Roll it out.
        executePass(m, gk, {
          target: { x: best.x, z: best.z }, receiver: best, subtype: 'feet',
          lofted: false, risk: 0.1, pressure: 0,
        });
      } else {
        executePass(m, gk, {
          target: { x: best.x + best.vx * 0.8, z: best.z + best.vz * 0.8 },
          receiver: best, subtype: 'space', lofted: true, risk: 0.35, pressure: 0,
        });
      }
    } else {
      executeClear(m, gk, { target: { x: gk.x + dir * 60, z: m.rng.range(-18, 18) } });
    }
    m.phase = PHASE.OPEN_PLAY;
    this.allowContacts = true;
  }
}
