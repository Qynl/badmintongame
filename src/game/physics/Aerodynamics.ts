import { Vector3 } from 'three';
// Feather shuttle: 5 g; quadratic drag gives a ~6.7 m/s terminal fall speed.
export const GRAVITY = 9.81;
export const DRAG = 0.215;
export const SHUTTLE_RADIUS = 0.027;
export function integrateFlight(position: Vector3, velocity: Vector3, dt: number) {
  // Exact drag decay is stable even on a 90 m/s smash; gravity is semi-implicit.
  velocity.multiplyScalar(1 / (1 + DRAG * velocity.length() * dt));
  velocity.y -= GRAVITY * dt;
  position.addScaledVector(velocity, dt);
}
