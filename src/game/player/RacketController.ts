import { Euler, MathUtils, Quaternion, Vector2, Vector3 } from 'three';
import type { PlayerController } from './PlayerController';
export class RacketController {
  center = new Vector3(); previous = new Vector3(); velocity = new Vector3();
  normal = new Vector3(0, 0, -1); rotation = new Quaternion(); previousRotation = new Quaternion(); angularVelocity = new Vector3();
  private strokeTilt = 0;
  private gripBlend = 0;
  private gestureVelocity = new Vector2();
  wrist = new Vector3(); radiusX = 0.145; radiusY = 0.195;
  gesture = new Vector2(); vibration = 0; active = false; travel = 0;
  private local = new Vector3(); private localRotation = new Quaternion(); private euler = new Euler();
  private initialized = false;
  step(dt: number, player: PlayerController, dx: number, dy: number, swinging: boolean, sensitivity: number, serving = false) {
    this.previous.copy(this.center); this.previousRotation.copy(this.rotation);
    this.active = swinging;
    const oldX = this.gesture.x, oldY = this.gesture.y;
    if (!this.initialized) this.gripBlend = serving ? 1 : 0;
    this.gripBlend = MathUtils.damp(this.gripBlend, serving ? 1 : 0, 5, dt);
    if (swinging) {
      this.gesture.x = MathUtils.clamp(this.gesture.x + dx * 0.007 * sensitivity, -1.7, 1.3);
      this.gesture.y = MathUtils.clamp(this.gesture.y - dy * 0.007 * sensitivity, -1.2, 1.8);
      this.gestureVelocity.set((this.gesture.x - oldX) / dt, (this.gesture.y - oldY) / dt).clampLength(0, 18);
    } else {
      // Exact critically damped recovery retains a short, natural follow-through.
      const decay = Math.exp(-12 * dt);
      const cx = this.gestureVelocity.x + 12 * oldX, cy = this.gestureVelocity.y + 12 * oldY;
      this.gesture.set((oldX + cx * dt) * decay, (oldY + cy * dt) * decay);
      this.gestureVelocity.set((this.gestureVelocity.x - 12 * cx * dt) * decay, (this.gestureVelocity.y - 12 * cy * dt) * decay);
      this.gesture.x = MathUtils.clamp(this.gesture.x, -1.7, 1.3); this.gesture.y = MathUtils.clamp(this.gesture.y, -1.2, 1.8);
    }
    const g = this.gesture;
    // Mouse traces a reach envelope about the shoulder; no shot animation or shot buttons.
    const extension = Math.min(0.7, Math.abs(g.y) * MathUtils.lerp(0.37, 0.6, this.gripBlend) + Math.abs(g.x) * 0.2);
    this.local.set(0.34 + g.x * 0.46, -0.05 + g.y * MathUtils.lerp(0.54, 0.16, this.gripBlend) - (this.gripBlend * 0.61), -0.95 - extension);
    this.center.copy(this.local).applyQuaternion(player.rotation).add(player.head);
    this.strokeTilt = MathUtils.damp(this.strokeTilt, swinging && !serving ? MathUtils.clamp(-dy / dt * 0.0003, -0.95, 0.7) : 0, 38, dt);
    this.localRotation.setFromEuler(this.euler.set(MathUtils.lerp(0.24, 0.65, this.gripBlend) + g.y * 0.3 + this.strokeTilt, -g.x * 0.38, MathUtils.lerp(-0.15, Math.PI - 0.3, this.gripBlend) - g.x * 0.3));
    this.rotation.copy(player.rotation).multiply(this.localRotation);
    this.normal.set(0, 0, -1).applyQuaternion(this.rotation);
    this.wrist.set(0, -0.53, 0).applyQuaternion(this.rotation).add(this.center);
    if (this.initialized) this.velocity.subVectors(this.center, this.previous).divideScalar(dt);
    else { this.previous.copy(this.center); this.previousRotation.copy(this.rotation); this.initialized = true; }
    const deltaRotation = this.rotation.clone().multiply(this.previousRotation.clone().invert()).normalize();
    if (deltaRotation.w < 0) { deltaRotation.x *= -1; deltaRotation.y *= -1; deltaRotation.z *= -1; deltaRotation.w *= -1; }
    const angle = 2 * Math.acos(MathUtils.clamp(deltaRotation.w, -1, 1));
    this.angularVelocity.set(deltaRotation.x, deltaRotation.y, deltaRotation.z);
    if (angle > 0.0001) this.angularVelocity.normalize().multiplyScalar(angle / dt); else this.angularVelocity.set(0, 0, 0);
    this.travel += this.velocity.length() * dt;
    this.vibration *= Math.exp(-17 * dt);
  }
}
