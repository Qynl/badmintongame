import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { GuidedSwing } from '../src/game/player/GuidedSwing';
import { PlayerController } from '../src/game/player/PlayerController';
import { RacketController } from '../src/game/player/RacketController';
import { ShuttlecockPhysics } from '../src/game/shuttle/ShuttlecockPhysics';
import { aimFrom, aimLabel, clampAim, depthBand, serviceBox, COURT } from '../src/game/player/AimSystem';
import { planAssistedShot } from '../src/game/player/ShotPlanner';
import { sampleFlight } from '../src/game/ai/Prediction';
import { OpponentAI } from '../src/game/ai/OpponentAI';
import { chooseShot } from '../src/game/ai/DecisionMaking';
import { RallyRun } from '../src/game/training/RallyRun';
import { GameEngine } from '../src/game/GameEngine';
import { useGameStore } from '../src/state/gameStore';
import type { InputManager } from '../src/game/input/InputManager';
import type { AssistedShot } from '../src/game/player/ShotPlanner';

beforeEach(() => useGameStore.getState().setSettings({ controls: 'assisted', difficulty: 'casual' }));

function playerAt(z = 4.4, yaw = 0, pitch = 0) {
  const player = new PlayerController();
  player.position.set(0, 0, z); player.yaw = yaw; player.pitch = pitch;
  return player;
}
function engine(mode: 'match' | 'practice' = 'practice') {
  useGameStore.getState().start(mode);
  const e = new GameEngine();
  e.input = { keys: new Set(), locked: true, swinging: false, dropHeld: false, swingPressed: false, pendingShot: null, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
  e.frame(1 / 120); e.cooldown = 0; return e;
}

describe('assisted aim reads the look direction', () => {
  it('sends a level look deep and a downward look short', () => {
    expect(aimFrom(playerAt(4.4, 0, 0.2), 'rally').z).toBeLessThan(-6);
    expect(aimFrom(playerAt(4.4, 0, -0.3), 'rally').z).toBeGreaterThan(-2.5);
    expect(aimFrom(playerAt(4.4, 0, -0.12), 'rally').z).toBeGreaterThan(aimFrom(playerAt(4.4, 0, -0.02), 'rally').z);
  });
  it('swings the landing across the court with the sideways look', () => {
    const left = aimFrom(playerAt(4.4, 0.35, 0), 'rally'), right = aimFrom(playerAt(4.4, -0.35, 0), 'rally');
    expect(left.x).toBeLessThan(-2); expect(right.x).toBeGreaterThan(2);
    expect(aimFrom(playerAt(4.4, 0, 0), 'rally').x).toBeCloseTo(0, 1);
  });
  it('keeps every selectable landing inside the singles court for a full sweep of looks', () => {
    for (let yaw = -1.4; yaw <= 1.4; yaw += 0.2) for (let pitch = -1.2; pitch <= 1.2; pitch += 0.2) for (const intent of ['rally', 'drop', 'smash'] as AssistedShot[]) {
      const aim = aimFrom(playerAt(4.4, yaw, pitch), intent);
      expect(Math.abs(aim.x)).toBeLessThanOrEqual(COURT.maxX);
      expect(aim.z).toBeLessThanOrEqual(COURT.maxZ); expect(aim.z).toBeGreaterThanOrEqual(COURT.minZ);
    }
  });
  it('lets the shot family bound the depth: a drop stays short, a full swing stays deep', () => {
    expect(depthBand('drop')[1]).toBeGreaterThan(-2);
    expect(depthBand('rally')[1]).toBeLessThan(-6);
    expect(depthBand('rally', 60)[0]).toBeGreaterThan(-1); // a hard downward flick becomes a flat push
    expect(depthBand('drop', 0, true)[1]).toBeGreaterThan(depthBand('drop', 0, false)[1]); // tighter beside the tape
  });
  it('names the landing spot so the choice is readable mid-rally', () => {
    expect(aimLabel(-2, -6)).toBe('DEEP LEFT'); expect(aimLabel(1.6, -2.5)).toBe('FRONT RIGHT');
    expect(aimLabel(0, -4)).toBe('MID CENTRE');
    expect(aimLabel(0, -0.6)).toBe('AT THE NET CENTRE');
  });
  it('keeps the serve inside the legal diagonal service box', () => {
    const even = serviceBox(true), odd = serviceBox(false);
    expect(even.maxX).toBeLessThan(0); expect(odd.minX).toBeGreaterThan(0);
    const aim = clampAim(new Vector3(3, 0, 2), 'rally', 1, even);
    expect(aim.x).toBeLessThan(0); expect(aim.z).toBeLessThan(-2); expect(aim.z).toBeGreaterThan(-6.2);
  });
});

describe('the swing commits the placement you asked for', () => {
  it('holds a tapped aim while you look back at the shuttle', () => {
    const guide = new GuidedSwing(), player = playerAt(4.4, 0.3, -0.2);
    guide.input(1 / 120, true, false, 0, 0); guide.updateAim(player);
    const committed = guide.aim.clone();
    player.yaw = -0.3; player.pitch = 0.4; guide.updateAim(player);
    expect(guide.aim.distanceTo(committed)).toBeLessThan(0.001);
    expect(guide.locked.distanceTo(committed)).toBeLessThan(0.001);
  });
  it('keeps steering while a control is held', () => {
    const guide = new GuidedSwing(), player = playerAt(4.4, 0.3, 0);
    guide.input(1 / 120, false, true, 0, 0); guide.updateAim(player);
    const first = guide.aim.clone();
    player.yaw = -0.3;
    for (let i = 0; i < 40; i++) { guide.input(1 / 120, false, true, 0, 0); guide.updateAim(player); }
    expect(guide.aim.x).toBeGreaterThan(first.x + 0.5);
  });
  it('scatters a scraped contact around the mark but leaves a clean one on it', () => {
    const strike = (offsetX: number) => {
      const player = playerAt(4.4, 0, -0.05);
      const shuttle = new ShuttlecockPhysics();
      shuttle.reset(new Vector3(0, 2.6, 3.5), new Vector3(0, -2, 5)); shuttle.lastHit = 1; shuttle.served = true;
      const racket = new RacketController();
      racket.center.copy(shuttle.position).x += offsetX; racket.previous.copy(racket.center);
      const guide = new GuidedSwing();
      guide.input(1 / 120, true, false, 0, 0); guide.updateAim(player);
      guide.track(1 / 120, racket, player, shuttle);
      const contact = guide.contact(shuttle, racket, player);
      return { contact, drift: contact ? contact.target!.clone().sub(guide.locked).length() : NaN, control: guide.control };
    };
    const clean = strike(0), scraped = strike(0.26);
    expect(clean.contact?.quality).toBe('Perfect'); expect(clean.drift).toBeLessThan(0.02);
    expect(scraped.drift).toBeGreaterThan(clean.drift + 0.05); expect(scraped.control).toBeLessThan(clean.control);
  });
});

describe('the shuttle lands where you aimed, through the full engine', () => {
  it('puts a return into the corner you looked at instead of a fixed spot', () => {
    const e = engine();
    let clicked = false; const aims: Vector3[] = [];
    for (let i = 0; i < 900 && !useGameStore.getState().contacts; i++) {
      if (!clicked && e.guide.canReach(e.player, e.shuttle)) { e.player.yaw = 0.34; e.player.pitch = -0.05; e.input!.swingPressed = true; clicked = true; }
      e.frame(1 / 120);
      if (clicked) aims.push(e.guide.aim.clone());
    }
    expect(clicked).toBe(true);
    const landing = sampleFlight(e.shuttle.position, e.shuttle.velocity).landing;
    const committed = aims[0];
    expect(committed.x).toBeLessThan(-2);
    expect(landing.x).toBeLessThan(-1.7);
    expect(Math.hypot(landing.x - committed.x, landing.z - committed.z)).toBeLessThan(0.75);
  });
  it('separates a deep look from a short look with the same control', () => {
    const land = (pitch: number) => {
      const e = engine(); let clicked = false;
      for (let i = 0; i < 900 && !useGameStore.getState().contacts; i++) {
        if (!clicked && e.guide.canReach(e.player, e.shuttle)) { e.player.pitch = pitch; e.input!.dropHeld = true; e.input!.pendingShot = 'drop'; clicked = true; }
        e.frame(1 / 120);
      }
      expect(clicked).toBe(true);
      return sampleFlight(e.shuttle.position, e.shuttle.velocity).landing;
    };
    const short = land(-0.3), deep = land(0.25);
    expect(short.z).toBeGreaterThan(-1.5); expect(deep.z).toBeLessThan(short.z - 0.4);
  });
  it('reports the placement error and the aim label as telemetry', () => {
    const e = engine(); let clicked = false;
    for (let i = 0; i < 900 && !useGameStore.getState().contacts; i++) {
      if (!clicked && e.guide.canReach(e.player, e.shuttle)) { e.input!.swingPressed = true; clicked = true; }
      e.frame(1 / 120);
    }
    const state = useGameStore.getState();
    expect(state.placementShots).toBe(1); expect(state.placement).not.toBeNull();
    expect(state.placement!).toBeLessThan(1.2); expect(typeof state.aimLabel).toBe('string');
  });
  it('serves into the diagonal box at the aimed side', () => {
    for (const yaw of [-0.25, 0.25]) {
      useGameStore.getState().start('match');
      const e = new GameEngine();
      e.input = { keys: new Set(), locked: true, swinging: false, dropHeld: false, swingPressed: false, pendingShot: null, serve: false, dx: 0, dy: 0, jump: false } as InputManager;
      e.frame(1 / 120); e.cooldown = 0; e.player.yaw = yaw;
      e.input!.swingPressed = true;
      for (let i = 0; i < 400 && !useGameStore.getState().contacts; i++) { e.player.yaw = yaw; e.frame(1 / 120); }
      expect(useGameStore.getState().shot).toBe('Serve');
      const landing = sampleFlight(e.shuttle.position, e.shuttle.velocity).landing;
      expect(landing.x).toBeLessThan(0); expect(landing.x).toBeGreaterThan(-2.61);
      expect(landing.z).toBeLessThan(-1.96); expect(landing.z).toBeGreaterThan(-6.72);
    }
  });
  it('does not offer an aim marker in Simulation mode', () => {
    useGameStore.getState().setSettings({ controls: 'simulation' });
    const e = engine();
    for (let i = 0; i < 240; i++) e.frame(1 / 120);
    expect(e.aimVisible).toBe(false); expect(useGameStore.getState().aimVisible).toBe(false);
  });
});

describe('placement is worth something to the opponent', () => {
  it('remembers a repeated corner and shifts its recovery across', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const ai = new OpponentAI(); ai.reset();
      const shuttle = new ShuttlecockPhysics();
      let hits = 1;
      for (let round = 0; round < 4; round++) {
        shuttle.reset(new Vector3(0.5, 2.2, -0.8), new Vector3(1.1, -0.4, -5));
        shuttle.lastHit = 0; shuttle.served = true;
        for (let i = 0; i < 150; i++) { shuttle.step(1 / 120); ai.step(1 / 120, shuttle, new Vector3(0, 0, 4.3), 'casual', hits, true); }
        hits++;
      }
      expect(ai.sideMemory).toBeGreaterThan(0.2);
      ai.step(1 / 120, shuttle, new Vector3(0, 0, 4.3), 'casual', hits, true);
      expect(ai.target.x).toBeGreaterThan(0.15);
    } finally { random.mockRestore(); }
  });
  it('answers one-sided placement by using the open side', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const from = new Vector3(0, 2, -4), player = new Vector3(0.9, 0, 4);
      expect(chooseShot(from, player, 'club', false, { pressure: 0, sequence: 0, relaxed: false, sideBias: 0.8 }).target.x).toBeLessThan(0);
      expect(chooseShot(from, player, 'club', false, { pressure: 0, sequence: 0, relaxed: false, sideBias: -0.8 }).target.x).toBeGreaterThan(0);
      expect(chooseShot(from, player, 'club', true, { pressure: 0, sequence: 3, relaxed: false, sideBias: 0.9 }).target.x).toBeLessThan(0);
    } finally { random.mockRestore(); }
  });
});

