import { Vector3 } from 'three';
import type { ScoreState } from './Scoring';
export function servicePositions(score: ScoreState) {
  const right = score.points[score.server] % 2 === 0;
  const x = (right ? 1 : -1) * (score.server === 0 ? 1 : -1);
  return { player: new Vector3(score.server === 0 ? x : -x, 0, 3.8), opponent: new Vector3(score.server === 1 ? x : -x, 0, -3.8) };
}
export function validServiceLanding(x: number, z: number, server: 0 | 1, even: boolean) {
  const expectedX = (even ? -1 : 1) * (server === 0 ? 1 : -1);
  const expectedZ = server === 0 ? -1 : 1;
  return x * expectedX >= -0.02 && Math.abs(x) <= 2.61 && z * expectedZ >= 1.96 && z * expectedZ <= 6.72;
}
