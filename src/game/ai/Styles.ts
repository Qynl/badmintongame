import type { Difficulty } from '../../state/gameStore';

/** How the opponent plays, on top of the difficulty's raw attributes. */
export type OpponentStyle = 'steady' | 'attacker' | 'retriever' | 'tactician';
export interface StyleProfile {
  name: string; blurb: string;
  reaction: number; speed: number; error: number; miss: number; attack: number; memory: number;
}
export const styles: Record<OpponentStyle, StyleProfile> = {
  steady: { name: 'Steady', blurb: 'Balanced club play. Reads the rally, takes the opening.', reaction: 1, speed: 1, error: 1, miss: 1, attack: 1, memory: 1 },
  attacker: { name: 'Attacker', blurb: 'Hits down at every chance. Faster, but gives more away.', reaction: 0.85, speed: 1.03, error: 1.3, miss: 1.6, attack: 2.2, memory: 0.7 },
  retriever: { name: 'Retriever', blurb: 'Quick feet, nothing free. Wins by outlasting you.', reaction: 1.05, speed: 1.15, error: 0.78, miss: 0.65, attack: 0.45, memory: 1.1 },
  tactician: { name: 'Tactician', blurb: 'Remembers your corners and hits the one you left.', reaction: 0.95, speed: 1.0, error: 0.9, miss: 0.9, attack: 1.1, memory: 2.4 },
};
export const styleList = Object.keys(styles) as OpponentStyle[];
export const isStyle = (value: unknown): value is OpponentStyle => typeof value === 'string' && value in styles;

/** Scale a difficulty's raw attributes by the personality, without inventing new physics. */
export function profiled(difficulty: Difficulty, style: OpponentStyle) {
  const base = { casual: { reaction: 0.42, speed: 2.9, error: 0.65, miss: 0.13 }, club: { reaction: 0.24, speed: 4.0, error: 0.32, miss: 0.065 }, expert: { reaction: 0.13, speed: 5.2, error: 0.16, miss: 0.025 } }[difficulty];
  const profile = styles[style];
  return {
    reaction: base.reaction * profile.reaction,
    speed: base.speed * profile.speed,
    error: base.error * profile.error,
    miss: Math.min(0.4, base.miss * profile.miss),
  };
}
