import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { OpponentAI } from '../src/game/ai/OpponentAI';
import { planAssistedShot } from '../src/game/player/ShotPlanner';
import { sampleFlight } from '../src/game/ai/Prediction';
import { ShuttlecockPhysics } from '../src/game/shuttle/ShuttlecockPhysics';

function defend(x: number, aim: number, difficulty: 'casual' | 'club' | 'expert', timed = true) {
  const ai = new OpponentAI(); ai.position.set(x, 0, -3.8); ai.reset();
  const from = new Vector3(0, 2.8, 3.5), plan = planAssistedShot(from, aim, 'smash', timed);
  const shuttle = new ShuttlecockPhysics(); shuttle.reset(from, plan.velocity); shuttle.lastHit = 0; shuttle.served = true; shuttle.hitCooldown = 0.35;
  let returned = false, maxStep = 0;
  for (let i = 0; i < 240 && shuttle.position.y > 0; i++) {
    const before = ai.position.clone(); shuttle.step(1 / 120);
    returned = ai.step(1 / 120, shuttle, new Vector3(0, 0, 4.5), difficulty, 2, true);
    maxStep = Math.max(maxStep, ai.position.distanceTo(before)); if (returned) break;
  }
  return { ai, shuttle, returned, maxStep };
}
describe('smash defense is positional, not a free point or invincibility', () => {
  for (const difficulty of ['casual', 'club', 'expert'] as const) it(`${difficulty} can return a smash hit at its body`, () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      for (const x of [-1.2, 0, 1.2]) {
        const result = defend(x, x, difficulty);
        expect(result.returned, `body smash at ${x}`).toBe(true);
        expect(result.maxStep).toBeLessThan(0.065);
        expect(sampleFlight(result.shuttle.position, result.shuttle.velocity).netY).toBeGreaterThan(1.55);
        expect(['Block', 'Lift']).toContain(result.ai.lastShot);
      }
    } finally { random.mockRestore(); }
  });
  it('cannot teleport across the court to save an open-court smash', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try { expect(defend(-2.4, 2.2, 'casual').returned).toBe(false); } finally { random.mockRestore(); }
  });
  it('even Expert still makes execution mistakes', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try { expect(defend(0, 0, 'expert').returned).toBe(false); } finally { random.mockRestore(); }
  });
});
it('punishes a short high reply with an actual downward counterattack', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  try {
    const ai = new OpponentAI(); ai.position.set(0, 0, -2.3); ai.returns = 2; ai.lastFlight = 4;
    const shuttle = new ShuttlecockPhysics(); shuttle.reset(new Vector3(0, 2.7, -2.3), new Vector3(0, -2, -4)); shuttle.served = true; shuttle.lastHit = 0;
    expect(ai.step(1 / 120, shuttle, new Vector3(0.7, 0, 4.3), 'club', 4, true)).toBe(true);
    expect(ai.lastShot).toBe('Smash'); expect(shuttle.velocity.y).toBeLessThan(0); expect(shuttle.velocity.z).toBeGreaterThan(0);
    expect(sampleFlight(shuttle.position, shuttle.velocity).netY).toBeGreaterThan(1.55);
  } finally { random.mockRestore(); }
});
it('can also lift a smash back instead of always using the short block', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);
  try { const result = defend(0, 0, 'club'); expect(result.returned).toBe(true); expect(result.ai.lastShot).toBe('Lift'); } finally { random.mockRestore(); }
});
it('defense success varies by placement over seeded trials, not by making every smash fail', () => {
  let seed = 9182;
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  try {
    let body = 0, open = 0;
    for (let i = 0; i < 80; i++) { body += Number(defend(0, 0, 'casual').returned); open += Number(defend(-2.4, 2.2, 'casual').returned); }
    expect(body).toBeGreaterThan(48); expect(body).toBeLessThan(80); expect(open).toBeLessThan(body / 2);
  } finally { random.mockRestore(); }
});
it('plays the smash → block → moving player return through the full engine', async () => {
  const { GameEngine } = await import('../src/game/GameEngine');
  const { useGameStore } = await import('../src/state/gameStore');
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  try {
    useGameStore.getState().setSettings({ controls: 'assisted', difficulty: 'casual' }); useGameStore.getState().start('match');
    const e = new GameEngine();
    e.input = { keys: new Set(), locked: true, swinging: false, serve: false, dx: 0, dy: 0, jump: false } as import('../src/game/input/InputManager').InputManager;
    e.frame(1 / 120); e.player.position.set(0, 0, 4.5); e.player.yaw = 0; e.opponent.position.set(0, 0, -3.8); e.opponent.reset(); e.match.hits = 2;
    const from = new Vector3(0, 2.8, 3.5); e.shuttle.reset(from, planAssistedShot(from, 0, 'smash', true).velocity); e.shuttle.served = true; e.shuttle.lastHit = 0; e.shuttle.hitCooldown = 0.35;
    let blocked = false;
    for (let i = 0; i < 600; i++) {
      e.frame(1 / 120);
      if (e.shuttle.lastHit === 1) { blocked = true; e.input.swinging = true; if (e.player.position.z > 2.2) e.input.keys.add('KeyW'); else e.input.keys.delete('KeyW'); }
      if (useGameStore.getState().contacts) break;
    }
    expect(blocked).toBe(true); expect(useGameStore.getState().opponentShot).toBe('Block');
    expect(useGameStore.getState().contacts).toBe(1); expect(e.match.hits).toBe(4);
  } finally { random.mockRestore(); }
});
