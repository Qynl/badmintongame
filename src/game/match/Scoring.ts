export type Side = 0 | 1;
export interface ScoreState { points: [number, number]; games: [number, number]; server: Side; game: number; winner: Side | null; ends: boolean; history: [number, number][] }
export const initialScore = (): ScoreState => ({ points: [0, 0], games: [0, 0], server: 0, game: 1, winner: null, ends: false, history: [] });
export interface MatchRules { target: number; cap: number; gamesToWin: number; decidingEnd: number }
export const CLASSIC_RULES: MatchRules = { target: 21, cap: 30, gamesToWin: 2, decidingEnd: 11 };
export const DUEL_RULES: MatchRules = { target: 7, cap: 11, gamesToWin: 1, decidingEnd: 4 };
export function awardPoint(state: ScoreState, side: Side, rules = CLASSIC_RULES): ScoreState {
  if (state.winner !== null) return state;
  const next: ScoreState = { ...state, points: [...state.points], games: [...state.games], history: [...state.history], server: side };
  next.points[side]++;
  const other = (1 - side) as Side;
  if ((next.points[side] >= rules.target && next.points[side] - next.points[other] >= 2) || next.points[side] >= rules.cap) {
    next.history.push([...next.points]);
    next.games[side]++;
    if (next.games[side] === rules.gamesToWin) next.winner = side;
    else { next.points = [0, 0]; next.game++; next.ends = !next.ends; }
  } else if (next.game === rules.gamesToWin * 2 - 1 && next.points[side] === rules.decidingEnd && next.points[other] < rules.decidingEnd) next.ends = !next.ends;
  return next;
}
export function landingWinner(x: number, z: number, lastHit: Side, crossedNet: boolean): Side {
  // Singles boundaries, including the 40 mm lines.
  if (Math.abs(x) > 2.61 || Math.abs(z) > 6.72 || !crossedNet) return (1 - lastHit) as Side;
  return z > 0 ? 1 : 0;
}
