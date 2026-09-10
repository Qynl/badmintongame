import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { awardPoint, initialScore, landingWinner } from '../src/game/match/Scoring';
import { servicePositions, validServiceLanding } from '../src/game/match/ServeSystem';
import { integrateFlight } from '../src/game/physics/Aerodynamics';
import { racketContact, netCrossing, classifyShot } from '../src/game/physics/CollisionSystem';
import { ShuttlecockPhysics } from '../src/game/shuttle/ShuttlecockPhysics';
import { RacketController } from '../src/game/player/RacketController';
import { PlayerController } from '../src/game/player/PlayerController';
import { predictFlight, solveLaunch } from '../src/game/ai/Prediction';
import type { InputManager } from '../src/game/input/InputManager';
import type { Settings } from '../src/state/gameStore';

describe('rally scoring', () => {
  it('awards a point and service to the rally winner without mutating the old state', () => { const old = initialScore(); const next = awardPoint(old, 1); expect(next.points).toEqual([0, 1]); expect(next.server).toBe(1); expect(old.points).toEqual([0, 0]); });
  it('requires a two-point lead at 20-all', () => { const s = initialScore(); s.points = [20, 20]; const next = awardPoint(s, 0); expect(next.game).toBe(1); expect(next.points).toEqual([21, 20]); const win = awardPoint(next, 0); expect(win.games).toEqual([1, 0]); expect(win.points).toEqual([0, 0]); expect(win.ends).toBe(true); });
  it('caps a game at 30', () => { const s = initialScore(); s.points = [29, 29]; expect(awardPoint(s, 1).games).toEqual([0, 1]); });
  it('ends a best of three after two wins', () => { const s = initialScore(); s.games = [1, 0]; s.points = [20, 5]; expect(awardPoint(s, 0).winner).toBe(0); });
  it('changes ends once at 11 in the deciding game', () => { const s = initialScore(); s.game = 3; s.games = [1, 1]; s.points = [10, 9]; const switched = awardPoint(s, 0); expect(switched.ends).toBe(true); const next = awardPoint(awardPoint(switched, 1), 1); expect(next.ends).toBe(true); });
  it('does not score after match completion', () => { const s = initialScore(); s.winner = 0; expect(awardPoint(s, 1)).toBe(s); });
  it('calls singles lines in and out with line width included', () => { expect(landingWinner(2.60, -6.70, 0, true)).toBe(0); expect(landingWinner(2.65, -6.70, 0, true)).toBe(1); expect(landingWinner(0, 3, 0, false)).toBe(1); });
  it('uses diagonal service courts and alternating right/left service', () => { const s = initialScore(); expect(servicePositions(s).player.x).toBe(1); s.points = [1, 0]; expect(servicePositions(s).player.x).toBe(-1); expect(validServiceLanding(-1, -4, 0, true)).toBe(true); expect(validServiceLanding(1, -4, 0, true)).toBe(false); expect(validServiceLanding(-1, -1, 0, true)).toBe(false); expect(validServiceLanding(1, 4, 1, true)).toBe(true); });
});
describe('shuttle aerodynamics', () => {
  it('rapidly dissipates smash speed without instability', () => { const p = new Vector3(0, 8, 0), v = new Vector3(0, 0, 90); for (let i = 0; i < 60; i++) integrateFlight(p, v, 1 / 120); expect(v.z).toBeLessThan(10); expect(v.z).toBeGreaterThan(0); expect(Number.isFinite(p.length())).toBe(true); });
  it('approaches a feather-shuttle terminal fall speed', () => { const p = new Vector3(0, 100, 0), v = new Vector3(); for (let i = 0; i < 1200; i++) integrateFlight(p, v, 1 / 120); expect(-v.y).toBeGreaterThan(6.5); expect(-v.y).toBeLessThan(7); });
  it('gives consistent outcomes at different substeps', () => { const a = new Vector3(0, 2, 0), b = a.clone(), va = new Vector3(1, 12, -22), vb = va.clone(); for (let i = 0; i < 120; i++) integrateFlight(a, va, 1 / 120); for (let i = 0; i < 240; i++) integrateFlight(b, vb, 1 / 240); expect(a.distanceTo(b)).toBeLessThan(0.1); });
  it('predicts without mutating the live flight', () => { const p = new Vector3(0, 2, 4), v = new Vector3(0, 10, -20), old = p.clone(); const prediction = predictFlight(p, v); expect(p.equals(old)).toBe(true); expect(prediction.reachable).toBe(true); expect(prediction.position.z).toBeLessThan(0); expect(prediction.landing.y).toBeLessThanOrEqual(0); });
  it('solves a drag-aware launch that lands close to its target', () => { const p = new Vector3(-1, 1.1, -4), target = new Vector3(1, 0, 5); const v = solveLaunch(p, target, 11); for (let i = 0; i < 600; i++) { integrateFlight(p, v, 1 / 120); if (p.y <= 0) break; } expect(Math.hypot(p.x - target.x, p.z - target.z)).toBeLessThan(0.15); });
});
function collision(offsetX = 0) { const s = new ShuttlecockPhysics(); s.active = true; s.served = true; s.previous.set(offsetX, 0, -0.12); s.position.set(offsetX, 0, 0.12); s.velocity.set(0, 0, 25); const r = new RacketController(); r.center.set(0, 0, 0); r.previous.copy(r.center); r.velocity.set(0, 0, -8); return { s, r }; }
describe('swept string-bed contact', () => {
  it('catches fast crossings between physics frames', () => { const { s, r } = collision(); const hit = racketContact(s, r); expect(hit?.quality).toBe('Perfect'); expect(s.velocity.z).toBeLessThan(0); expect(s.hitCooldown).toBeGreaterThan(0); });
  it('allows a real miss outside the racket ellipse', () => { const { s, r } = collision(0.3); expect(racketContact(s, r)).toBeNull(); });
  it('reduces off-center power', () => { const clean = collision(), edge = collision(0.15); const a = racketContact(clean.s, clean.r)!, b = racketContact(edge.s, edge.r)!; expect(b.quality).toBe('Off-center'); expect(b.speed).toBeLessThan(a.speed); });
  it('prevents duplicate contact from the same intersection', () => { const { s, r } = collision(); racketContact(s, r); expect(racketContact(s, r)).toBeNull(); });
  it('distinguishes a smash from a lift using actual velocity', () => { expect(classifyShot(new Vector3(0, -20, -40), new Vector3(0, 2.8, 3))).toBe('Smash'); expect(classifyShot(new Vector3(0, 15, -8), new Vector3(0, 1, 3))).toBe('Lift'); });
  it('collides with the net continuously rather than tunneling', () => { const s = new ShuttlecockPhysics(); s.previous.set(0, 1.2, 0.5); s.position.set(0, 1.2, -0.5); s.velocity.set(0, 1, -50); expect(netCrossing(s)).toBe('net'); expect(s.velocity.z).toBeGreaterThan(0); s.previous.set(0, 2, 0.5); s.position.set(0, 2, -0.5); expect(netCrossing(s)).toBe('over'); });
});
describe('athletic movement', () => {
  const settings = { sensitivity: 1, headMotion: true } as Settings;
  const input = () => ({ keys: new Set<string>(), swinging: false, jump: false }) as InputManager;
  it('accelerates and must plant before reversing', () => { const player = new PlayerController(), i = input(); i.keys.add('KeyD'); player.step(1 / 120, i, settings, 0, 0); expect(player.velocity.x).toBeLessThan(0.2); for (let n = 0; n < 60; n++) player.step(1 / 120, i, settings, 0, 0); expect(player.velocity.x).toBeCloseTo(3.5); i.keys.delete('KeyD'); i.keys.add('KeyA'); player.step(1 / 120, i, settings, 0, 0); expect(player.velocity.x).toBeGreaterThan(3); });
  it('lands after a jump without sinking below the surface', () => { const p = new PlayerController(), i = input(); i.jump = true; p.step(1 / 120, i, settings, 0, 0); expect(p.position.y).toBeGreaterThan(0); for (let n = 0; n < 180; n++) p.step(1 / 120, i, settings, 0, 0); expect(p.position.y).toBe(0); });
});

