import { MathUtils, Vector3 } from 'three';
import { planReturn, sampleFlight, solveLaunch } from '../ai/Prediction';
import { classifyShot } from '../physics/CollisionSystem';
import type { ShotType } from '../../state/gameStore';

export type AssistedShot = 'rally' | 'drop' | 'smash';
export interface PlannedShot { velocity: Vector3; shot: ShotType; feedback: string; attacking: boolean }

/** Intent selects a trajectory family, not a label. Every candidate is tested against the net and floor. */
export function planAssistedShot(from: Vector3, aimX: number, intent: AssistedShot, timed = false): PlannedShot {
  const x = MathUtils.clamp(aimX, -2.2, 2.2);
  if (intent === 'smash' && from.y >= 2.05) {
    let best: { velocity: Vector3; score: number } | null = null;
    // A true smash must leave downwards; never silently turn the requested attack into a clear.
    for (const depth of [3.2, 4.4, 5.1]) {
      const target = new Vector3(x, 0, -depth);
      for (const verticalSpeed of [-10, -6, -3, -1, -0.3]) {
        const velocity = solveLaunch(from, target, verticalSpeed), flight = sampleFlight(from, velocity);
        const speed = velocity.length();
        if (flight.netY === null || flight.netY < 1.61 || flight.landing.distanceTo(target) > 0.3 || speed < 23 || speed > 85) continue;
        const preferredSpeed = timed ? 70 : 43;
        const score = Math.abs(speed - preferredSpeed) + Math.abs(depth - 4.4) * 2;
        if (!best || score < best.score) best = { velocity, score };
      }
    }
    if (best) return { velocity: best.velocity, shot: classifyShot(best.velocity, from), attacking: true,
      feedback: timed ? 'Timed smash. Take the space your attack creates.' : 'Smash. Recover quickly—watch for the block.' };
  }
  const lowAttack = intent === 'smash';
  const soft = intent === 'drop';
  const close = Math.abs(from.z) < 2.2;
  const depth = soft ? close ? 0.9 : 1.35 : lowAttack ? 4.2 : 5.5;
  const loft = soft ? close ? 2.1 : 1.5 : lowAttack ? 2 : 10.5;
  const target = new Vector3(x, 0, -depth);
  const plan = planReturn(from, target, loft, soft ? 0.10 : 0.20);
  const shot = classifyShot(plan.velocity, from, plan.landing);
  return { velocity: plan.velocity, shot, attacking: false,
    feedback: lowAttack ? `${from.y < 2.05 ? 'Low contact' : 'No clean downward angle'}—${shot.toLowerCase()}. Take the next one higher for a smash.`
      : soft ? shot !== 'Drop' && shot !== 'Net shot' ? `Low pickup—${shot.toLowerCase()}. Meet it higher for a shorter drop.` : close ? 'Soft hands. Make them reach over the tape.' : 'Drop. Bring them forward, then use the back court.'
      : 'Deep return. Watch for a short reply you can attack.' };
}
