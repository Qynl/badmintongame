import { beforeEach, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { GameEngine } from '../src/game/GameEngine';
import { GuidedSwing } from '../src/game/player/GuidedSwing';
import { PlayerController } from '../src/game/player/PlayerController';
import { RacketController } from '../src/game/player/RacketController';
import { ShuttlecockPhysics } from '../src/game/shuttle/ShuttlecockPhysics';
import { STRIKE_EARLY, STRIKE_LATE, inStrikeWindow, timeToStrike } from '../src/game/player/StrikeWindow';
import { sampleFlight } from '../src/game/ai/Prediction';
import { useGameStore } from '../src/state/gameStore';
import type { InputManager } from '../src/game/input/InputManager';
import { lookAt, watch } from './support';

beforeEach(() => useGameStore.getState().setSettings({ controls: 'assisted', difficulty: 'casual' }));

/**
 * One incoming shuttle, one player. `presses` mashes the control, `age` is how long the
 * swing has been travelling when it meets the shuttle, and `hold` keeps the button down
 * the way a beginner does.
 */
function swing(age = 0.18, presses = 1, intent?: 'smash', hold = false) {
  const player = new PlayerController(); player.position.set(0, 0, 4.4);
  const shuttle = new ShuttlecockPhysics();
  shuttle.reset(new Vector3(0, 2.6, 3.5), new Vector3(0, -2, 5)); shuttle.lastHit = 1; shuttle.served = true;
  lookAt(player, shuttle.position); // Assisted contact is gated on the shuttle being in view
  const racket = new RacketController(); racket.center.copy(shuttle.position); racket.previous.copy(shuttle.previous);
  const guide = new GuidedSwing();
  guide.track(1 / 120, racket, player, shuttle);
  for (let p = 0; p < presses; p++) {
    guide.input(1 / 120, true, hold, 0, 0, intent);
    for (let i = 0; i < 4; i++) guide.input(1 / 120, false, hold, 0, 0);
  }
  for (let i = 0; i < Math.round(age * 120); i++) guide.input(1 / 120, false, hold, 0, 0);
  guide.track(1 / 120, racket, player, shuttle);
  const contact = guide.contact(shuttle, racket, player);
  return { contact, guide, landing: sampleFlight(shuttle.position, shuttle.velocity).landing };
}

describe('swing timing is the skill in Assisted mode', () => {
  it('rewards a swing inside the window with full power and a deep landing', () => {
    const { contact, guide, landing } = swing(0.18);
    expect(contact?.quality).toBe('Perfect'); expect(guide.power).toBe(1);
    expect(landing.z).toBeLessThan(-5.2);
  });
  it('turns a stale held button into a weak, short, attackable return', () => {
    const held = swing(1.2, 1, undefined, true), timed = swing(0.18);
    expect(held.guide.power).toBeLessThan(0.65);
    expect(held.contact?.quality).toBe('Late');
    expect(held.landing.z).toBeGreaterThan(timed.landing.z + 0.6);
    expect(held.landing.z).toBeGreaterThan(-5);
  });
  it('does not let a rushed click generate a real swing', () => {
    const rushed = swing(0.02);
    expect(rushed.contact?.quality).toBe('Early'); expect(rushed.guide.power).toBeLessThan(0.9);
  });
  it('costs power and recovery time to mash the control', () => {
    const mashed = swing(0.18, 5), clean = swing();
    expect(mashed.guide.flail).toBeGreaterThan(0.6);
    expect(mashed.guide.power).toBeLessThan(clean.guide.power - 0.15);
    expect(mashed.guide.cooldown).toBeGreaterThan(clean.guide.cooldown * 1.4);
  });
  it('refuses an attack without a real swing behind it', () => {
    expect(swing(0.18, 1, 'smash').contact?.shot).toBe('Smash');
    const mashed = swing(0.18, 6, 'smash');
    expect(mashed.contact?.shot).not.toBe('Smash');
    expect(mashed.contact?.feedback).toContain('No swing behind it');
  });
  it('locks the racket out briefly for swinging at nothing', () => {
    const player = new PlayerController(); const shuttle = new ShuttlecockPhysics();
    shuttle.reset(new Vector3(0, 2, -4), new Vector3(0, -1, -2)); shuttle.lastHit = 1; shuttle.served = true;
    const guide = new GuidedSwing(), racket = new RacketController();
    guide.track(1 / 120, racket, player, shuttle);
    guide.input(1 / 120, true, false, 0, 0);
    expect(guide.armed).toBe(false);
    for (let i = 0; i < 40; i++) guide.input(1 / 120, false, false, 0, 0);
    expect(guide.armed).toBe(true);
  });
});

describe('the timing window is shown, not hidden', () => {
  it('predicts the moment of contact closely enough to swing by eye', () => {
    useGameStore.getState().start('practice');
    const e = new GameEngine();
    e.input = { keys: new Set(), locked: true, swinging: false, dropHeld: false, swingPressed: false, pendingShot: null, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
    e.frame(1 / 120); e.cooldown = 0;
    let hits = 0, error = 0, pressed = false, predicted = 0;
    for (let i = 0; i < 120 * 60; i++) {
      watch(e);
      const before = useGameStore.getState().contacts;
      if (!pressed && e.guide.cooldown === 0) {
        const seconds = timeToStrike(e.player, e.shuttle);
        if (seconds > 0.2 && seconds < 0.3) { pressed = true; predicted = seconds; e.input!.swingPressed = true; }
      }
      e.frame(1 / 120);
      if (useGameStore.getState().contacts > before) {
        hits++; error += Math.abs(predicted - e.guide.swingAge); pressed = false;
        expect(inStrikeWindow(e.guide.swingAge), `swing age ${e.guide.swingAge.toFixed(3)}`).toBe(true);
      }
    }
    expect(hits).toBeGreaterThan(4);
    expect(error / hits).toBeLessThan(0.12);
  });
  it('brackets the useful press between a swing that travels and one that is too late', () => {
    expect(STRIKE_EARLY).toBeGreaterThan(STRIKE_LATE);
    expect(inStrikeWindow(0.2)).toBe(true); expect(inStrikeWindow(1.5)).toBe(false); expect(inStrikeWindow(-1)).toBe(false);
  });
});

/** One committed swing that the shuttle never meets: what a genuine miss looks like. */
function missedSwing() {
  const player = new PlayerController(); player.position.set(0, 0, 4.4);
  const shuttle = new ShuttlecockPhysics();
  shuttle.reset(new Vector3(0, 2.6, 3.5), new Vector3(0, -2, 5)); shuttle.lastHit = 1; shuttle.served = true;
  const racket = new RacketController(); racket.center.copy(shuttle.position); racket.previous.copy(shuttle.previous);
  const guide = new GuidedSwing();
  lookAt(player, shuttle.position);
  guide.track(1 / 120, racket, player, shuttle);
  guide.input(1 / 120, true, false, 0, 0);
  return { player, shuttle, racket, guide };
}
describe('a swing that misses costs a short recovery', () => {
  it('locks the racket when the swing ends without contact, then lets go quickly', () => {
    const { player, shuttle, racket, guide } = missedSwing();
    expect(guide.armed).toBe(true); expect(guide.recovering).toBe(false);
    for (let i = 0; i < 120 && !guide.recovering; i++) { guide.input(1 / 120, false, false, 0, 0); guide.track(1 / 120, racket, player, shuttle); }
    expect(guide.recovering).toBe(true);
    expect(guide.contact(shuttle, racket, player)).toBeNull(); // dead while the racket resets
    let frames = 0;
    while (guide.recovering && frames < 120) { guide.input(1 / 120, false, false, 0, 0); frames++; }
    expect(frames / 120).toBeLessThan(0.3); // short: a third of a second at most
    expect(frames / 120).toBeGreaterThan(0.1);
  });
  it('never delays the next swing after a clean contact', () => {
    const { contact, guide } = swing(0.18);
    expect(contact).toBeTruthy();
    expect(guide.recovering).toBe(false);
    expect(guide.cooldown).toBeGreaterThan(0); expect(guide.cooldown).toBeLessThan(0.6);
    for (let i = 0; i < 90; i++) guide.input(1 / 120, false, false, 0, 0);
    expect(guide.recovering).toBe(false);
  });
  it('reports the miss to the HUD and clears it again', () => {
    useGameStore.getState().start('practice');
    const e = new GameEngine();
    e.input = { keys: new Set(), locked: true, swinging: false, dropHeld: false, swingPressed: false, pendingShot: null, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
    e.frame(1 / 120); e.cooldown = 0;
    let pressed = false;
    for (let i = 0; i < 600 && !pressed; i++) {
      e.frame(1 / 120);
      // Swing once while the shuttle is still at the far end: nothing there to hit.
      if (e.shuttle.active && e.shuttle.position.z < -1) { e.input!.swingPressed = true; pressed = true; }
    }
    expect(pressed).toBe(true);
    // The HUD is published on an 0.08 s tick, so give the state a few frames to reach it.
    let shown = 0;
    while (!useGameStore.getState().swingMissed && shown < 20) { e.frame(1 / 120); shown++; }
    expect(useGameStore.getState().swingMissed).toBe(true);
    expect(useGameStore.getState().contacts).toBe(0);
    let cleared = 0;
    while (useGameStore.getState().swingMissed && cleared < 120) { e.frame(1 / 120); cleared++; }
    expect(useGameStore.getState().swingMissed).toBe(false);
    expect((shown + cleared) / 120).toBeLessThan(0.6); // the whole recovery, HUD tick included
  });
});
