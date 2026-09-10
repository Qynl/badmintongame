import { MathUtils, Quaternion, Vector3 } from 'three';
import type { RacketController } from '../player/RacketController';
import type { ShuttlecockPhysics } from '../shuttle/ShuttlecockPhysics';
import type { ContactQuality, ShotType } from '../../state/gameStore';
export interface Contact { quality: ContactQuality; shot: ShotType; speed: number; offset: number; point: [number, number]; incidence: number; timed?: boolean; feedback?: string; target?: Vector3 }
const a = new Vector3(), b = new Vector3(), p = new Vector3(), inv = new Quaternion(), relative = new Vector3();
export function racketContact(shuttle: ShuttlecockPhysics, racket: RacketController): Contact | null {
  if (!shuttle.active || shuttle.hitCooldown > 0) return null;
  // Continuous collision of relative motion against the elliptical string-bed plane.
  inv.copy(racket.previousRotation).invert();
  a.subVectors(shuttle.previous, racket.previous).applyQuaternion(inv);
  inv.copy(racket.rotation).invert();
  b.subVectors(shuttle.position, racket.center).applyQuaternion(inv);
  if (Math.sign(a.z) === Math.sign(b.z) && Math.min(Math.abs(a.z), Math.abs(b.z)) > 0.045) return null;
  const t = MathUtils.clamp(a.z / (a.z - b.z || 0.00001), 0, 1);
  p.lerpVectors(a, b, t);
  const offset = Math.hypot(p.x / (racket.radiusX + 0.027), p.y / (racket.radiusY + 0.027));
  if (offset > 1) return null;
  const impactRotation = racket.previousRotation.clone().slerp(racket.rotation, t);
  const arm = p.clone().applyQuaternion(impactRotation);
  const impactVelocity = racket.angularVelocity.clone().cross(arm).add(racket.velocity);
  relative.subVectors(impactVelocity, shuttle.velocity);
  const face = new Vector3(0, 0, -1).applyQuaternion(impactRotation);
  if (relative.dot(face) < 0) face.negate();
  const normalSpeed = relative.dot(face);
  if (normalSpeed < 0.3) return null;
  const timing = relative.clone().normalize().dot(face);
  const quality: ContactQuality = offset > 0.72 ? 'Off-center' : timing < 0.42 ? (racket.gesture.y > 0 ? 'Early' : 'Late') : offset < 0.34 && timing > 0.78 ? 'Perfect' : 'Good';
  const efficiency = 1 - offset * offset * 0.42;
  // Restitution transfers normal face velocity; tangential stroke adds slice.
  const outgoing = shuttle.velocity.clone().addScaledVector(face, normalSpeed * 1.62 * efficiency).addScaledVector(impactVelocity, 0.32 * efficiency);
  if (quality === 'Off-center') outgoing.x += p.x * normalSpeed * 1.5;
  outgoing.clampLength(0, 95);
  shuttle.velocity.copy(outgoing); shuttle.hitCooldown = 0.20; shuttle.lastHit = 0; shuttle.crossedNet = false;
  racket.vibration = Math.min(1, normalSpeed / 20);
  const wasServe = !shuttle.served; shuttle.served = true;
  const speed = outgoing.length();
  return { quality, shot: wasServe ? 'Serve' : classifyShot(outgoing, shuttle.position), speed, offset, point: [p.x / racket.radiusX, p.y / racket.radiusY], incidence: timing };
}
export function classifyShot(velocity: Vector3, position: Vector3, landing?: Vector3): ShotType {
  const speed = velocity.length(), slope = velocity.y / Math.max(0.1, Math.hypot(velocity.x, velocity.z));
  if (position.y > 2.0 && velocity.y < -0.2 && speed > 22) return 'Smash';
  if (Math.abs(position.z) < 2.2 && speed < 8) return 'Net shot';
  if (landing && landing.z * position.z < 0 && Math.abs(landing.z) < 2.1 && position.y > 1.5) return 'Drop';
  if (slope > 0.48) return position.y < 1.5 ? 'Lift' : 'Clear';
  if (speed < 11 && position.y > 1.6) return 'Drop';
  if (speed < 13) return 'Push';
  return 'Drive';
}
export { netCrossing } from './NetCollision';
