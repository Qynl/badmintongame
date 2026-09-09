import { PITCH, BALL } from '../sim/constants.js';
import { clamp, dist, lerp, smoothstep, normalise } from '../sim/math.js';
import { attackDir, ownGoalX, timeToReach, threatValue } from '../sim/analysis.js';

// ---------------------------------------------------------------------------
// GOALKEEPER AI
//
// Keepers position on the bisector of the shooting angle, adjust depth based on
// danger, come for through balls they can win, sweep behind a high line, and
// dive for shots with a save probability driven by reflexes/handling and the
// geometry of the shot.  They also start attacks.
// ---------------------------------------------------------------------------

const tmp = { x: 0, y: 0, z: 0 };

export function goalkeeperUpdate(world, p, dt) {
  const ball = world.ball;
  const dir = attackDir(p.team);
  const gx = ownGoalX(p.team);
  const tb = world.teams[p.team].brain;

  const distToBall = dist(p.x, p.z, ball.x, ball.z);
  const ballAdvanced = ball.x * dir; // negative = near our goal

  // --- Shot-stopping ---
  // Compute where the ball will cross the goal line and drive the keeper to
  // that point. Reaction time and dive speed decide whether they get there:
  // a well-placed shot beats them, a tame one does not. No dice roll.
  const towardOurGoal = (gx - ball.x) * ball.vx > 0.5;
  if (towardOurGoal && ball.owner === -1 && Math.abs(ball.x - gx) < 45 && ball.speed3 > 5) {
    const vxAbs = Math.max(0.5, Math.abs(ball.vx));
    const tArrive = Math.abs(ball.x - gx) / vxAbs;
    if (tArrive < 2.5) {
      ball.predict(tArrive, tmp);
      const onTarget = Math.abs(tmp.z) < PITCH.halfGoalWidth + 2.2 &&
                       tmp.y < PITCH.goalHeight + 1.0;
      if (onTarget) {
        const react = 0.10 + (1 - p.eff('reactions') / 99) * 0.16;
        if (ball.touchTimer >= react) {
          const targetZ = clamp(tmp.z, -PITCH.halfGoalWidth - 1.2, PITCH.halfGoalWidth + 1.2);
          const diveSpeed = 4.2 + (p.eff('reflexes') / 99) * 5.2;
          const dz = targetZ - p.z;
          const adz = Math.abs(dz);
          // Set velocity toward the save point and let integrate() move them,
          // so the dive is a real physical motion, not a teleport.
          const vz = clamp(dz / Math.max(dt, tArrive * 0.55), -diveSpeed, diveSpeed);
          p.vz = vz;
          // Advance slightly to close the angle.
          const targetX = gx + dir * clamp(1.6 - tArrive * 0.5, 0.1, 2.2);
          p.vx = clamp((targetX - p.x) / Math.max(dt, 0.25), -4, 4);
          p.facing = Math.atan2(ball.z - p.z, ball.x - p.x);
          p.anim.state = adz > 1.0 ? 'slide' : 'run';
          p.diving = adz > 0.8 ? Math.sign(dz) : 0;
          p.diveHeight = tmp.y;
          p.targetX = targetX;
          p.targetZ = targetZ;
          return;
        }
      }
    }
  }
  p.diving = 0;

  // --- Sweeping: come out for balls in behind our line ---
  const sweeperLicence = 0.4 + tb.effTactics.defensiveLine * 0.6;
  const maxSweep = 12 + sweeperLicence * 16;
  let sweepTarget = null;
  if (world.possessionTeam !== p.team) {
    // Look for a loose ball / through ball in our area we can win.
    let bestT = 99;
    for (let t = 0.15; t <= 1.9; t += 0.12) {
      ball.predict(t, tmp);
      if (tmp.y > 2.4) continue;
      const fromGoal = Math.abs(tmp.x - gx);
      if (fromGoal > maxSweep) continue;
      if (Math.abs(tmp.z) > PITCH.penaltyAreaHalfWidth + 4) continue;
      const myT = timeToReach(p, tmp.x, tmp.z, 1) * 0.92;
      if (myT > t + 0.1) continue;
      // Is an attacker going to get there first?
      let oppFirst = false;
      for (const o of world.teams[1 - p.team].players) {
        if (!o.onPitch) continue;
        const ot = timeToReach(o, tmp.x, tmp.z, 1);
        if (ot < myT - 0.12) { oppFirst = true; break; }
      }
      if (!oppFirst) { bestT = t; sweepTarget = { x: tmp.x, z: tmp.z }; break; }
    }
  }

  let tx;
  let tz;
  let intensity;
  if (sweepTarget) {
    tx = sweepTarget.x; tz = sweepTarget.z; intensity = 1;
    p.brain.intent = 'sweep';
  } else if (world.possessionTeam === p.team && ballAdvanced > -20) {
    // We're on the ball upfield: push up as an extra passing option.
    tx = gx + dir * clamp(10 + ballAdvanced * 0.28, 4, 26);
    tz = ball.z * 0.24;
    intensity = 0.4;
    p.brain.intent = 'support';
  } else {
    // Standard positioning: on the bisector of the goal, depth by danger.
    const bx = ball.x;
    const bz = ball.z;
    const dGoal = dist(bx, bz, gx, 0);
    // Depth off the line: further out when the ball is far, tighter when close.
    const depth = clamp(smoothstep(6, 32, dGoal) * 4.6 + 0.6, 0.5, 5.2) *
                  (0.75 + (p.eff('gkPositioning') / 99) * 0.5);
    const [nx, nz] = normalise(bx - gx, bz - 0);
    tx = gx + nx * depth;
    tz = clamp(nz * depth * 1.9, -PITCH.halfGoalWidth - 1.6, PITCH.halfGoalWidth + 1.6);
    // Track across with the ball when it's wide.
    tz = clamp(tz + bz * 0.06, -PITCH.halfGoalWidth - 2.2, PITCH.halfGoalWidth + 2.2);
    intensity = dGoal < 30 ? 0.6 : 0.32;
    p.brain.intent = 'guard';
  }

  // Never wander off the pitch, too far from goal, or BEHIND the goal line.
  const fromGoal = Math.abs(tx - gx);
  if (fromGoal > maxSweep) tx = gx + dir * maxSweep;
  // Keep the keeper strictly in front of their own line.
  tx = dir > 0 ? Math.max(tx, gx + 0.35) : Math.min(tx, gx - 0.35);
  tz = clamp(tz, -PITCH.penaltyAreaHalfWidth + 1, PITCH.penaltyAreaHalfWidth - 1);

  p.targetX = tx;
  p.targetZ = tz;
  p.steer(tx, tz, intensity, dt);
  p.faceToward(ball.x, ball.z);
}

