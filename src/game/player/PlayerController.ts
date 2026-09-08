import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { InputManager } from '../input/InputManager';
import type { Settings } from '../../state/gameStore';
export class PlayerController {
  position = new Vector3(0.9, 0, 4.3);
  velocity = new Vector3();
  yaw = 0; pitch = -0.05; eyeHeight = 1.68; stepPhase = 0; landing = 0;
  rotation = new Quaternion();
  head = new Vector3();
  private wish = new Vector3();
  private euler = new Euler(0, 0, 0, 'YXZ');
  step(dt: number, input: InputManager, settings: Settings, mouseX: number, mouseY: number): { landed: boolean; hardTurn: boolean } {
    const lookScale = (input.swinging || (settings.controls === 'assisted' && input.dropHeld)) ? settings.controls === 'assisted' ? 0.5 : 0.16 : 1;
    this.yaw -= mouseX * 0.0018 * settings.sensitivity * lookScale;
    this.pitch = MathUtils.clamp(this.pitch - mouseY * 0.0018 * settings.sensitivity * lookScale, -1.25, 1.25);
    const x = Number(input.keys.has('KeyD')) - Number(input.keys.has('KeyA'));
    const z = Number(input.keys.has('KeyS')) - Number(input.keys.has('KeyW'));
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const topSpeed = sprint ? 5.6 : 3.5;
    this.wish.set(x, 0, z).normalize().applyAxisAngle(new Vector3(0, 1, 0), this.yaw).multiplyScalar(topSpeed * (z > 0 ? 0.78 : 1));
    const oldSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const turning = this.wish.x * this.velocity.x + this.wish.z * this.velocity.z < -2;
    // Bounded acceleration: direction changes require a planted step.
    const acceleration = this.position.y > 0 ? 7 : (turning ? 16 : 22);
    const dx = this.wish.x - this.velocity.x, dz = this.wish.z - this.velocity.z;
    const length = Math.hypot(dx, dz);
    const factor = Math.min(1, acceleration * dt / Math.max(length, 0.0001));
    this.velocity.x += dx * factor; this.velocity.z += dz * factor;
    if (input.jump && this.position.y === 0) this.velocity.y = 4.0;
    input.jump = false;
    this.velocity.y -= 12 * dt;
    this.position.addScaledVector(this.velocity, dt);
    let landed = false;
    if (this.position.y < 0) { landed = this.velocity.y < -1.5; this.position.y = 0; this.velocity.y = 0; if (landed) this.landing = 0.065; }
    const px = this.position.x, pz = this.position.z;
    this.position.x = MathUtils.clamp(px, -4.4, 4.4); this.position.z = MathUtils.clamp(pz, 0.5, 8.4);
    if (this.position.x !== px) this.velocity.x = 0;
    if (this.position.z !== pz) this.velocity.z = 0;
    this.stepPhase += oldSpeed * dt * 2.9;
    this.landing *= Math.exp(-9 * dt);
    const bob = settings.headMotion ? Math.sin(this.stepPhase * 2) * Math.min(oldSpeed, 4) * 0.003 : 0;
    this.head.copy(this.position).y += this.eyeHeight + bob - (settings.headMotion ? this.landing : 0);
    this.rotation.setFromEuler(this.euler.set(this.pitch, this.yaw, settings.headMotion ? -this.velocity.x * 0.002 : 0));
    return { landed, hardTurn: turning && oldSpeed > 2.5 };
  }
}