describe('Rally Run asks for placement, not just contact', () => {
  it('lights a zone only for the placement challenge', () => {
    const run = new RallyRun(); expect(run.zone).toBeNull();
    run.goals = 3; expect(run.zone).not.toBeNull();
    expect(run.objective.title).toContain('where');
  });
  it('completes the challenge only for a landing inside the zone', () => {
    const hit = new RallyRun(); hit.goals = 3; const zone = hit.zone!;
    hit.propose('Clear', false, new Vector3(zone.x, 0, zone.z)); hit.bank();
    expect(hit.goals).toBe(4); expect(hit.reward).toContain('On the mark');
    const miss = new RallyRun(); miss.goals = 3;
    miss.propose('Clear', false, new Vector3(0, 0, -3)); miss.bank();
    expect(miss.goals).toBe(3);
    const unvalidated = new RallyRun(); unvalidated.goals = 3;
    unvalidated.propose('Clear', false, new Vector3(unvalidated.zone!.x, 0, unvalidated.zone!.z));
    expect(unvalidated.goals).toBe(3); expect(unvalidated.score).toBe(0);
  });
});

describe('planning stays honest about the mark', () => {
  it('lands a requested point rather than a default depth, for a spread of aims', () => {
    const from = new Vector3(0.2, 2.4, 3.6);
    for (const aim of [new Vector3(-2.2, 0, -6), new Vector3(2, 0, -3), new Vector3(-1, 0, -1.6), new Vector3(0.4, 0, -5)]) {
      const plan = planAssistedShot(from, aim, 'rally');
      const flight = sampleFlight(from, plan.velocity);
      expect(flight.netY).toBeGreaterThan(1.55);
      expect(Math.hypot(flight.landing.x - aim.x, flight.landing.z - aim.z)).toBeLessThan(0.9);
    }
  });
  it('deepens an impossible touch instead of lobbing it and calling it a drop', () => {
    const from = new Vector3(0, 1.15, 0.95);
    const plan = planAssistedShot(from, new Vector3(0, 0, -0.4), 'drop');
    const flight = sampleFlight(from, plan.velocity);
    expect(['Drop', 'Net shot']).toContain(plan.shot);
    expect(plan.velocity.length()).toBeLessThan(11); expect(plan.velocity.y).toBeLessThan(7);
    expect(flight.netY).toBeGreaterThan(1.55);
    expect(plan.feedback).toMatch(/off the mark|On the mark/);
  });
});