// Does the keeper save this shot?
// Called when the ball arrives in the keeper's zone. The answer comes from
// geometry: how far the ball is from the keeper's reachable envelope at the
// moment it crosses the line.
export function attemptSave(world, gk, ball) {
  const gx = ownGoalX(gk.team);
  const vxAbs = Math.max(1.5, Math.abs(ball.vx));
  const tArrive = Math.max(0, Math.abs(ball.x - gx) / vxAbs);
  ball.predict(tArrive, tmp);
  const targetZ = tmp.z;
  const targetY = clamp(tmp.y, 0, PITCH.goalHeight);

  // Static reach envelope (arms out, standing / already diving).
  const armReach = 1.15 + (gk.eff('reflexes') / 99) * 0.55;
  // Extra ground covered by continuing the dive. Measure the time the keeper
  // has HAD since the shot was struck, not just the sliver of flight left --
  // by the time we resolve the save they have already been moving.
  const react = 0.10 + (1 - gk.eff('reactions') / 99) * 0.16;
  const diveSpeed = 4.2 + (gk.eff('reflexes') / 99) * 5.2;
  const totalFlight = Math.max(tArrive, ball.touchTimer);
  const diveTime = clamp(totalFlight - react, 0, 1.1);
  const diveReach = diveSpeed * diveTime * 0.55;

  // The keeper has already travelled toward the save point during the flight,
  // so measure the remaining gap from where they are now.
  // If the keeper is already moving toward the save point, credit that
  // momentum -- they will keep travelling during the remaining flight.
  const dirToTarget = Math.sign(targetZ - gk.z) || 1;
  const momentumGain = clamp(gk.vz * dirToTarget * tArrive, 0, 1.6);

  const lateralGap = Math.abs(targetZ - gk.z) - armReach - diveReach - momentumGain;
  // Vertical: high shots require getting airborne, low ones going to ground.
  const heightCost = targetY > 1.55
    ? (targetY - 1.55) * 0.75                     // top-corner tax
    : targetY < 0.4 ? (0.4 - targetY) * 0.35 : 0; // low shot tax

  // Negative gap = comfortably within reach.
  let p = smoothstep(0.85, -0.55, lateralGap + heightCost);
  // A rocket gives less time to adjust even inside the envelope.
  p *= clamp(1.22 - ball.speed3 / 46, 0.42, 1.05);
  // Handling/composure fine-tune.
  p *= 0.70 + (gk.eff('handling') / 99) * 0.34;
  p *= gk.condition;
  return clamp(p, 0.015, 0.965);
}
