import { beforeEach, describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/GameEngine';
import { MAX_FRAME_LOOK } from '../src/game/input/InputManager';
import { useGameStore } from '../src/state/gameStore';
import type { InputManager } from '../src/game/input/InputManager';

function engine() {
  useGameStore.getState().setSettings({ controls: 'assisted', difficulty: 'casual' });
  useGameStore.getState().start('practice');
  const e = new GameEngine();
  e.input = { keys: new Set(), locked: true, swinging: false, dropHeld: false, swingPressed: false, pendingShot: null, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
  e.frame(1 / 120);
  return e;
}
beforeEach(() => useGameStore.getState().setSettings({ sensitivity: 1, headMotion: false }));

describe('the camera cannot be snapped by one frame of input', () => {
  it('bounds the turn when a stalled frame dumps queued mouse moves', () => {
    const e = engine(), yaw = e.player.yaw, pitch = e.player.pitch;
    e.input!.dx = 20000; e.input!.dy = -20000;
    e.frame(1 / 60);
    expect(Math.abs(e.player.yaw - yaw)).toBeLessThan(1.8);
    expect(Math.abs(e.player.pitch - pitch)).toBeLessThan(1.8);
    // The bound is the documented one, not an accident of the frame rate.
    expect(Math.abs(e.player.yaw - yaw)).toBeCloseTo(MAX_FRAME_LOOK * 0.0018, 2);
  });
  it('leaves an ordinary flick completely alone', () => {
    const e = engine(), yaw = e.player.yaw;
    e.input!.dx = 240; e.input!.dy = -90;
    e.frame(1 / 60);
    expect(e.player.yaw - yaw).toBeCloseTo(-240 * 0.0018, 6);
    expect(e.player.pitch).toBeCloseTo(-0.05 + 90 * 0.0018, 6);
  });
  it('keeps the same total turn at any substep count', () => {
    const a = engine(), b = engine();
    a.input!.dx = MAX_FRAME_LOOK; a.frame(1 / 60);
    b.input!.dx = MAX_FRAME_LOOK; b.frame(1 / 120); b.frame(1 / 120);
    expect(a.player.yaw).toBeCloseTo(b.player.yaw, 6);
  });
});
