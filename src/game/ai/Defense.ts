import { Vector3 } from 'three';
import { integrateFlight } from '../physics/Aerodynamics';

/** Search the whole descending flight, not just the first shoulder-height point.
 * Reach includes a racket, but movement has the same acceleration budget as the AI.
 * An unreachable shot stays unreachable: the fallback only tells the feet where to chase.
 */
export function defensiveIntercept(from: Vector3, velocity: Vector3, body: Vector3, motion: Vector3, speed: number, reach = 1.4) {
  const p = from.clone(), v = velocity.clone();
  let best = p.clone(), bestGap = Infinity, time = 0, reachable = false;
  for (let i = 1; i <= 420; i++) {
    integrateFlight(p, v, 1 / 120);
    if (p.y < 0.25) break;
    if (p.z > -0.2 || p.y > 3.05 || v.y > 0) continue;
    const t = i / 120, dx = p.x - body.x, dz = p.z - body.z, distance = Math.hypot(dx, dz);
    const carry = (motion.x * dx + motion.z * dz) / Math.max(0.01, distance);
    const movement = Math.max(0, speed * t + (carry - speed) * (1 - Math.exp(-8 * t)) / 8);
    const gap = distance - movement - reach;
    if (gap < bestGap) { bestGap = gap; best.copy(p); time = t; }
    if (gap <= 0) { reachable = true; break; }
  }
  return { position: best, time, reachable };
}
