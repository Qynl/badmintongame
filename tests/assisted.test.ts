import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Vector3 } from 'three';
import { GameEngine } from '../src/game/GameEngine';
import { RacketController } from '../src/game/player/RacketController';
import { GuidedSwing } from '../src/game/player/GuidedSwing';
import { PlayerController } from '../src/game/player/PlayerController';
import { ShuttlecockPhysics } from '../src/game/shuttle/ShuttlecockPhysics';
import { useGameStore, validateSettings } from '../src/state/gameStore';
import type { InputManager } from '../src/game/input/InputManager';
import { sampleFlight } from '../src/game/ai/Prediction';

function setup(mode: 'match' | 'practice' = 'practice') {
  useGameStore.getState().start(mode);
  const e = new GameEngine();
  e.input = { keys: new Set(), locked: true, swinging: false, swingPressed: false, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
  e.frame(1 / 120); e.cooldown = 0; return e;
}
function click(e: GameEngine) { e.input!.swingPressed = true; e.input!.swinging = false; }
beforeEach(() => useGameStore.getState().setSettings({ controls: 'assisted', difficulty: 'casual' }));
describe('accessible contact regressions', () => {
  it('migrates existing settings to Assisted without dropping preferences', () => {
    expect(validateSettings({ volume: 0.2, difficulty: 'expert' })).toMatchObject({ controls: 'assisted', guides: true, volume: 0.2, difficulty: 'expert' });
    expect(validateSettings({ controls: 'simulation' }).controls).toBe('simulation');
  });
  it('serves with a single click and no mouse motion', () => {
    const e = setup('match'); click(e);
    for (let i = 0; i < 240; i++) { e.frame(1 / 120); if (useGameStore.getState().contacts > 0) break; }
    expect(useGameStore.getState().contacts).toBe(1);
    expect(useGameStore.getState().shot).toBe('Serve'); expect(e.shuttle.position.y).toBeLessThan(1.15);
    const landing = sampleFlight(e.shuttle.position, e.shuttle.velocity);
    expect(landing.netY).toBeGreaterThan(1.55); expect(landing.landing.x).toBeLessThan(0); expect(landing.landing.z).toBeLessThan(-1.98);
  });
  for (const reaction of [0, 12, 24]) it(`returns a real feed with one click after ${reaction / 120}s reaction time, no aiming or mouse motion`, () => {
    const e = setup(); let inRange = 0, clicked = false;
    for (let i = 0; i < 900; i++) {
      if (e.guide.canReach(e.player, e.shuttle)) { if (inRange++ >= reaction && !clicked) { click(e); clicked = true; } }
      e.frame(1 / 120); if (useGameStore.getState().contacts) break;
    }
    expect(clicked).toBe(true); expect(useGameStore.getState().contacts).toBe(1);
    const flight = sampleFlight(e.shuttle.position, e.shuttle.velocity);
    expect(flight.netY).toBeGreaterThan(1.55); expect(Math.abs(flight.landing.x)).toBeLessThan(2.61);
    expect(flight.landing.z).toBeLessThan(0); expect(flight.landing.z).toBeGreaterThan(-6.72);
  });
  it('lets a beginner hold the button and connect with at least 8 out of 10 incoming feeds', () => {
    const e = setup(); let feeds = 0, successes = 0;
    while (feeds++ < 10) {
      e.serve(); e.input!.swinging = true;
      const before = useGameStore.getState().contacts;
      for (let i = 0; i < 600; i++) { e.frame(1 / 120); if (useGameStore.getState().contacts > before || !e.shuttle.active) break; }
      successes += Number(useGameStore.getState().contacts > before);
    }
    expect(successes).toBeGreaterThanOrEqual(8);
  });
  it('sustains a friendly rally beyond the old 18-second cutoff without moving or precision aiming', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const e = setup(); e.input!.swinging = true;
      for (let i = 0; i < 4800; i++) e.frame(1 / 120);
      expect(useGameStore.getState().contacts).toBeGreaterThanOrEqual(5);
      expect(e.match.hits).toBeGreaterThanOrEqual(8);
      expect(e.match.rallyTime).toBeGreaterThan(18);
      expect(e.shuttle.active).toBe(true);
    } finally { random.mockRestore(); }
  });
  for (const [name, position, dy] of [
    ['Clear', [0, 2.8, 3.5], -40], ['Drop', [0, 2.8, 3.5], 20], ['Smash', [0, 2.8, 1.4], 80], ['Net shot', [0, 1.5, 1.2], 20],
  ] as const) it(`allows a ${name} through mouse intent without a shot button`, () => {
    const player = new PlayerController(); player.position.set(0, 0, position[2] + 0.9);
    const shuttle = new ShuttlecockPhysics(); shuttle.reset(new Vector3(...position), new Vector3(0, -2, 5)); shuttle.lastHit = 1; shuttle.served = true;
    const racket = new RacketController(); racket.center.copy(shuttle.position); racket.previous.copy(shuttle.previous);
    const guide = new GuidedSwing(); guide.input(1 / 120, true, false, 0, dy); guide.track(1 / 120, racket, player, shuttle);
    const contact = guide.contact(shuttle, racket, player); expect(contact?.shot).toBe(name);
    const flight = sampleFlight(shuttle.position, shuttle.velocity); expect(flight.netY).toBeGreaterThan(1.55);
  });
  it('does not hit without player swing input', () => {
    const e = setup(); for (let i = 0; i < 720; i++) e.frame(1 / 120);
    expect(useGameStore.getState().contacts).toBe(0);
  });
  it('does not allow hits across the court, behind the player, or above human reach', () => {
    const g = new GuidedSwing(), p = new PlayerController(), s = new ShuttlecockPhysics();
    s.active = true; s.served = true; s.lastHit = 1;
    s.position.set(0, 1.5, -3); expect(g.canReach(p, s)).toBe(false);
    s.position.copy(p.position).add(new Vector3(0, 1.5, 1)); expect(g.canReach(p, s)).toBe(false);
    s.position.copy(p.position).add(new Vector3(0, 4, -0.7)); expect(g.canReach(p, s)).toBe(false);
    s.position.copy(p.position).add(new Vector3(0, 2, -0.7)); expect(g.canReach(p, s)).toBe(true);
    s.lastHit = 0; expect(g.canReach(p, s)).toBe(false);
  });
  it('keeps the original exact-contact mode available without the assisted swing', () => {
    useGameStore.getState().setSettings({ controls: 'simulation' }); const e = setup();
    e.input!.swinging = true;
    for (let i = 0; i < 600; i++) e.frame(1 / 120);
    // Merely holding still cannot perform a guided return in Simulation mode.
    expect(e.guide.connected).toBe(false);
  });
});
