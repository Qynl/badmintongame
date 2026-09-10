import { Vector3 } from 'three';
import { integrateFlight } from '../physics/Aerodynamics';
import type { PlayerController } from './PlayerController';
import type { ShuttlecockPhysics } from '../shuttle/ShuttlecockPhysics';

/**
 * When to swing. A stroke needs a little travel, so the useful press is shortly *before*
 * contact: inside this window the swing is full power, outside it the return is weak.
 */
export const STRIKE_EARLY = 0.42;
export const STRIKE_LATE = 0.06;

const probe = new Vector3(), probeVelocity = new Vector3();

/** Seconds until the incoming shuttle enters the guided strike zone, or -1 if it never will. */
export function timeToStrike(player: PlayerController, shuttle: ShuttlecockPhysics, horizon = 1.4): number {
  if (!shuttle.active || (shuttle.served && shuttle.lastHit === 0)) return -1;
  probe.copy(shuttle.position); probeVelocity.copy(shuttle.velocity);
  const forwardX = -Math.sin(player.yaw), forwardZ = -Math.cos(player.yaw);
  const steps = Math.ceil(horizon * 90);
  for (let i = 1; i <= steps; i++) {
    integrateFlight(probe, probeVelocity, 1 / 90);
    if (probe.y <= 0.05) return -1;
    const dx = probe.x - player.position.x, dz = probe.z - player.position.z;
    if (probe.z <= 0.15) continue;
    if (dx * forwardX + dz * forwardZ <= 0) continue;
    const relativeY = probe.y - player.position.y;
    // 1.7 m matches the guided contact moment to about 35 ms on average (measured),
    // which is what the on-screen timing ring and the power window are keyed to.
    if (relativeY > 0.3 && relativeY < 3.1 && Math.hypot(dx, dz) < 1.7) return i / 90;
  }
  return -1;
}

export function inStrikeWindow(seconds: number) {
  return seconds >= 0 && seconds <= STRIKE_EARLY && seconds >= STRIKE_LATE;
}
