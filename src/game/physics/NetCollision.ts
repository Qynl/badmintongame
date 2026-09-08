import { MathUtils } from 'three';
import type { ShuttlecockPhysics } from '../shuttle/ShuttlecockPhysics';
export const netHeight = (x: number) => 1.524 + 0.026 * (Math.min(Math.abs(x), 3.05) / 3.05) ** 2;
export type NetEvent = 'net' | 'tape' | 'under' | 'over' | null;
/** Swept crossing of the sagged tape and mesh. A top-tape graze can remain a legal live shot. */
export function netCrossing(shuttle: ShuttlecockPhysics): NetEvent {
  const previous = shuttle.previous, current = shuttle.position;
  if (previous.z * current.z > 0 || previous.z === current.z) return null;
  const t = previous.z / (previous.z - current.z);
  const y = MathUtils.lerp(previous.y, current.y, t), x = MathUtils.lerp(previous.x, current.x, t);
  const height = netHeight(x);
  if (Math.abs(x) > 3.08) return 'over'; // Legal around-post flight; landing rules still apply.
  if (y < 0.755) return 'under';
  if (y > height + 0.027) return 'over';
  const approach = Math.sign(previous.z) || -Math.sign(shuttle.velocity.z);
  if (y >= height) {
    // Cork clips the upper tape: friction removes speed, the rounded edge lifts it.
    current.z = -approach * 0.04; current.y = height + 0.03;
    const forwardSpeed = Math.abs(shuttle.velocity.z);
    shuttle.velocity.multiplyScalar(0.58);
    shuttle.velocity.y = Math.max(0.65, Math.abs(shuttle.velocity.y) * 0.3 + forwardSpeed * 0.025);
    return 'tape';
  }
  current.z = approach * 0.04;
  shuttle.velocity.z *= -0.08; shuttle.velocity.x *= 0.3; shuttle.velocity.y *= 0.25;
  return 'net'; // Continue falling; do not teleport away on contact with the mesh.
}
