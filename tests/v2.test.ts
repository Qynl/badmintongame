import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { RacketController } from '../src/game/player/RacketController';
import { PlayerController } from '../src/game/player/PlayerController';
import { RallyTransition } from '../src/game/match/RallyTransition';
import { awardPoint, initialScore } from '../src/game/match/Scoring';
import { netCrossing, netHeight } from '../src/game/physics/NetCollision';
import { ShuttlecockPhysics } from '../src/game/shuttle/ShuttlecockPhysics';
import { planReturn } from '../src/game/ai/Prediction';
import { assessDrill, drills, insideTarget } from '../src/game/training/Drills';
import { GameEngine } from '../src/game/GameEngine';
import { useGameStore, validateSettings } from '../src/state/gameStore';
import type { InputManager } from '../src/game/input/InputManager';

function crossing(y: number) {
  const shuttle = new ShuttlecockPhysics(); shuttle.active = true;
  shuttle.previous.set(0, y, 0.1); shuttle.position.set(0, y, -0.1); shuttle.velocity.set(0, -1, -10);
  return shuttle;
}
describe('V2 net interaction', () => {
  it('keeps an upper tape graze moving over the net with less speed', () => {
    const s = crossing(1.534); const speed = s.velocity.length();
    expect(netCrossing(s)).toBe('tape'); expect(s.active).toBe(true);
    expect(s.position.z).toBeLessThan(0); expect(s.velocity.z).toBeLessThan(0);
    expect(s.velocity.y).toBeGreaterThan(0); expect(s.velocity.length()).toBeLessThan(speed);
  });
  it('allows a mesh contact to fall rather than ending physics immediately', () => {
    const s = crossing(1.2); expect(netCrossing(s)).toBe('net'); expect(s.active).toBe(true);
    expect(s.position.z).toBeGreaterThan(0); expect(s.velocity.z).toBeGreaterThan(0);
  });
  it('distinguishes an under-net fault from a legal crossing', () => {
    expect(netCrossing(crossing(0.4))).toBe('under'); expect(netCrossing(crossing(1.8))).toBe('over');
  });
  it('uses the same sagged height as the rendered tape', () => {
    expect(netHeight(0)).toBeCloseTo(1.524); expect(netHeight(-3.05)).toBeCloseTo(1.55);
    expect(netHeight(1.5)).toBeCloseTo(netHeight(-1.5));
  });
});
describe('V2 preparation and recovery', () => {
  it('changes grip smoothly rather than creating an artificial 180-degree velocity impulse', () => {
    const p = new PlayerController(), r = new RacketController(); p.head.set(0, 1.68, 0);
    r.step(1 / 120, p, 0, 0, false, 1, true); const old = r.rotation.clone();
    r.step(1 / 120, p, 0, 0, false, 1, false);
    expect(old.angleTo(r.rotation)).toBeLessThan(0.2); expect(r.velocity.length()).toBeLessThan(5);
    expect(r.angularVelocity.length()).toBeLessThan(20);
    for (let i = 0; i < 360; i++) r.step(1 / 120, p, 0, 0, false, 1, false);
    expect(r.angularVelocity.length()).toBeLessThan(0.01);
  });
  it('retains a small follow-through, then settles without oscillation', () => {
    const p = new PlayerController(), r = new RacketController();
    r.step(1 / 120, p, 0, 0, false, 1);
    for (let i = 0; i < 6; i++) r.step(1 / 120, p, 6, -4, true, 1);
    const before = r.gesture.x; r.step(1 / 120, p, 0, 0, false, 1);
    expect(r.gesture.x).toBeGreaterThan(before);
    for (let i = 0; i < 240; i++) r.step(1 / 120, p, 0, 0, false, 1);
    expect(r.gesture.length()).toBeLessThan(0.001);
  });
  it('repositions exactly once, only behind an opaque transition', () => {
    const transition = new RallyTransition(); transition.begin(); let changes = 0;
    for (let i = 0; i < 260; i++) {
      const event = transition.step(1 / 120); if (event.prepare) { changes++; expect(transition.opacity).toBe(1); }
    }
    expect(changes).toBe(1); expect(transition.active).toBe(false); expect(transition.opacity).toBe(0);
  });
  it('can reset a pending transition without a stale callback', () => {
    const transition = new RallyTransition(); transition.begin(); transition.step(0.5); transition.reset();
    expect(transition.step(10)).toEqual({ prepare: false, complete: false });
  });
});
describe('V2 training assessment', () => {
  it('counts success only when both the shot and landing zone match', () => {
    expect(assessDrill('Clear', 'Clear', 1, -5.5, true).success).toBe(true);
    expect(assessDrill('Clear', 'Smash', 1, -5.5, true).success).toBe(false);
    expect(assessDrill('Clear', 'Clear', 1, -1, true).success).toBe(false);
    expect(assessDrill('Clear', 'Clear', 1, -5.5, false).success).toBe(false);
  });
  it('does not count a label on an out-of-bounds or missed shot', () => {
    expect(assessDrill('Smash', 'Smash', 3, -4, true).success).toBe(false);
    expect(assessDrill('Smash', null, 0, -4, true).success).toBe(false);
  });
  it('provides a distinct target and appropriate starting position for each drill', () => {
    expect(insideTarget('Clear', 0, -5.5)).toBe(true); expect(insideTarget('Drop', 0, -5.5)).toBe(false);
    expect(insideTarget('Net shot', 0, -0.7)).toBe(true);
    expect(drills['Net shot'].startZ).toBeLessThan(drills.Smash.startZ);
  });
});
describe('V2 opponent return planning', () => {
  for (const z of [-1.1, -3.8, -6]) it(`plans an unsteered return that clears the net from z=${z}`, () => {
    const target = new Vector3(1.6, 0, 5.5);
    const plan = planReturn(new Vector3(-0.8, 1.15, z), target, 1, 0.12);
    expect(plan.netY).not.toBeNull(); expect(plan.netY!).toBeGreaterThanOrEqual(1.67);
    expect(Math.hypot(plan.landing.x - target.x, plan.landing.z - target.z)).toBeLessThan(0.2);
  });
});
describe('V2 saved and match state', () => {
  it('retains completed game scores without changing earlier snapshots', () => {
    const s = initialScore(); s.points = [20, 12];
    const next = awardPoint(s, 0); expect(next.history).toEqual([[21, 12]]); expect(next.points).toEqual([0, 0]); expect(s.history).toEqual([]);
    next.points = [18, 20]; const third = awardPoint(next, 1);
    expect(third.history).toEqual([[21, 12], [18, 21]]); expect(next.history).toEqual([[21, 12]]);
  });
  it('sanitizes old or corrupted persisted settings', () => {
    const s = validateSettings({ volume: 5, quality: 'invalid', sensitivity: 'high', headMotion: 'no', impact: false });
    expect(s.volume).toBe(1); expect(s.quality).toBe('balanced'); expect(s.sensitivity).toBe(1); expect(s.headMotion).toBe(true); expect(s.impact).toBe(false);
    expect(validateSettings(null).volume).toBe(0.55); expect(validateSettings({ sensitivity: NaN }).sensitivity).toBe(1);
  });
  it('clears V2 statistics when starting a new session', () => {
    useGameStore.setState({ courtFade: 1, trainingSuccess: 4, trainingAttempts: 10, bestRally: 7, impactPoint: [0.2, 0.3] });
    useGameStore.getState().start('training'); const s = useGameStore.getState();
    expect(s.courtFade).toBe(0); expect(s.trainingSuccess).toBe(0); expect(s.impactPoint).toBeNull(); expect(s.bestRally).toBe(0);
  });
});
describe('V2 engine rally flow', () => {
  function engine(mode: 'match' | 'training') {
    useGameStore.getState().start(mode); const e = new GameEngine();
    e.input = { keys: new Set(), locked: true, dx: 0, dy: 0, swinging: false, serve: false, jump: false } as InputManager;
    e.frame(1 / 120); return e;
  }
  it('keeps the player in place after the point, then prepares behind the fade', () => {
    const e = engine('match'); e.player.position.x = 2;
    e.shuttle.reset(new Vector3(0, 0.01, -4), new Vector3(0, -1, 0)); e.shuttle.lastHit = 0; e.shuttle.crossedNet = true; e.match.hits = 3;
    e.frame(1 / 120); expect(e.transition.active).toBe(true); expect(e.player.position.x).toBe(2);
    expect(useGameStore.getState().score).toEqual([1, 0]);
    for (let i = 0; i < 174; i++) e.frame(1 / 120);
    expect(e.player.position.x).toBe(-1); expect(e.transition.opacity).toBe(1);
  });
  it('freezes transition time on pause', () => {
    const e = engine('match'); e.transition.begin(); e.frame(0.05); const elapsed = e.transition.elapsed;
    useGameStore.getState().pause(); e.frame(0.08); expect(e.transition.elapsed).toBe(elapsed);
  });
  it('restarts a training feed on E without awarding a point or failed attempt', () => {
    const e = engine('training'); e.cooldown = 0; e.frame(1 / 120);
    e.shuttle.position.set(0, 4, 0); e.input!.serve = true; e.frame(1 / 120);
    expect(e.shuttle.position.z).toBeLessThan(-2); expect(e.shuttle.active).toBe(true);
    expect(useGameStore.getState().trainingAttempts).toBe(0); expect(useGameStore.getState().score).toEqual([0, 0]);
  });
  it('resets hall ends and pending transitions on a rematch', () => {
    const e = engine('match'); e.ends = true; e.transition.begin();
    useGameStore.getState().start('match'); e.frame(1 / 120);
    expect(e.ends).toBe(false); expect(e.transition.active).toBe(false);
  });
});
