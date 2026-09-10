import { beforeEach, describe, expect, it } from 'vitest';
import { MathUtils, Vector3 } from 'three';
import { GameEngine } from '../src/game/GameEngine';
import { GuidedSwing } from '../src/game/player/GuidedSwing';
import { PlayerController } from '../src/game/player/PlayerController';
import { RacketController } from '../src/game/player/RacketController';
import { ShuttlecockPhysics } from '../src/game/shuttle/ShuttlecockPhysics';
import { inView, halfViewAngle, VIEW_ASPECT, VIEW_FOV, VIEW_MARGIN } from '../src/game/player/ViewGate';
import { useGameStore } from '../src/state/gameStore';
import { sampleFlight } from '../src/game/ai/Prediction';
import { lookAt } from './support';
import type { InputManager } from '../src/game/input/InputManager';

/** A point this many degrees off the gaze, at this distance: how the tests place things off screen. */
const off = (degrees: number, distance: number) => Math.tan(MathUtils.degToRad(degrees)) * distance;

/** A player standing on their back court line with an incoming shuttle they can reach. */
function scene(pitch: number, yaw = 0) {
  const player = new PlayerController(); player.position.set(0, 0, 4.4); player.pitch = pitch; player.yaw = yaw;
  const shuttle = new ShuttlecockPhysics();
  shuttle.reset(new Vector3(0, 2.6, 3.5), new Vector3(0, -2, 5)); shuttle.lastHit = 1; shuttle.served = true;
  const racket = new RacketController(); racket.center.copy(shuttle.position); racket.previous.copy(shuttle.previous);
  const guide = new GuidedSwing();
  return { player, shuttle, racket, guide };
}
function strike(pitch: number, yaw = 0) {
  const { player, shuttle, racket, guide } = scene(pitch, yaw);
  guide.track(1 / 120, racket, player, shuttle);
  guide.input(1 / 120, true, false, 0, 0);
  for (let i = 0; i < 12; i++) guide.input(1 / 120, false, false, 0, 0);
  guide.track(1 / 120, racket, player, shuttle);
  return { contact: guide.contact(shuttle, racket, player), seen: guide.seen };
}

beforeEach(() => useGameStore.getState().setSettings({ controls: 'assisted', difficulty: 'casual' }));

describe('assisted contact needs the shuttle in view', () => {
  it('sees what is in front of the camera cone and nothing else', () => {
    const player = new PlayerController(); player.position.set(0, 0, 4.4);
    const eye = player.eyeHeight;
    expect(inView(player, new Vector3(0, eye, -1))).toBe(true); // straight ahead
    expect(inView(player, new Vector3(0, eye - 0.25, 3.4))).toBe(true); // the shuttle, in front
    expect(inView(player, new Vector3(0, eye, 6))).toBe(false); // behind
    expect(inView(player, new Vector3(-off(60, 3), eye, 1.4))).toBe(false); // wide of the frame
    expect(inView(player, new Vector3(0, eye + off(60, 3), 1.4))).toBe(false); // above the frame
    expect(inView(player, new Vector3(0, eye + 0.1, 4.45))).toBe(true); // at the strings, always seen
    // The vertical half-angle of a 72 degree camera, plus the margin, is what the gate allows.
    expect(Math.atan(halfViewAngle(VIEW_FOV) * VIEW_MARGIN) * 180 / Math.PI).toBeCloseTo(41, 0);
  });
  it('widens the horizontal cone on a widescreen but never the vertical one', () => {
    const player = new PlayerController(); player.position.set(0, 0, 0);
    const side = new Vector3(off(60, 3), player.eyeHeight, -3);
    expect(inView(player, side, 1)).toBe(false); // 60 degrees off is off screen on a square viewport
    expect(inView(player, side, 2.4)).toBe(true); // but still on a widescreen
    const high = new Vector3(0, player.eyeHeight + off(60, 3), -3);
    expect(inView(player, high, 2.4)).toBe(false); // the vertical cone never widens with aspect
  });
  it('connects when you watch the shuttle and refuses when you look away', () => {
    const watching = strike(Math.atan2(2.6 - 1.68, 0.9));
    expect(watching.seen).toBe(true); expect(watching.contact?.shot).toBeTruthy();
    const floor = strike(-1.2); // staring at your own shoes
    expect(floor.seen).toBe(false); expect(floor.contact).toBeNull();
    // A high shuttle stays in a 72 degree camera even when you look up, so the way to lose it
    // is to look down or to turn away: both refuse the swing.
    const turned = strike(-0.05, 1.4); // looking 80 degrees to the side
    expect(turned.seen).toBe(false); expect(turned.contact).toBeNull();
  });
  it('keeps the swing from connecting no matter how hard you spam while looking away', () => {
    const { player, shuttle, racket, guide } = scene(-1.2);
    for (let i = 0; i < 120; i++) {
      guide.input(1 / 120, i % 4 === 0, true, 0, 0);
      guide.track(1 / 120, racket, player, shuttle);
      expect(guide.contact(shuttle, racket, player)).toBeNull();
    }
    lookAt(player, shuttle.position);
    guide.input(1 / 120, true, false, 0, 0);
    for (let i = 0; i < 12; i++) guide.input(1 / 120, false, false, 0, 0);
    guide.track(1 / 120, racket, player, shuttle);
    expect(guide.contact(shuttle, racket, player)?.shot).toBeTruthy();
  });
  it('still lets you serve by looking at the far service box', () => {
    useGameStore.getState().start('match');
    const e = new GameEngine();
    e.input = { keys: new Set(), locked: true, swinging: false, dropHeld: false, swingPressed: false, pendingShot: null, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
    e.frame(1 / 120); e.cooldown = 0;
    // Aim the serve deep into the diagonal box: level, turned toward the corner, not at the shuttle.
    e.player.yaw = 0.22; e.player.pitch = -0.02; e.input.serve = true;
    for (let i = 0; i < 120 && !useGameStore.getState().contacts; i++) e.frame(1 / 120);
    expect(useGameStore.getState().contacts).toBe(1);
    expect(useGameStore.getState().shot).toBe('Serve');
    const landing = sampleFlight(e.shuttle.position, e.shuttle.velocity).landing;
    expect(landing.z).toBeLessThan(-2.05); expect(landing.x).toBeLessThan(0);
  });
  it('tells the player the shuttle is out of view instead of failing silently', () => {
    useGameStore.getState().start('practice');
    const e = new GameEngine();
    e.input = { keys: new Set(), locked: true, swinging: false, dropHeld: false, swingPressed: false, pendingShot: null, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
    e.frame(1 / 120); e.cooldown = 0;
    let blind = 0, contacts = 0;
    for (let i = 0; i < 1200; i++) {
      e.player.pitch = -1.2; e.input.swinging = true; // mash at the floor
      e.frame(1 / 120);
      if (!useGameStore.getState().shuttleSeen) blind++;
      contacts = useGameStore.getState().contacts;
    }
    expect(blind).toBeGreaterThan(400);
    expect(contacts).toBe(0);
  });
});
