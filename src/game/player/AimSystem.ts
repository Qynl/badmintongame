import { MathUtils, Vector3 } from 'three';
import type { PlayerController } from './PlayerController';
import type { AssistedShot } from './ShotPlanner';

/**
 * Assisted placement: the shuttle goes where you aim, not to a fixed spot on the
 * other side of the court. Where you look selects a landing point inside the
 * opponent's court; the shot you ask for selects how deep it is allowed to travel.
 * Everything here happens before contact — the outgoing flight stays physical.
 */

/** A selectable landing rectangle in player-relative court metres (net at z = 0, opponent baseline at z = -6.72). */
export interface AimBox { minX: number; maxX: number; minZ: number; maxZ: number }
/** Deliberate aim is kept just inside the singles lines; contact scatter can still push a shot out. */
export const COURT: AimBox = { minX: -2.35, maxX: 2.35, minZ: -6.3, maxZ: -0.45 };
/** Looking level or up sends it deep; about 17 degrees down brings it into the front court. */
const PITCH_DEEP = 0.05, PITCH_SHORT = -0.3;
/** A committed flick at the moment of the swing nudges placement inside the band. */
const FLICK_LATERAL = 0.005, FLICK_DEPTH = 0.004;

/** [shallowest z, deepest z] the requested shot may travel to. */
export function depthBand(intent: AssistedShot, flickY = 0, nearNet = false): [number, number] {
  if (intent === 'drop') return nearNet ? [-0.35, -1.4] : [-0.35, -1.95];
  if (intent === 'smash') return [-0.6, COURT.minZ];
  // A full swing stays deep unless you deliberately whip the mouse down: that is a flat push.
  return flickY > 25 ? [-0.8, COURT.minZ] : [-2.2, COURT.minZ];
}

/** The legal diagonal service box for the player's own serve. */
export function serviceBox(even: boolean): AimBox {
  const side = even ? -1 : 1;
  return { minX: Math.min(side * 2.35, side * 0.2), maxX: Math.max(side * 2.35, side * 0.2), minZ: -6.1, maxZ: -2.1 };
}

/** Clamp any landing point into the box the current shot is allowed to use. */
export function clampAim(target: Vector3, intent: AssistedShot, contactZ: number, box: AimBox = COURT): Vector3 {
  const [shortZ, deepZ] = depthBand(intent, 0, Math.abs(contactZ) < 2.2);
  return new Vector3(
    MathUtils.clamp(target.x, box.minX, box.maxX), 0,
    MathUtils.clamp(target.z, Math.max(box.minZ, deepZ), Math.min(box.maxZ, shortZ)),
  );
}

/** Read the player's look direction as a landing point on the opponent's court. */
export function aimFrom(player: PlayerController, intent: AssistedShot, flickX = 0, flickY = 0, box: AimBox = COURT, contactZ?: number): Vector3 {
  const reachZ = contactZ ?? player.position.z - 0.9;
  const [shortZ, deepZ] = depthBand(intent, flickY, Math.abs(reachZ) < 2.2);
  const deep = MathUtils.smoothstep(player.pitch, PITCH_SHORT, PITCH_DEEP);
  const z = MathUtils.clamp(MathUtils.lerp(shortZ, deepZ, deep) + flickY * FLICK_DEPTH, Math.max(box.minZ, deepZ), Math.min(box.maxZ, shortZ));
  // Sideways look swings the landing across the court; a glance over the shoulder stays central.
  const facing = Math.cos(player.yaw);
  const x = (facing > 0.15 ? player.position.x - Math.tan(player.yaw) * (player.position.z - z) : 0) + flickX * FLICK_LATERAL;
  return new Vector3(MathUtils.clamp(x, box.minX, box.maxX), 0, z);
}

/** Plain-language name for a landing point, so the placement choice is legible mid-rally. */
export function aimLabel(x: number, z: number): string {
  const depth = z < -5 ? 'DEEP' : z < -3.4 ? 'MID' : z < -1.8 ? 'FRONT' : 'AT THE NET';
  const side = x < -0.85 ? 'LEFT' : x > 0.85 ? 'RIGHT' : 'CENTRE';
  return `${depth} ${side}`;
}