describe('Simulation stays exact but stops being cruel', () => {
  it('plays a shuttle caught on the frame instead of dropping the rally', () => {
    const frame = collision(0.22), clean = collision();
    const hit = racketContact(frame.s, frame.r);
    expect(hit?.quality).toBe('Off-center');
    expect(frame.s.velocity.z).toBeLessThan(0);
    expect(hit!.speed).toBeLessThan(racketContact(clean.s, clean.r)!.speed * 0.75);
  });
  it('still lets a shuttle past when the racket is nowhere near it', () => {
    expect(racketContact(...Object.values(collision(0.34)) as [ShuttlecockPhysics, RacketController])).toBeNull();
  });
  it('releases the service toss low, slow and clear of the strings', async () => {
    const { GameEngine } = await import('../src/game/GameEngine');
    const { useGameStore } = await import('../src/state/gameStore');
    useGameStore.getState().setSettings({ controls: 'simulation' });
    useGameStore.getState().start('match');
    const e = new GameEngine();
    e.input = { keys: new Set(), locked: true, dx: 0, dy: 0, swinging: false, serve: false, jump: false } as InputManager;
    e.frame(1 / 120); e.cooldown = 0; e.input.serve = true; e.frame(1 / 120);
    // The toss is a real shot, not an automatic contact, and it never rises above 1.15 m.
    expect(useGameStore.getState().contacts).toBe(0);
    expect(e.shuttle.position.y).toBeGreaterThan(0.6); expect(e.shuttle.position.y).toBeLessThan(1.15);
    let legal = 0, frames = 0;
    for (let i = 0; i < 90 && e.shuttle.active; i++) { e.frame(1 / 120); frames++; if (e.shuttle.position.y < 1.15) legal++; }
    expect(legal).toBe(frames); expect(frames).toBeGreaterThan(20);
  });
});
