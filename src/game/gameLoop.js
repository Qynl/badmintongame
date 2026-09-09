import { SIM } from '../sim/constants.js';
import { MatchRenderer } from '../render/renderer.js';
import { InputController, applyInput } from './input.js';
import { CAMERA_MODES } from '../render/camera.js';
import { dist } from '../sim/math.js';

// ---------------------------------------------------------------------------
// GameLoop
//
// Fixed-timestep simulation with an accumulator, decoupled from rendering.
// The sim always advances in exact 1/60 steps (so it is bit-identical to the
// headless test runs); rendering happens once per animation frame at whatever
// rate the display gives us.
// ---------------------------------------------------------------------------

export class GameLoop {
  constructor(canvas, match, options = {}) {
    this.match = match;
    this.renderer = new MatchRenderer(canvas, match, {
      quality: options.quality ?? 'high',
      humanId: match.humanPlayerId,
    });
    this.input = new InputController();
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this.speed = 1;
    this.onUiEvent = options.onUiEvent ?? (() => {});
    this.onFrame = options.onFrame ?? (() => {});
    this.cameraModeIndex = 0;
    this.autoSwitch = options.autoSwitch ?? true;
    this.switchCooldown = 0;
    this.maxStepsPerFrame = 8;

    // Sim events that need a visual/audio response.
    this._bind();
    this._raf = null;
    this._resizeObserver = new ResizeObserver(() => this.renderer.resize());
    this._resizeObserver.observe(canvas);
  }

  _bind() {
    const ev = this.match.events;
    this._unsub = [];
    const on = (name, fn) => { ev.on(name, fn); this._unsub.push([name, fn]); };

    on('goal', (d) => { this.renderer.onGoal(); this.onUiEvent({ type: 'goal', ...d }); });
    on('save', (d) => { this.renderer.onBigHit(); this.onUiEvent({ type: 'save', ...d }); });
    on('foul', (d) => { this.renderer.onBigHit(); this.onUiEvent({ type: 'foul', ...d }); });
    on('yellowCard', (d) => this.onUiEvent({ type: 'yellowCard', ...d }));
    on('redCard', (d) => this.onUiEvent({ type: 'redCard', ...d }));
    on('injury', (d) => this.onUiEvent({ type: 'injury', ...d }));
    on('kickoff', (d) => this.onUiEvent({ type: 'kickoff', ...d }));
    on('commentary', (d) => this.onUiEvent({ type: 'commentary', ...d }));
    on('offside', (d) => this.onUiEvent({ type: 'offside', ...d }));
    on('shot', (d) => this.onUiEvent({ type: 'shot', ...d }));
    on('substitution', (d) => this.onUiEvent({ type: 'substitution', ...d }));
    on('halfTime', (d) => this.onUiEvent({ type: 'halfTime', ...d }));
    on('fullTime', (d) => this.onUiEvent({ type: 'fullTime', ...d }));
  }

  setCameraMode(mode) {
    this.renderer.setCameraMode(mode);
    this.cameraModeIndex = Math.max(0, CAMERA_MODES.indexOf(mode));
  }

  cycleCamera() {
    this.cameraModeIndex = (this.cameraModeIndex + 1) % CAMERA_MODES.length;
    this.renderer.setCameraMode(CAMERA_MODES[this.cameraModeIndex]);
    return CAMERA_MODES[this.cameraModeIndex];
  }

  // Switch control to the teammate best placed to act.
  switchPlayer(manual = false) {
    const m = this.match;
    const human = m.human;
    if (!human) return;
    const team = m.teams[human.team];
    const ball = m.ball;
    let best = null;
    let bestScore = -Infinity;
    for (const p of team.players) {
      if (!p.onPitch || p === human) continue;
      if (p.isGK && dist(ball.x, ball.z, p.x, p.z) > 18) continue;
      const d = dist(p.x, p.z, ball.x, ball.z);
      // Prefer whoever can get to the ball soonest, facing the right way.
      let score = -d;
      if (m.carrier === p) score += 40;
      if (p.brain?.intent === 'press' || p.brain?.intent === 'chase') score += 8;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best) {
      m.setHumanPlayer(best.id);
      this.renderer.setHuman(best.id);
      this.switchCooldown = manual ? 0.35 : 1.2;
      this.onUiEvent({ type: 'switch', player: best });
    }
  }

