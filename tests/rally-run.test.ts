import { describe, expect, it, vi } from 'vitest';
import { RallyRun } from '../src/game/training/RallyRun';
import { awardPoint, DUEL_RULES, initialScore } from '../src/game/match/Scoring';
import { GameEngine } from '../src/game/GameEngine';
import { useGameStore } from '../src/state/gameStore';
import type { InputManager } from '../src/game/input/InputManager';
import { Vector3 } from 'three';

describe('Rally Run rewards validated play', () => {
  it('does not score merely pressing a shot or hitting a fault', () => {
    const run = new RallyRun(); run.propose('Smash', true); expect(run.score).toBe(0);
    run.finish(false); expect(run.lastScore).toBe(0); run.bank(); expect(run.score).toBe(0);
  });
  it('banks each flight only once', () => {
    const run = new RallyRun(); run.propose('Clear'); run.bank(); expect(run.score).toBe(20);
    run.bank(); expect(run.score).toBe(20);
  });
  it('rewards a chain, variety and a finishing attack with successive goals', () => {
    const run = new RallyRun();
    for (const shot of ['Clear', 'Clear', 'Clear', 'Drop', 'Smash'] as const) { run.propose(shot); run.bank(); }
    expect(run.goals).toBe(3); expect(run.chain).toBe(5); expect(run.score).toBeGreaterThan(400);
    const score = run.score; run.finish(true); expect(run.lastScore).toBe(score + 100); expect(run.chain).toBe(0); expect(run.goals).toBe(0);
  });
  it('keeps a best run when a shorter run ends', () => {
    const run = new RallyRun(); run.propose('Clear'); run.bank(); run.finish(true);
    const record = run.best; run.propose('Drop'); run.bank(); run.cancel(); expect(run.best).toBe(record); expect(run.lastScore).toBe(20);
  });
  it('handles malformed or unavailable storage without breaking gameplay', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'NaN', setItem: () => { throw new Error('denied'); } });
    try { const run = new RallyRun(); expect(run.best).toBe(0); run.propose('Clear'); run.bank(); expect(run.best).toBe(20); } finally { vi.unstubAllGlobals(); }
  });
});
describe('Quick Duel is explicit, complete, and separate from club scoring', () => {
  it('wins at seven with a two-point lead and does not start another game', () => {
    let s = initialScore(); for (let i = 0; i < 7; i++) s = awardPoint(s, 0, DUEL_RULES);
    expect(s.winner).toBe(0); expect(s.points).toEqual([7, 0]); expect(s.history).toEqual([[7, 0]]);
  });
  it('plays deuce and caps the duel at eleven', () => {
    let s = initialScore(); s.points = [6, 6]; s = awardPoint(s, 0, DUEL_RULES); expect(s.winner).toBeNull();
    s = awardPoint(s, 0, DUEL_RULES); expect(s.winner).toBe(0);
    s = initialScore(); s.points = [10, 10]; s = awardPoint(s, 1, DUEL_RULES); expect(s.winner).toBe(1);
  });
  it('changes ends once at four in the duel', () => {
    let s = initialScore(); for (let i = 0; i < 4; i++) s = awardPoint(s, 0, DUEL_RULES);
    expect(s.ends).toBe(true); for (let i = 0; i < 4; i++) s = awardPoint(s, 1, DUEL_RULES); expect(s.ends).toBe(true);
  });
  it('keeps regulation scoring as the pure rule default', () => {
    let s = initialScore(); for (let i = 0; i < 7; i++) s = awardPoint(s, 0); expect(s.winner).toBeNull(); expect(s.games).toEqual([0, 0]);
  });
  it('uses the selected format in the engine and completes a duel through landing adjudication', () => {
    useGameStore.getState().setMatchFormat('duel'); useGameStore.getState().start('match');
    const e = new GameEngine(); e.input = { keys: new Set(), locked: true, swinging: false, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
    e.frame(1 / 120); e.match.score.points = [6, 3];
    e.shuttle.reset(new Vector3(0, 0.02, -4), new Vector3(0, -1, 0)); e.shuttle.served = true; e.shuttle.lastHit = 0; e.shuttle.crossedNet = true; e.match.hits = 4;
    e.frame(1 / 120); expect(useGameStore.getState().phase).toBe('result'); expect(useGameStore.getState().winner).toBe(0);
    useGameStore.getState().setMatchFormat('classic'); useGameStore.getState().start('match'); e.frame(1 / 120); expect(e.match.rules.target).toBe(21);
  });
});
