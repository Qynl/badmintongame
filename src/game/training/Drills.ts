import type { ContactQuality, ShotType, TrainingShot } from '../../state/gameStore';
export interface Drill {
  minZ: number; maxZ: number; halfWidth: number; startZ: number;
  loft: number; feedLandingZ: number; instruction: string; targetLabel: string;
}
export const drills: Record<TrainingShot, Drill> = {
  Clear: { minZ: -6.7, maxZ: -4.6, halfWidth: 2.59, startZ: 4.4, loft: 12, feedLandingZ: 6.5, instruction: 'Get behind it. Open the face and send it deep.', targetLabel: 'BACK COURT' },
  Drop: { minZ: -1.98, maxZ: -0.25, halfWidth: 2.59, startZ: 4.2, loft: 12, feedLandingZ: 6.3, instruction: 'Meet it high. Soften your hand through contact.', targetLabel: 'FRONT COURT' },
  Smash: { minZ: -5.3, maxZ: -2.0, halfWidth: 2.59, startZ: 4.5, loft: 15, feedLandingZ: 6.7, instruction: 'Raise the racket, then accelerate down through the cork.', targetLabel: 'ATTACKING ZONE' },
  'Net shot': { minZ: -1.5, maxZ: -0.15, halfWidth: 2.59, startZ: 1.9, loft: 7, feedLandingZ: 3.5, instruction: 'Stay close. A short reach and a quiet touch.', targetLabel: 'TIGHT TO THE NET' },
};
export function insideTarget(shot: TrainingShot, x: number, z: number) {
  const d = drills[shot]; return Math.abs(x) <= d.halfWidth && z >= d.minZ && z <= d.maxZ;
}
export function assessDrill(goal: TrainingShot, actual: ShotType | null, x: number, z: number, crossedNet: boolean) {
  const inCourt = crossedNet && Math.abs(x) <= 2.61 && z <= 0 && z >= -6.72;
  const matched = actual === goal;
  const onTarget = inCourt && insideTarget(goal, x, z);
  const success = matched && onTarget;
  const feedback = !actual ? 'Find the shuttle with the string bed.' : !inCourt ? 'Watch the landing. Keep your next shot inside the lines.' : !matched ? `That was a ${actual.toLowerCase()}. ${drills[goal].instruction}` : !onTarget ? `Good ${goal.toLowerCase()}. Now find the highlighted zone.` : 'Shot and placement. That’s the feeling.';
  return { matched, onTarget, success, feedback };
}
export function contactAdvice(quality: ContactQuality | null, shot: ShotType | null) {
  if (quality === 'Miss') return 'Move your feet first. Bring the string bed into the shuttle’s path.';
  if (quality === 'Off-center') return 'A little more space. Aim for the middle of the strings.';
  if (quality === 'Early') return 'Let the shuttle arrive. Try a shorter reach.';
  if (quality === 'Late') return 'Prepare sooner and meet the shuttle farther in front.';
  if (quality === 'Perfect') return `Clean ${shot?.toLowerCase() || 'contact'}. Settle your feet for the next shot.`;
  if (quality === 'Good') return 'Connected. Find the centre for a little more control.';
  return 'Read the flight. Get in position. Then swing.';
}