  // If the ball comes to a different teammate, hand control over -- but only
  // when the player isn't already involved, so you never get yanked away from
  // your own action.
  autoSwitchCheck(dt) {
    if (!this.autoSwitch) return;
    this.switchCooldown -= dt;
    if (this.switchCooldown > 0) return;
    const m = this.match;
    const human = m.human;
    if (!human || !m.teams[human.team]) return;
    const ball = m.ball;
    if (ball.owner === human.id) return;
    const myDist = dist(human.x, human.z, ball.x, ball.z);
    if (myDist < 9) return; // still in the action, leave them alone

    // Own team has it and someone else is much closer: switch.
    const carrier = m.carrier;
    if (carrier && carrier.team === human.team && carrier !== human) {
      if (!carrier.isGK) {
        m.setHumanPlayer(carrier.id);
        this.renderer.setHuman(carrier.id);
        this.switchCooldown = 1.0;
        this.onUiEvent({ type: 'switch', player: carrier });
      }
      return;
    }
    // Loose ball: give control to the nearest teammate if they're much closer.
    if (ball.owner === -1) {
      let nearest = null; let nd = Infinity;
      for (const p of m.teams[human.team].players) {
        if (!p.onPitch || p.isGK) continue;
        const d = dist(p.x, p.z, ball.x, ball.z);
        if (d < nd) { nd = d; nearest = p; }
      }
      if (nearest && nearest !== human && nd < myDist - 8) {
        m.setHumanPlayer(nearest.id);
        this.renderer.setHuman(nearest.id);
        this.switchCooldown = 0.9;
        this.onUiEvent({ type: 'switch', player: nearest });
      }
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(tick);
      let frameDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      // Guard against tab-switch spikes.
      if (frameDt > 0.25) frameDt = 0.25;
      this.frame(frameDt);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  frame(frameDt) {
    const m = this.match;

    // --- Input ---
    const toWorld = (x, z) => this.renderer.cameraRig.cameraRelative(x, z);
    const ui = applyInput(this.input, this.input, m.input, toWorld);
    if (ui.switchPlayer) this.switchPlayer(true);
    if (ui.cycleCamera) this.onUiEvent({ type: 'camera', mode: this.cycleCamera() });
    if (ui.pause) this.onUiEvent({ type: 'pauseToggle' });
    if (ui.toggleRadar) this.onUiEvent({ type: 'toggleRadar' });
    this.input.endFrame();

    // --- Simulation (fixed timestep) ---
    if (!m.paused) {
      this.accumulator += frameDt * this.speed;
      let steps = 0;
      while (this.accumulator >= SIM.dt && steps < this.maxStepsPerFrame) {
        m.step(SIM.dt);
        this.accumulator -= SIM.dt;
        steps++;
      }
      // If we're badly behind (slow device), drop the backlog rather than
      // spiralling -- the match stays smooth, just runs marginally slow.
      if (steps >= this.maxStepsPerFrame) this.accumulator = 0;
      this.simSteps = steps;
      this.autoSwitchCheck(frameDt);
    }

    // --- Render ---
    this.renderer.render(frameDt);
    this.onFrame(frameDt);
  }

  setQuality(q) { this.renderer.setQuality(q); }
  setSpeed(s) { this.speed = s; }

  dispose() {
    this.stop();
    this._resizeObserver.disconnect();
    if (this._unsub) {
      for (const [name, fn] of this._unsub) this.match.events.off?.(name, fn);
    }
    this.input.dispose();
    this.renderer.dispose();
  }
}
