import { Vector3 } from 'three';
import type { Difficulty } from '../../state/gameStore';
export const levels = {
  casual: { reaction: 0.42, speed: 2.9, error: 0.65, miss: 0.13 },
  club: { reaction: 0.24, speed: 4.0, error: 0.32, miss: 0.065 },
  expert: { reaction: 0.13, speed: 5.2, error: 0.16, miss: 0.025 },
};
export function chooseShot(from: Vector3, player: Vector3, difficulty: Difficulty) {
  const level = levels[difficulty], choice = Math.random();
  const attackSpace = player.x > 0 ? -1 : 1;
  const x = attackSpace * (difficulty === 'casual' ? 0.8 : 1.8) + (Math.random() - 0.5) * level.error;
  const drop = choice < 0.28 && from.y > 1.8;
  const smash = choice > 0.78 && from.y > 2.1;
  return { target: new Vector3(x, 0, drop ? 1.7 : smash ? 3.6 : 5.7), loft: drop ? 3.7 : smash ? 1.0 : 10.5 };
}
