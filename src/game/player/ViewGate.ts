import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { PlayerController } from './PlayerController';

/**
 * Gameplay renders through a 72° vertical camera, so that is the cone a swing is allowed in.
 * The horizontal cone follows the viewport: a widescreen shows more court than a portrait
 * window, and the gate should match what is actually on screen. A small margin keeps a shuttle
 * just off the frame hittable, so the gate reads as "eyes on the ball", not a keyhole.
 */
export const VIEW_FOV = 72;
export const VIEW_ASPECT = 16 / 9;
export const VIEW_MARGIN = 1.2;
const forward = new Vector3(), right = new Vector3(), up = new Vector3(), to = new Vector3();
const euler = new Euler(), spin = new Quaternion();

/** Half the vertical view angle, for a given field of view. */
export const halfViewAngle = (fov = VIEW_FOV) => Math.tan(MathUtils.degToRad(fov / 2));

/**
 * True when the point falls inside the player's view cone.
 *
 * Assisted contact is gated on this: you have to be looking at the shuttle to hit it. Until now
 * a swing connected with anything inside arm's reach even while you stared at the ceiling or the
 * far corner, which is what made holding the button down a strategy. This is derived from the
 * player's own yaw and pitch — the same angles the camera is built from — and ignores the
 * sub-centimetre head bob and roll, which cannot move a point across a 36° boundary.
 */
export function inView(player: PlayerController, point: Vector3, aspect = VIEW_ASPECT, fov = VIEW_FOV): boolean {
  const eyeY = player.position.y + player.eyeHeight;
  to.set(point.x - player.position.x, point.y - eyeY, point.z - player.position.z);
  if (to.lengthSq() < 0.0625) return true; // it is at the strings, not something you can look at
  // Same construction the camera uses, minus the negligible head-bob roll.
  spin.setFromEuler(euler.set(player.pitch, player.yaw, 0));
  forward.set(0, 0, -1).applyQuaternion(spin);
  const depth = to.dot(forward);
  if (depth <= 0.0001) return false; // behind you
  right.set(1, 0, 0).applyQuaternion(spin);
  up.set(0, 1, 0).applyQuaternion(spin);
  const halfV = halfViewAngle(fov) * VIEW_MARGIN;
  return Math.abs(to.dot(right)) <= halfV * aspect * depth && Math.abs(to.dot(up)) <= halfV * depth;
}
