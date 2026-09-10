import { MathUtils, Quaternion, Vector2, Vector3 } from 'three';
import type { PlayerController } from './PlayerController';
import type { RacketController } from './RacketController';
import type { ShuttlecockPhysics } from '../shuttle/ShuttlecockPhysics';
import type { Contact } from '../physics/CollisionSystem';
import { planAssistedShot } from './ShotPlanner';
import type { AssistedShot } from './ShotPlanner';
import { COURT, aimFrom, aimLabel, clampAim, depthBand } from './AimSystem';
import { STRIKE_EARLY, STRIKE_LATE } from './StrikeWindow';
import type { AimBox } from './AimSystem';
import { planReturn } from '../ai/Prediction';

/** Accessible controls, deliberately separate from the strict string-bed simulation. */
export class GuidedSwing {
  buffered = 0;
  cooldown = 0;
  reachable = false;
  armed = false;
  connected = false;
  motion = new Vector2();
  animation = 0; intent: AssistedShot = 'rally'; smashReady = false;
  /** Where the shuttle will go: the aim marker, its label, and the point contact actually uses. */
  aim = new Vector3(0, 0, -5.5); locked = new Vector3(0, 0, -5.5); label = 'DEEP CENTRE'; control = 1;
  /**
   * Swing timing is the skill. `power` is 1 for a real swing inside the window and falls away
   * for a stale held button, a rushed click, or mashing (`flail`). Weak swings cannot reach
   * the back court and cannot attack, so spamming gives the opponent something to hit.
   */
  power = 1; flail = 0; timing: 'Perfect' | 'Good' | 'Early' | 'Late' = 'Good';
  /** Set by the engine while the player is serving, so the aim stays inside the diagonal service box. */
  service: AimBox | null = null;
  private requestAge = Infinity; private followRotation = new Quaternion();
  private whiff = 0; private nearby = false;
  private afterHit = 0;
  private held = false;
  private lockNext = true;
  private forward = new Vector3();
  private relative = new Vector3();
  private desired = new Vector3();
  private face = new Vector3();
  private targetRotation = new Quaternion();
  private strokeCenter = new Vector3();

  input(dt: number, pressed: boolean, held: boolean, dx: number, dy: number, requested?: AssistedShot) {
    this.requestAge += dt;
    this.buffered = Math.max(0, this.buffered - dt); this.cooldown = Math.max(0, this.cooldown - dt);
    this.afterHit = Math.max(0, this.afterHit - dt); this.held = held;
    this.whiff = Math.max(0, this.whiff - dt);
    this.flail = Math.max(0, this.flail - dt * 0.22);
    this.motion.multiplyScalar(Math.exp(-5 * dt));
    if (pressed) {
      // Re-pressing inside half a second is a mash, not a swing: it costs power and recovery time.
      this.flail = MathUtils.clamp(this.requestAge < 0.55 ? this.flail + 0.34 : this.flail - 0.25, 0, 1);
      // Swinging at nothing costs you the racket; pressing as the shuttle closes does not.
      if (!this.reachable && !this.nearby) this.whiff = 0.3;
      this.buffered = 0.8; this.animation = 1; this.connected = false; this.intent = requested ?? 'rally'; this.requestAge = 0; this.lockNext = true;
    }
    if (held || this.buffered > 0) { this.motion.x += dx; this.motion.y += dy; }
    if (held && this.buffered === 0 && this.cooldown === 0) this.intent = requested ?? 'rally';
    this.motion.clampLength(0, 140);
    this.armed = (held || this.buffered > 0) && this.cooldown === 0 && this.whiff === 0;
    this.animation = Math.max(0, this.animation - dt * 3.2);
  }

  /**
   * Read the look direction as a landing point. A tap commits the placement, so you can
   * pick a corner, click, and still watch the shuttle arrive; holding a control keeps steering.
   */
  updateAim(player: PlayerController, contactZ?: number) {
    const live = aimFrom(player, this.intent, this.motion.x, this.motion.y, this.service ?? COURT, contactZ);
    const pending = this.held || this.buffered > 0;
    if (this.lockNext || !pending) { this.locked.copy(live); this.lockNext = false; }
    else if (this.held) this.locked.lerp(live, 0.3);
    this.aim.copy(pending ? this.locked : live);
    this.label = aimLabel(this.aim.x, this.aim.z);
  }

