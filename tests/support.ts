import { MathUtils } from 'three';
import type { Vector3 } from 'three';
import type { PlayerController } from '../src/game/player/PlayerController';
import type { GameEngine } from '../src/game/GameEngine';

/**
 * Assisted contact needs the shuttle inside the view cone, so tests that swing have to model a
 * player who watches the ball. These set the look angles directly; PlayerController.step keeps
 * adding mouse deltas on top of them, so an engine loop can call watch() every frame.
 */
export function lookAt(player: PlayerController, point: Vector3) {
  const dx = point.x - player.position.x, dz = point.z - player.position.z;
  const dy = point.y - (player.position.y + player.eyeHeight);
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = MathUtils.clamp(Math.atan2(dy, Math.max(0.001, Math.hypot(dx, dz))), -1.25, 1.25);
}
export function watch(engine: GameEngine) { lookAt(engine.player, engine.shuttle.position); }
