import { Vector3 } from 'three';
import type { ShuttlecockPhysics } from '../shuttle/ShuttlecockPhysics';
import { predictFlight, planReturn, planIntercept } from './Prediction';
import { chooseShot, levels } from './DecisionMaking';
import type { Difficulty } from '../../state/gameStore';
export class OpponentAI {
  position = new Vector3(-0.9, 0, -3.8); velocity = new Vector3(); target = this.position.clone();
  swing = 0; stride = 0; reaction = 0; lastFlight = -1; mayHit = true;
  racketTarget = new Vector3(); contactPoint = new Vector3(); leavingOut = false;
  private predictionTimer = 0; private error = new Vector3(); private direction = new Vector3();
  reset() { this.target.copy(this.position); this.velocity.set(0, 0, 0); this.reaction = 0; this.lastFlight = -1; this.mayHit = true; this.leavingOut = false; this.predictionTimer = 0; }
  step(dt: number, shuttle: ShuttlecockPhysics, player: Vector3, difficulty: Difficulty, hits: number, friendly = false): boolean {
    const level = levels[difficulty];
    this.swing = Math.max(0, this.swing - dt * 2.7);
    const incoming = shuttle.active && shuttle.lastHit === 0 && shuttle.served;
    if (incoming && this.lastFlight !== hits) {
      this.lastFlight = hits; this.reaction = level.reaction; this.predictionTimer = 0;
      this.mayHit = Math.random() > level.miss; this.leavingOut = false;
      this.error.set((Math.random() - 0.5) * level.error, 0, (Math.random() - 0.5) * level.error);
    }
    this.reaction = Math.max(0, this.reaction - dt); this.predictionTimer -= dt;
    if (incoming && this.reaction === 0 && this.predictionTimer <= 0) {
      const prediction = predictFlight(shuttle.position, shuttle.velocity);
      const judgedX = prediction.landing.x + this.error.x, judgedZ = prediction.landing.z + this.error.z;
      this.leavingOut = Math.abs(judgedX) > 2.78 || judgedZ < -6.9;
      if (prediction.reachable && !this.leavingOut) {
        this.target.copy(prediction.position).add(this.error);
        this.target.x = Math.max(-3.7, Math.min(3.7, this.target.x - 0.25));
        this.target.z = Math.max(-7.4, Math.min(-0.75, this.target.z + 0.28)); this.target.y = 0;
      }
      this.predictionTimer = 0.10;
    }
    if (!incoming || this.leavingOut) this.target.set(-player.x * 0.2, 0, -3.8);
    this.direction.subVectors(this.target, this.position);
    const distance = this.direction.length();
    this.direction.normalize().multiplyScalar(Math.min(level.speed, distance * 4));
    this.velocity.lerp(this.direction, 1 - Math.exp(-8 * dt)); this.position.addScaledVector(this.velocity, dt);
    this.stride += this.velocity.length() * dt * 3.3; this.racketTarget.copy(shuttle.position);
    const reach = Math.hypot(shuttle.position.x - this.position.x, shuttle.position.z - this.position.z);
    if (incoming && this.mayHit && !this.leavingOut && this.reaction === 0 && shuttle.hitCooldown === 0 && shuttle.position.z < -0.45 && shuttle.position.y > 0.65 && shuttle.position.y < 2.55 && reach < 0.95 && shuttle.velocity.y < 2) {
      const decision = chooseShot(shuttle.position, player, difficulty, friendly);
      const plan = decision.target.y > 0 ? planIntercept(shuttle.position, decision.target, decision.loft) : planReturn(shuttle.position, decision.target, decision.loft, difficulty === 'casual' ? 0.35 : 0.12);
      shuttle.velocity.copy(plan.velocity);
      // Apply execution error *after* planning, so even Expert can miss its target or clip the net.
      shuttle.velocity.x += (Math.random() - 0.5) * level.error;
      shuttle.velocity.y += (Math.random() - 0.5) * level.error * 0.7;
      shuttle.lastHit = 1; shuttle.hitCooldown = 0.35; shuttle.crossedNet = false; this.swing = 1; this.contactPoint.copy(shuttle.position);
      return true;
    }
    return false;
  }
}