  canReach(player: PlayerController, shuttle: ShuttlecockPhysics) {
    if (!shuttle.active || (shuttle.served && shuttle.lastHit === 0)) return false;
    this.relative.subVectors(shuttle.position, player.position);
    const horizontal = Math.hypot(this.relative.x, this.relative.z);
    this.forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const ahead = this.relative.dot(this.forward);
    // A generous, bounded human reach. Not an anywhere-on-court hit or a hit behind your back.
    return horizontal <= 2.05 && ahead >= -0.18 && shuttle.position.z > 0.15 &&
      this.relative.y >= 0.30 && this.relative.y <= 3.1;
  }

  /** Move the visible hand/racket into the stroke; then check their actual swept proximity. */
  track(dt: number, racket: RacketController, player: PlayerController, shuttle: ShuttlecockPhysics) {
    this.reachable = this.canReach(player, shuttle);
    const opportunity = shuttle.position.clone().sub(player.position);
    const ahead = opportunity.x * -Math.sin(player.yaw) + opportunity.z * -Math.cos(player.yaw);
    this.nearby = shuttle.active && ahead > -0.2 && Math.hypot(opportunity.x, opportunity.z) < 3.4;
    this.smashReady = shuttle.active && shuttle.lastHit === 1 && shuttle.served &&
      Math.hypot(opportunity.x, opportunity.z) < 2.8 && ahead > -0.18 && opportunity.y >= 2.05 && opportunity.y <= 4.2;
    if (this.afterHit > 0) {
      const recovery = 1 - Math.exp(-9 * dt);
      racket.center.lerpVectors(this.strokeCenter, racket.center, recovery);
      this.strokeCenter.copy(racket.center);
      racket.rotation.slerp(this.followRotation, this.afterHit / 0.32);
      this.finishPose(dt, racket);
      return;
    }
    if (!this.armed || !this.reachable) {
      if (this.animation > 0) {
        const arc = Math.sin((1 - this.animation) * Math.PI);
        this.forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
        racket.center.addScaledVector(this.forward, arc * 0.24);
        racket.rotation.multiply(this.targetRotation.setFromAxisAngle(new Vector3(0, 0, 1), arc * -0.28));
        this.finishPose(dt, racket);
      }
      return;
    }
    this.forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    this.desired.copy(shuttle.position).addScaledVector(shuttle.velocity, 0.035);
    this.desired.addScaledVector(this.forward, 0.055);
    // Reach takes time, rather than teleporting a racket onto an incoming shuttle.
    this.relative.subVectors(this.desired, racket.previous).clampLength(0, (this.intent === 'smash' ? 16 : 10) * dt);
    racket.center.copy(racket.previous).add(this.relative);
    this.face.copy(this.forward); this.face.y = this.intent === 'smash' ? -0.38 : this.intent === 'drop' ? 0.24 : 0.5 - this.motion.y * 0.006; this.face.normalize();
    this.targetRotation.setFromUnitVectors(new Vector3(0, 0, -1), this.face);
    racket.rotation.copy(racket.previousRotation).slerp(this.targetRotation, 1 - Math.exp(-22 * dt));
    racket.normal.set(0, 0, -1).applyQuaternion(racket.rotation);
    this.finishPose(dt, racket);
  }
  private finishPose(dt: number, racket: RacketController) {
    racket.velocity.subVectors(racket.center, racket.previous).divideScalar(dt).clampLength(0, 18);
    racket.wrist.set(0, -0.53, 0).applyQuaternion(racket.rotation).add(racket.center);
  }

