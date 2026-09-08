import { Quaternion, Vector3 } from 'three';
import { integrateFlight } from '../physics/Aerodynamics';
export class ShuttlecockPhysics {
  position = new Vector3(0, 1.5, 4);
  previous = this.position.clone();
  velocity = new Vector3();
  orientation = new Quaternion();
  spin = 0;
  active = false;
  visible = false;
  lastHit: 0 | 1 = 0;
  hitCooldown = 0;
  crossedNet = false;
  served = false;
  path: Vector3[] = [];
  private axis = new Vector3(0, 1, 0);
  private direction = new Vector3();
  private targetRotation = new Quaternion();
  reset(position: Vector3, velocity = new Vector3()) {
    this.position.copy(position); this.previous.copy(position); this.velocity.copy(velocity);
    this.active = true; this.visible = true; this.path = []; this.hitCooldown = 0; this.crossedNet = false; this.served = false;
  }
  step(dt: number) {
    if (!this.active) return;
    this.previous.copy(this.position);
    integrateFlight(this.position, this.velocity, dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    if (this.velocity.lengthSq() > 0.2) {
      this.direction.copy(this.velocity).normalize().negate();
      this.targetRotation.setFromUnitVectors(this.axis, this.direction);
      this.orientation.slerp(this.targetRotation, 1 - Math.exp(-14 * dt));
    }
    this.spin += dt * (5 + this.velocity.length() * 0.35);
  }
  record() { this.path.push(this.position.clone()); if (this.path.length > 140) this.path.shift(); }
}
