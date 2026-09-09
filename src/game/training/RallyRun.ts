import type { ShotType } from '../../state/gameStore';
const family = (shot: ShotType) => shot === 'Clear' || shot === 'Lift' ? 'deep' : shot === 'Drop' || shot === 'Net shot' ? 'touch' : shot === 'Smash' ? 'attack' : 'flat';
const goals = [
  { title: 'Keep it alive.', detail: 'Land 3 returns in one rally.' },
  { title: 'Change the question.', detail: 'Mix a deep return and a soft shot.' },
  { title: 'Take the opening.', detail: 'Land a smash after a different shot.' },
];
function readBest() {
  try { const n = Number(localStorage.getItem('feather-rally-best')); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0; } catch { return 0; }
}
/** Arcade practice score, separate from badminton scoring. Only validated flights bank points. */
export class RallyRun {
  score = 0; best = readBest(); lastScore = 0; chain = 0; goals = 0; reward = 'Three shots. One more rally.';
  private pending: { shot: ShotType; timed: boolean } | null = null;
  private previous = ''; private types = new Set<string>();
  get multiplier() { return Math.min(4, 1 + Math.floor(this.chain / 3)); }
  get objective() { return goals[this.goals % goals.length]; }
  propose(shot: ShotType, timed = false) { this.pending = { shot, timed }; }
  bank() {
    if (!this.pending) return;
    const { shot, timed } = this.pending; this.pending = null;
    const kind = family(shot), changed = this.previous !== '' && this.previous !== kind;
    this.chain++; this.types.add(kind);
    let points = (20 + (changed ? 15 : 0) + (timed && kind === 'attack' ? 15 : 0)) * this.multiplier;
    const stage = this.goals % 3;
    const complete = stage === 0 ? this.chain >= 3 : stage === 1 ? this.types.has('deep') && this.types.has('touch') : kind === 'attack' && changed;
    if (complete) { this.goals++; points += 100; }
    this.score += points; this.previous = kind;
    this.reward = complete ? `Challenge cleared! +${points}` : changed ? `Changed it up. +${points}` : `${shot} in play. +${points}`;
    this.saveBest();
  }
  finish(won: boolean) {
    // An opponent return already banked the preceding stroke. An unreturned legal
    // winner is banked by the engine before finish; a fault must never bank here.
    this.pending = null;
    if (won && this.chain) { this.score += 100; this.reward = 'Winner! +100 finish bonus.'; this.saveBest(); }
    else if (this.chain) this.reward = 'Run banked. Build the next one.';
    this.lastScore = this.score; this.score = 0; this.chain = 0; this.goals = 0; this.previous = ''; this.types.clear();
  }
  cancel() { this.finish(false); }
  private saveBest() {
    if (this.score <= this.best) return;
    this.best = this.score;
    try { localStorage.setItem('feather-rally-best', String(this.best)); } catch { /* In-memory records still work. */ }
  }
  snapshot() { return { score: this.score, best: this.best, last: this.lastScore, chain: this.chain, multiplier: this.multiplier, goals: this.goals, reward: this.reward, objective: this.objective }; }
}