  contact(shuttle: ShuttlecockPhysics, racket: RacketController, player: PlayerController): Contact | null {
    if (!this.armed || !this.reachable || shuttle.hitCooldown > 0 || !this.canReach(player, shuttle)) return null;
    // Relative swept sphere about the guided string bed; 30 cm tolerance buys timing forgiveness.
    const a = shuttle.previous.clone().sub(racket.previous), b = shuttle.position.clone().sub(racket.center);
    const segment = b.clone().sub(a);
    const t = MathUtils.clamp(-a.dot(segment) / Math.max(1e-8, segment.lengthSq()), 0, 1);
    const nearest = a.lerp(b, t), distance = nearest.length();
    if (distance > 0.30) return null;

    const wasServe = !shuttle.served;
    const downward = this.motion.y;
    // Explicit inputs take precedence; legacy flicks still work for players who prefer them.
    const chosen = this.intent !== 'rally' ? this.intent : downward > 28 && shuttle.position.y > 2.15 ? 'smash' : downward > 10 ? 'drop' : 'rally';
    // Timing window: a swing needs a moment to travel, and a held button is a stale swing.
    const rushed = this.requestAge < STRIKE_LATE;
    const stale = MathUtils.clamp((this.requestAge - STRIKE_EARLY) * 0.7, 0, 0.5);
    this.power = wasServe ? 1 : MathUtils.clamp(1 - (rushed ? 0.2 : 0) - stale - this.flail * 0.38, 0.42, 1);
    this.timing = wasServe ? 'Perfect' : rushed ? 'Early' : this.requestAge <= STRIKE_EARLY ? 'Perfect' : stale > 0.28 ? 'Late' : 'Good';
    const timed = this.timing === 'Perfect';
    const offset = distance / 0.3;
    // Clean contact lands on the mark; a scraped contact scatters around it.
    this.control = wasServe ? 1 : MathUtils.clamp(1 - offset * 0.8 - (timed ? 0 : 0.12), 0, 1);
    const local = nearest.applyQuaternion(racket.rotation.clone().invert());
    // A weak swing cannot attack, and cannot carry the shuttle to the back court.
    const starved = chosen === 'smash' && this.power < 0.72;
    const played: AssistedShot = starved ? 'rally' : chosen;
    const target = wasServe
      ? clampAim(this.locked, 'rally', shuttle.position.z, this.service ?? COURT)
      : clampAim(this.locked, played, shuttle.position.z, this.service ?? COURT);
    if (!wasServe) {
      const [shallowZ, deepZ] = depthBand(played, 0, Math.abs(shuttle.position.z) < 2.2);
      target.z = MathUtils.clamp(target.z, MathUtils.lerp(-3.1, deepZ, this.power), shallowZ);
    }
    if (!wasServe) {
      const drift = 1 - this.control;
      target.x += MathUtils.clamp(local.x / 0.3, -1, 1) * drift * 0.26;
      target.z += MathUtils.clamp(local.y / 0.3, -1, 1) * drift * 0.34;
    }
    const advice = wasServe ? '' : starved ? 'No swing behind it. Press F as the window closes to attack. '
      : this.timing === 'Early' ? 'Too early—you met it with no swing. Let it arrive. '
      : this.timing === 'Late' ? 'You were holding the button. Click as the shuttle arrives. '
      : this.flail > 0.5 ? 'Mashing costs you power. Wait for the window. ' : '';
    const plan = wasServe ? { velocity: planReturn(shuttle.position, target, 10, 0.22).velocity, shot: 'Serve' as const, attacking: false, feedback: 'In play. Build your opening.' }
      : planAssistedShot(shuttle.position, target, played, timed, this.power);
    if (!wasServe && advice) plan.feedback = advice + plan.feedback;
    const launch = plan.velocity;
    // Assistance is applied at contact only. The outgoing shuttle still obeys normal flight physics.
    shuttle.velocity.copy(launch); shuttle.lastHit = 0; shuttle.served = true; shuttle.crossedNet = false; shuttle.hitCooldown = 0.35;
    this.buffered = 0; this.armed = false; this.connected = true; this.afterHit = plan.attacking ? 0.32 : 0.20;
    // Mashing lengthens the recovery, so a spammer is still swinging when the next ball arrives.
    this.cooldown = (plan.attacking ? 0.54 : played === 'drop' ? 0.28 : 0.42) * (1 + this.flail * 0.9);
    this.strokeCenter.copy(racket.center).addScaledVector(this.forward, plan.attacking ? 0.23 : played === 'drop' ? 0.035 : 0.08);
    this.strokeCenter.y -= plan.attacking ? 0.18 : 0;
    this.followRotation.copy(racket.rotation).multiply(this.targetRotation.setFromAxisAngle(new Vector3(1, 0, 0), plan.attacking ? -0.65 : -0.08));
    racket.vibration = plan.attacking ? 1 : played === 'drop' ? 0.28 : 0.65 * this.power; this.animation = 1;
    const quality = offset > 0.82 ? 'Off-center' : this.timing === 'Perfect' ? 'Perfect' : this.timing === 'Good' && offset < 0.46 ? 'Good' : this.timing;
    return { quality, shot: plan.shot, timed: !wasServe && timed, feedback: plan.feedback, speed: launch.length(), offset,
      point: [MathUtils.clamp(local.x / 0.3, -1, 1), MathUtils.clamp(local.y / 0.3, -1, 1)], incidence: 1, target: target.clone() };
  }
  get waitingForShuttle() { return this.held || this.buffered > 0; }
  /** Seconds since the last press: what the timing window is measured against. */
  get swingAge() { return this.requestAge; }
}
