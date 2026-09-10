import { MathUtils, Vector3 } from 'three';
import type { ShuttlecockPhysics } from '../shuttle/ShuttlecockPhysics';
import { defensiveIntercept } from './Defense';
import { classifyShot } from '../physics/CollisionSystem';
import type { ShotType } from '../../state/gameStore';
import { planAssistedShot } from '../player/ShotPlanner';
import { predictFlight, planReturn, planIntercept } from './Prediction';
import { chooseShot, levels } from './DecisionMaking';
import type { Difficulty } from '../../state/gameStore';
export class OpponentAI {
  position = new Vector3(-0.9, 0, -3.8); velocity = new Vector3(); target = this.position.clone();
  swing = 0; stride = 0; reaction = 0; lastFlight = -1; mayHit = true;
  racketTarget = new Vector3(); contactPoint = new Vector3(); leavingOut = false;
  pressure = 0; returns = 0; shortMemory = 0; sideMemory = 0;
  lunge = 0; stamina = 1; recovering = 0; lastShot: ShotType | 'Block' | null = null;
  private attacked = false;
  private readThisFlight = false;
  private predictionTimer = 0; private error = new Vector3(); private direction = new Vector3();
  reset() { this.target.copy(this.position); this.velocity.set(0, 0, 0); this.reaction = 0; this.lastFlight = -1; this.mayHit = true; this.leavingOut = false; this.predictionTimer = 0; this.pressure = 0; this.returns = 0; this.lunge = 0; this.stamina = 1; this.recovering = 0; this.lastShot = null; this.attacked = false; }
  step(dt: number, shuttle: ShuttlecockPhysics, player: Vector3, difficulty: Difficulty, hits: number, friendly = false, relaxed = false): boolean {
    const level = levels[difficulty];
    this.lunge = Math.max(0, this.lunge - dt); this.recovering = Math.max(0, this.recovering - dt);
    this.stamina = Math.min(1, this.stamina + dt * 0.24);
    this.swing = Math.max(0, this.swing - dt * 2.7);
    const incoming = shuttle.active && shuttle.lastHit === 0 && shuttle.served;
    if (incoming && this.lastFlight !== hits) {
      this.lastFlight = hits;
      this.attacked = shuttle.velocity.y < 0 && shuttle.velocity.length() > 22;
      this.reaction = this.attacked ? Math.min(level.reaction, difficulty === 'casual' ? 0.16 : 0.11) : level.reaction; this.predictionTimer = 0;
      this.mayHit = Math.random() > level.miss; this.pressure = 0; this.readThisFlight = false; this.leavingOut = false;
      this.error.set((Math.random() - 0.5) * level.error, 0, (Math.random() - 0.5) * level.error);
    }
    this.reaction = Math.max(0, this.reaction - dt); this.predictionTimer -= dt;
    if (incoming && this.reaction === 0 && this.predictionTimer <= 0) {
      const prediction = predictFlight(shuttle.position, shuttle.velocity);
      if (!this.readThisFlight) {
        this.shortMemory = this.shortMemory * 0.65 + (Math.abs(prediction.landing.z) < 2.2 ? 0.35 : 0);
        // Remember a repeated corner across points, so one-sided placement stops being free.
        this.sideMemory = this.sideMemory * 0.62 + MathUtils.clamp(prediction.landing.x / 2.4, -1, 1) * 0.38;
        this.readThisFlight = true;
      }
      const judgedX = prediction.landing.x + this.error.x, judgedZ = prediction.landing.z + this.error.z;
      this.leavingOut = Math.abs(judgedX) > 2.78 || judgedZ < -6.9;
      const defense = this.attacked ? defensiveIntercept(shuttle.position, shuttle.velocity, this.position, this.velocity, level.speed, 1.4) : prediction;
      if (!this.leavingOut && (defense.reachable || this.attacked)) {
        this.target.copy(defense.position).addScaledVector(this.error, this.attacked ? 0.35 : 1);
        this.target.x = Math.max(-3.7, Math.min(3.7, this.target.x - 0.25));
        this.target.z = Math.max(-7.4, Math.min(-0.75, this.target.z + 0.28)); this.target.y = 0;
        const required = Math.hypot(defense.position.x - this.position.x, defense.position.z - this.position.z) / level.speed;
        this.pressure = Math.max(this.pressure, MathUtils.clamp((required - 1.4 / level.speed) / Math.max(0.15, defense.time), 0, 1));
        if (this.attacked && defense.time < 0.55 && this.position.distanceTo(this.target) > 1.35 && this.stamina > 0.5 && this.recovering === 0) {
          this.lunge = 0.30; this.recovering = 1.0; this.stamina -= 0.5;
        }
      }
      this.predictionTimer = 0.10;
    }
    if (!incoming || this.leavingOut) this.target.set(-player.x * 0.2 + this.sideMemory * 0.95, 0, -3.8 + this.shortMemory * 1.6);
    this.direction.subVectors(this.target, this.position);
    const distance = this.direction.length();
    this.direction.normalize().multiplyScalar(Math.min(this.lunge > 0 ? level.speed + 2.1 : this.recovering > 0 ? level.speed * 0.78 : level.speed, distance * 5));
    this.velocity.lerp(this.direction, 1 - Math.exp(-8 * dt)); this.position.addScaledVector(this.velocity, dt);
    this.stride += this.velocity.length() * dt * 3.3; this.racketTarget.copy(shuttle.position);
    const reach = Math.hypot(shuttle.position.x - this.position.x, shuttle.position.z - this.position.z);
    if (incoming && this.mayHit && !this.leavingOut && this.reaction === 0 && shuttle.hitCooldown <= (this.attacked ? 0.23 : 0) && shuttle.position.z < -0.2 && shuttle.position.y > (this.attacked ? 0.25 : 0.65) && shuttle.position.y < (relaxed ? 2.55 : 3.05) && reach < (this.attacked ? this.lunge > 0 ? 1.65 : 1.4 : 1.1) && shuttle.velocity.y < 2) {
      const decision = chooseShot(shuttle.position, player, difficulty, friendly, { pressure: this.pressure, sequence: this.returns, relaxed, sideBias: this.sideMemory });
      const plan = decision.target.y > 0 ? planIntercept(shuttle.position, decision.target, decision.loft) : planReturn(shuttle.position, decision.target, decision.loft, difficulty === 'casual' ? 0.35 : 0.12);
      let outgoing = plan.velocity;
      this.lastShot = classifyShot(outgoing, shuttle.position, plan.landing);
      if (this.attacked && !relaxed) {
        // Absorb pace instead of gifting another identical smash. A stretched block is
        // shorter; a prepared defender can lift deep and make the attacker reset.
        const block = this.pressure > 0.5 || Math.random() < 0.6;
        const reply = block ? planReturn(shuttle.position, new Vector3(MathUtils.clamp(player.x * -0.4, -1.3, 1.3), 0, 2.2), 3.5, 0.18)
          : planIntercept(shuttle.position, new Vector3(player.x, 2.5, MathUtils.clamp(player.z - 0.65, 2, 5.7)), 12);
        outgoing = reply.velocity; this.lastShot = block ? 'Block' : 'Lift';
      } else if (!relaxed && !this.attacked && this.returns % 3 === 2 && shuttle.position.y >= 2.35 && shuttle.position.z > -3.5 && this.pressure < 0.5) {
        // Same physically checked downward family as the player, mirrored across the net.
        const attack = planAssistedShot(new Vector3(shuttle.position.x, shuttle.position.y, -shuttle.position.z), player.x, 'smash');
        if (attack.attacking) { outgoing = attack.velocity.clone(); outgoing.z *= -1; this.lastShot = 'Smash'; }
      }
      shuttle.velocity.copy(outgoing);
      // Apply execution error *after* planning, so even Expert can miss its target or clip the net.
      shuttle.velocity.x += (Math.random() - 0.5) * level.error;
      shuttle.velocity.y += (Math.random() - 0.5) * level.error * 0.7;
      shuttle.lastHit = 1; shuttle.hitCooldown = 0.35; shuttle.crossedNet = false; this.swing = 1; this.contactPoint.copy(shuttle.position); this.returns++;
      return true;
    }
    return false;
  }
}
