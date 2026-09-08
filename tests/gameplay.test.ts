import { it, expect } from 'vitest';
import { GameEngine } from '../src/game/GameEngine';
import { useGameStore } from '../src/state/gameStore';
import type { InputManager } from '../src/game/input/InputManager';
it('finds a playable motion-driven legal serve in Simulation mode', () => {
  useGameStore.getState().setSettings({ controls: 'simulation' });
  const results: unknown[] = [];
  for (const delay of [0, 4, 8, 12, 16]) for (const dy of [-50, -30, -15, 15, 30, 50]) {
    useGameStore.getState().start('match'); const e = new GameEngine();
    e.input = {keys:new Set(),locked:true,dx:0,dy:0,swinging:false,serve:false,jump:false} as InputManager;
    e.frame(1 / 120); e.cooldown = 0; e.input.serve = true; e.frame(1 / 120);
    for (let i=0; i<180; i++) { e.input.swinging = i >= delay && i < delay + 6; e.input.dy = i >= delay && i < delay + 6 ? dy / 6 : 0; e.frame(1 / 120); if (e.shuttle.crossedNet && e.shuttle.lastHit === 0) { results.push({delay,dy,speed:useGameStore.getState().speed}); break; } }
  }
  expect(results.length).toBeGreaterThan(0);
});
