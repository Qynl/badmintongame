import { MathUtils, Vector3 } from 'three';
import type { Difficulty } from '../../state/gameStore';
export const levels = {
  casual: { reaction: 0.42, speed: 2.9, error: 0.65, miss: 0.13 },
  club: { reaction: 0.24, speed: 4.0, error: 0.32, miss: 0.065 },
  expert: { reaction: 0.13, speed: 5.2, error: 0.16, miss: 0.025 },
};
export interface RallyContext { pressure: number; sequence: number; relaxed: boolean }
export function chooseShot(from: Vector3, player: Vector3, difficulty: Difficulty, friendly = false, context: RallyContext = { pressure: 0, sequence: 0, relaxed: true }) {
  const level = levels[difficulty], choice = Math.random();
  if (friendly && difficulty !== 'expert') {
    const casual = difficulty === 'casual';
    const x = MathUtils.clamp(player.x + (Math.random() - 0.5) * (casual ? 0.7 : 1.8), -1.8, 1.8);
    const z = MathUtils.clamp(player.z - 0.85, 1.2, 6.0);
    // A stretched opponent blocks/lifts high: good placement creates the next attacking window.
    if (context.pressure > 0.42) return { target: new Vector3(x, 2.65, z), loft: 12 };
    if (context.relaxed) return { target: new Vector3(x, casual ? 1.85 : 2.15, z), loft: casual ? 8.5 : 9.5 };
    if (player.z < 2.35) return { target: new Vector3(-player.x * 0.45, 0, 6.15), loft: 11.5 };
    switch (context.sequence % 4) {
      case 0: return { target: new Vector3(x, 2.7, z), loft: 11.5 }; // invitation to attack
      case 1: return { target: new Vector3(x, 1.95, z), loft: 8.5 };
      case 2: return { target: new Vector3(x, 0, casual ? 2.7 : 1.35), loft: 3.4 }; // draw the player forward
      default: return { target: new Vector3(player.x >= 0 ? -1.5 : 1.5, 2.1, z), loft: 9.0 }; // use the open side
    }
  }
  const attackSpace = player.x > 0 ? -1 : 1;
  const x = attackSpace * (difficulty === 'casual' ? 0.8 : 1.8) + (Math.random() - 0.5) * level.error;
  const drop = choice < 0.28 && from.y > 1.8;
  const smash = choice > 0.78 && from.y > 2.1 && context.pressure < 0.45;
  return { target: new Vector3(x, 0, drop ? 1.7 : smash ? 3.6 : 5.7), loft: context.pressure > 0.6 ? 13 : drop ? 3.7 : smash ? 1.0 : 10.5 };
}
