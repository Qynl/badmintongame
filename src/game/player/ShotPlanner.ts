import { MathUtils, Vector3 } from 'three';
import { planReturn, sampleFlight, solveLaunch } from '../ai/Prediction';
import { classifyShot } from '../physics/CollisionSystem';
import { COURT, aimLabel, clampAim } from './AimSystem';
import type { ShotType } from '../../state/gameStore';

export type AssistedShot = 'rally' | 'drop' | 'smash';
export interface PlannedShot { velocity: Vector3; shot: ShotType; feedback: string; attacking: boolean }
/** A full landing point, or — for callers that only care about the side — an x with the default depth for the shot. */
export type AimInput = Vector3 | number;

function resolveTarget(from: Vector3, aim: AimInput, intent: AssistedShot): Vector3 {
  if (aim instanceof Vector3) return clampAim(aim, intent, from.z, COURT);
  const close = Math.abs(from.z) < 2.2;
  const depth = intent === 'drop' ? (close ? 0.9 : 1.35) : intent === 'smash' ? 4.4 : 5.5;
  return new Vector3(MathUtils.clamp(aim, -2.2, 2.2), 0, -depth);
}

function placement(landing: Vector3, target: Vector3) {
  const distance = Math.hypot(landing.x - target.x, landing.z - target.z);
  return distance < 0.5 ? `On the mark · ${aimLabel(landing.x, landing.z).toLowerCase()}`
    : `${aimLabel(landing.x, landing.z)} · ${distance.toFixed(1)} m off the mark`;
}

/**
 * The intent selects a trajectory family; the aim selects where it lands.
 * Every candidate is tested against the net and the floor before contact.
 */
export function planAssistedShot(from: Vector3, aim: AimInput, intent: AssistedShot, timed = false, power = 1): PlannedShot {
  const target = resolveTarget(from, aim, intent);
  if (intent === 'smash' && from.y >= 2.05) {
    let best: { velocity: Vector3; score: number } | null = null;
    // A true smash must leave downwards; never silently turn the requested attack into a clear.
    for (const offset of [0, -0.7, 0.7, -1.3, 1.3]) {
      const depth = MathUtils.clamp(target.z + offset, -6.72, -0.4);
      const candidate = new Vector3(MathUtils.clamp(target.x + offset * 0.12, -2.59, 2.59), 0, depth);
      for (const verticalSpeed of [-10, -6, -3, -1, -0.3]) {
        const velocity = solveLaunch(from, candidate, verticalSpeed), flight = sampleFlight(from, velocity);
        const speed = velocity.length();
        if (flight.netY === null || flight.netY < 1.61 || flight.landing.distanceTo(candidate) > 0.3 || speed < 23 || speed > 85) continue;
        // Racket-head speed follows the swing: a fresh, timed strike carries the attack.
        const preferredSpeed = (26 + 44 * MathUtils.clamp(power, 0.42, 1)) * (timed ? 1 : 0.62);
        const score = Math.abs(speed - preferredSpeed) + Math.abs(depth - target.z) * 2 + Math.abs(candidate.x - target.x) * 2;
        if (!best || score < best.score) best = { velocity, score };
      }
    }
    if (best) return { velocity: best.velocity, shot: classifyShot(best.velocity, from), attacking: true,
      feedback: timed ? `Timed smash into the ${aimLabel(target.x, target.z).toLowerCase()}.` : `Smash ${aimLabel(target.x, target.z).toLowerCase()}. Recover quickly—watch for the block.` };
  }
  const lowAttack = intent === 'smash';
  const soft = intent === 'drop';
  // Loft follows the placement: a deep aim is lifted, a short aim is driven flat.
  const loftFor = (candidate: Vector3) => {
    const reach = Math.hypot(candidate.x - from.x, candidate.z - from.z);
    return soft ? (Math.abs(from.z) < 2.2 ? 2.1 : 1.5) : lowAttack ? 2 : reach > 6.5 ? 10.5 : reach > 3.4 ? 6.4 : 3.2;
  };
  // A very short aim from a low contact cannot both clear the tape and stop in time.
  // Deepen the landing until the shot is real, instead of lobbing it and calling it a drop.
  let plan = planReturn(from, target, loftFor(target), soft ? 0.10 : 0.20);
  let placed = target;
  const lift = soft ? 7 : 16;
  for (const extra of [-0.45, -0.95, -1.5, -2.1]) {
    if (plan.netY !== null && plan.netY >= 1.55 + (soft ? 0.1 : 0.2) && plan.landing.distanceTo(placed) < 0.55 && plan.velocity.y <= lift) break;
    placed = new Vector3(target.x, 0, MathUtils.clamp(target.z + extra, COURT.minZ, COURT.maxZ));
    plan = planReturn(from, placed, loftFor(placed), soft ? 0.10 : 0.20);
  }
  const reach = Math.hypot(placed.x - from.x, placed.z - from.z);
  const shot = classifyShot(plan.velocity, from, plan.landing);
  return { velocity: plan.velocity, shot, attacking: false,
    feedback: lowAttack ? `${from.y < 2.05 ? 'Low contact' : 'No clean downward angle'}—${shot.toLowerCase()}. Take the next one higher for a smash.`
      : soft ? shot !== 'Drop' && shot !== 'Net shot' ? `Low pickup—${shot.toLowerCase()}. Meet it higher for a shorter drop.` : `${placement(plan.landing, target)} touch.`
      : reach > 6.5 ? `${placement(plan.landing, target)} clear. Watch for a short reply you can attack.`
      : `${placement(plan.landing, target)} ${shot.toLowerCase()}. Move them, then use the space.` };
}
