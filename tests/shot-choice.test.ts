import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { planAssistedShot } from '../src/game/player/ShotPlanner';
import { sampleFlight } from '../src/game/ai/Prediction';
import { chooseShot } from '../src/game/ai/DecisionMaking';
import { useGameStore } from '../src/state/gameStore';
import { GameEngine } from '../src/game/GameEngine';
import type { InputManager } from '../src/game/input/InputManager';
import { OpponentAI } from '../src/game/ai/OpponentAI';
import { ShuttlecockPhysics } from '../src/game/shuttle/ShuttlecockPhysics';
import { GuidedSwing } from '../src/game/player/GuidedSwing';

beforeEach(() => useGameStore.getState().setSettings({ controls: 'assisted', difficulty: 'casual' }));
describe('deliberate assisted shot choices', () => {
  for (const height of [2.2, 2.6, 3.0]) for (const depth of [1.2, 3.5, 5.8]) {
    it(`produces a genuine downward smash at height ${height}, depth ${depth}`, () => {
      const from = new Vector3(0, height, depth), plan = planAssistedShot(from, 1, 'smash', true);
      const flight = sampleFlight(from, plan.velocity);
      expect(plan.shot).toBe('Smash'); expect(plan.velocity.y).toBeLessThan(-0.2);
      expect(plan.velocity.length()).toBeGreaterThan(22); expect(flight.netY).toBeGreaterThan(1.55);
      expect(Math.abs(flight.landing.x)).toBeLessThan(2.61); expect(flight.landing.z).toBeGreaterThan(-6.72); expect(flight.landing.z).toBeLessThan(0);
    });
  }
  it('makes the right-click drop land short instead of giving the same lob as left-click', () => {
    const from = new Vector3(0, 2.7, 4);
    const drop = planAssistedShot(from, -1, 'drop'), rally = planAssistedShot(from, -1, 'rally');
    expect(drop.shot).toBe('Drop');
    expect(sampleFlight(from, drop.velocity).landing.z).toBeGreaterThan(-1.6);
    expect(sampleFlight(from, rally.velocity).landing.z).toBeLessThan(-4.6);
    expect(drop.velocity.length()).toBeLessThan(rally.velocity.length());
  });
  it('uses a delicate net shot for right-click near the tape', () => {
    const from = new Vector3(0, 1.5, 1.1), plan = planAssistedShot(from, 0.4, 'drop');
    expect(plan.shot).toBe('Net shot'); expect(plan.velocity.length()).toBeLessThan(8);
    expect(sampleFlight(from, plan.velocity).netY).toBeGreaterThan(1.55);
  });
  it('does not label a low-contact fallback as a smash', () => {
    const plan = planAssistedShot(new Vector3(0, 1.3, 3.5), 0, 'smash');
    expect(plan.shot).not.toBe('Smash'); expect(plan.attacking).toBe(false); expect(plan.feedback).toContain('Low contact');
  });
  it('rewards a fresh timed strike with more pace than an automatic held strike', () => {
    const from = new Vector3(0, 2.7, 3.5);
    expect(planAssistedShot(from, 0, 'smash', true).velocity.length()).toBeGreaterThan(planAssistedShot(from, 0, 'smash', false).velocity.length() + 5);
  });
  it('does not erase a queued F smash while left-click is held', () => {
    const guide = new GuidedSwing(); guide.input(1 / 120, true, true, 0, 0, 'smash');
    for (let i = 0; i < 30; i++) guide.input(1 / 120, false, true, 0, 0);
    expect(guide.intent).toBe('smash');
    guide.input(1 / 120, true, true, 0, 0, 'drop'); expect(guide.intent).toBe('drop');
  });
});
describe('shot choices through the live engine', () => {
  function setup() {
    useGameStore.getState().start('practice'); const engine = new GameEngine();
    engine.input = { keys: new Set(), locked: true, swinging: false, dropHeld: false, swingPressed: false, pendingShot: null, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
    engine.frame(1 / 120); engine.cooldown = 0; return engine;
  }
  it('F produces a smash on an actual automatic feed without a mouse flick', () => {
    const e = setup(); let pressed = false;
    for (let i = 0; i < 700; i++) {
      if (e.guide.smashReady && !pressed) { e.input!.pendingShot = 'smash'; e.input!.keys.add('KeyF'); pressed = true; }
      e.frame(1 / 120); if (useGameStore.getState().contacts) break;
    }
    expect(pressed).toBe(true); expect(useGameStore.getState().shot).toBe('Smash'); expect(e.shuttle.velocity.y).toBeLessThan(0);
  });
  it('right-click produces a drop on an actual feed without moving the mouse', () => {
    const e = setup(); e.input!.dropHeld = true; e.input!.pendingShot = 'drop';
    for (let i = 0; i < 700; i++) { e.frame(1 / 120); if (useGameStore.getState().contacts) break; }
    expect(useGameStore.getState().shot).toBe('Drop'); expect(sampleFlight(e.shuttle.position, e.shuttle.velocity).landing.z).toBeGreaterThan(-1.6);
  });
});
describe('rallies create different decisions', () => {
  it('mixes attackable lifts, short placement and sideways placement in a match', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const from = new Vector3(0, 2, -4), player = new Vector3(0.9, 0, 4);
      const choices = [0, 1, 2, 3].map(sequence => chooseShot(from, player, 'casual', true, { pressure: 0, sequence, relaxed: false }));
      expect(choices[0].target.y).toBeGreaterThan(2.5);
      expect(choices[1].target.y).toBeLessThan(2.2);
      expect(choices[2].target.y).toBe(0); expect(choices[2].target.z).toBeLessThan(3);
      expect(choices[3].target.x).toBeLessThan(0);
    } finally { random.mockRestore(); }
  });
  it('forces a higher defensive reply from a pressured opponent', () => {
    const shot = chooseShot(new Vector3(0, 1, -1), new Vector3(0, 0, 4), 'club', true, { pressure: 0.8, sequence: 2, relaxed: false });
    expect(shot.target.y).toBeGreaterThan(2.5); expect(shot.loft).toBeGreaterThan(10);
  });
  it('keeps free-practice feeds friendly instead of forcing match tactics', () => {
    const shot = chooseShot(new Vector3(0, 2, -4), new Vector3(0.5, 0, 4), 'casual', true, { pressure: 0, sequence: 2, relaxed: true });
    expect(shot.target.y).toBeCloseTo(1.85); expect(shot.target.z).toBeCloseTo(3.15);
  });
});
it('buffers a different shot during follow-through rather than discarding the input', () => {
  const guide = new GuidedSwing(); guide.cooldown = 0.25;
  guide.input(1 / 120, true, false, 0, 0, 'drop'); expect(guide.armed).toBe(false);
  for (let i = 0; i < 35; i++) guide.input(1 / 120, false, false, 0, 0);
  expect(guide.armed).toBe(true); expect(guide.intent).toBe('drop');
});
for (const goal of ['Clear', 'Drop', 'Smash', 'Net shot'] as const) it(`makes the ${goal} training feed reachable using its assisted control`, () => {
  useGameStore.setState({ trainingShot: goal }); useGameStore.getState().start('training');
  const e = new GameEngine(); e.input = { keys: new Set(), locked: true, swinging: false, dropHeld: false, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
  e.frame(1 / 120); e.cooldown = 0;
  if (goal === 'Smash') e.input.keys.add('KeyF'); else if (goal === 'Clear') e.input.swinging = true; else e.input.dropHeld = true;
  for (let i = 0; i < 800; i++) { e.frame(1 / 120); if (useGameStore.getState().contacts) break; }
  expect(useGameStore.getState().shot).toBe(goal);
  for (let i = 0; i < 600 && !useGameStore.getState().trainingAttempts; i++) e.frame(1 / 120);
  expect(useGameStore.getState().trainingSuccess).toBe(1);
});
it('turns a real high reply into a smash winner and resets its statistics for a new match', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  try {
    useGameStore.getState().start('match');
    const e = new GameEngine(); e.input = { keys: new Set(), locked: true, swinging: false, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
    e.frame(1 / 120); e.cooldown = 0; e.input.serve = true;
    for (let i = 0; i < 2000; i++) {
      if (e.guide.smashReady && useGameStore.getState().contacts === 1) { e.input.keys.add('KeyF'); random.mockReturnValue(0); }
      e.frame(1 / 120);
      if (useGameStore.getState().contacts === 2) random.mockReturnValue(0);
      if (useGameStore.getState().rallies) break;
    }
    expect(useGameStore.getState().smashWinners).toBe(1);
    expect(useGameStore.getState().message).toContain('Smash winner');
    expect(useGameStore.getState().score).toEqual([1, 0]);
    useGameStore.getState().start('match'); expect(useGameStore.getState().winners).toBe(0); expect(useGameStore.getState().smashWinners).toBe(0);
  } finally { random.mockRestore(); }
});

it('remembers repeated short shots across points and adjusts its recovery depth', () => {
  const ai = new OpponentAI(), from = new Vector3(0, 2.7, 3.5), player = new Vector3(0, 0, 4.5);
  const shuttle = new ShuttlecockPhysics();
  for (let i = 0; i < 3; i++) {
    ai.reset(); shuttle.reset(from, planAssistedShot(from, 0, 'drop').velocity); shuttle.served = true; shuttle.lastHit = 0;
    ai.step(0.5, shuttle, player, 'casual', 1, true);
  }
  expect(ai.shortMemory).toBeGreaterThan(0.7);
  shuttle.active = false; ai.step(1 / 120, shuttle, player, 'casual', 1, true);
  expect(ai.target.z).toBeGreaterThan(-2.8);
});
it('does not turn F or right-click into assisted contact in Simulation', () => {
  useGameStore.getState().setSettings({ controls: 'simulation' }); useGameStore.getState().start('practice');
  const e = new GameEngine(); e.input = { keys: new Set(), locked: true, swinging: false, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
  e.frame(1 / 120); e.cooldown = 0; e.input.keys.add('KeyF'); e.input.dropHeld = true; e.input.pendingShot = 'smash';
  for (let i = 0; i < 800; i++) e.frame(1 / 120);
  expect(useGameStore.getState().contacts).toBe(0); expect(e.guide.connected).toBe(false);
});
