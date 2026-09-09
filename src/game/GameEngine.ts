import { Vector3 } from 'three';
import { useGameStore } from '../state/gameStore';
import type { ShotType } from '../state/gameStore';
import { PlayerController } from './player/PlayerController';
import { GuidedSwing } from './player/GuidedSwing';
import { RacketController } from './player/RacketController';
import { ShuttlecockPhysics } from './shuttle/ShuttlecockPhysics';
import { OpponentAI } from './ai/OpponentAI';
import { CLASSIC_RULES, DUEL_RULES } from './match/Scoring';
import { MatchManager } from './match/MatchManager';
import { RallyTransition } from './match/RallyTransition';
import { servicePositions } from './match/ServeSystem';
import { racketContact, netCrossing } from './physics/CollisionSystem';
import { InputManager } from './input/InputManager';
import { predictFlight, planReturn, planIntercept } from './ai/Prediction';
import { RallyRun } from './training/RallyRun';
import { drills, assessDrill, contactAdvice } from './training/Drills';
import { audio } from './audio/AudioManager';
export class GameEngine {
  run = new RallyRun();
  guide = new GuidedSwing();
  player = new PlayerController(); racket = new RacketController(); shuttle = new ShuttlecockPhysics();
  opponent = new OpponentAI(); match = new MatchManager(); transition = new RallyTransition(); input: InputManager | null = null;
  time = 0; netMotion = 0; cooldown = 1.5; landing = new Vector3(); showLanding = false; ends = false;
  private replyPulse = 0;
  private session = -1; private accumulator = 0; private telemetry = 0; private squeakTimer = 0; private flightTimer = 0;
  private forward = new Vector3(); private swingContact = false; private wasSwinging = false; private playerShot: ShotType | null = null; private contactPulse = 0; private lastControls = '';
  attach(element: HTMLElement) {
    this.input?.dispose();
    this.input = new InputManager(element, () => { useGameStore.getState().pause(); audio.suspend(); });
  }
  reset() {
    this.run = new RallyRun(); useGameStore.setState({ run: this.run.snapshot() });
    this.guide = new GuidedSwing(); this.contactPulse = 0;
    this.player = new PlayerController(); this.racket = new RacketController(); this.shuttle = new ShuttlecockPhysics();
    this.opponent = new OpponentAI(); this.match = new MatchManager(useGameStore.getState().matchFormat === 'duel' ? DUEL_RULES : CLASSIC_RULES); this.replyPulse = 0; this.transition.reset();
    this.cooldown = 1.2; this.accumulator = 0; this.ends = false; this.time = 0; this.netMotion = 0;
    this.telemetry = 0; this.flightTimer = 0; this.squeakTimer = 0; this.wasSwinging = false; this.swingContact = false;
    this.playerShot = null; this.input?.reset?.();
    const state = useGameStore.getState();
    this.lastControls = state.settings.controls;
    if (state.settings.controls === 'assisted') this.cooldown = 0.18;
    if (state.mode === 'training') { this.player.position.set(-0.34, 0, drills[state.trainingShot].startZ); this.player.pitch = 0.04; }
    this.ready();
  }
  ready() {
    const state = useGameStore.getState();
    this.match.start(); this.opponent.reset(); this.shuttle.active = false; this.shuttle.visible = false; this.showLanding = false;
    if (state.mode === 'match') {
      const positions = servicePositions(this.match.score);
      this.player.position.copy(positions.player); this.player.velocity.set(0, 0, 0);
      this.player.yaw = Math.atan2(positions.player.x - positions.opponent.x, positions.player.z - positions.opponent.z);
      this.player.pitch = -0.06; this.opponent.position.copy(positions.opponent); this.ends = this.match.score.ends;
      this.racket = new RacketController(); this.guide = new GuidedSwing(); // No velocity impulse from re-positioning between points.
    }
    useGameStore.setState({ reachReady: false, swingReady: false, smashReady: false, selectedShot: 'rally', rally: 0, rallyActive: false, message: state.mode === 'match' ? this.match.score.server === 0 ? 'Your serve' : 'Opponent serving' : 'Find your rhythm' });
  }
  serve() {
    const state = useGameStore.getState(); this.match.start(); this.playerShot = null; this.showLanding = false;
    this.swingContact = false; this.opponent.reset();
    if (state.mode === 'match' && this.match.score.server === 0) {
      const p = state.settings.controls === 'assisted'
        ? new Vector3(0.18, 1.02, -0.85).applyAxisAngle(new Vector3(0, 1, 0), this.player.yaw).add(this.player.position)
        : new Vector3(0.4, -0.65, -1.12).applyQuaternion(this.player.rotation).add(this.player.head);
      const v = state.settings.controls === 'assisted' ? new Vector3(0, 0.5, 0) : new Vector3(0, 1.0, 0.85).applyQuaternion(this.player.rotation);
      this.shuttle.reset(p, v); this.shuttle.lastHit = 0;
      useGameStore.setState({ message: state.settings.controls === 'assisted' ? 'Serving' : 'Hold click + move your mouse to serve' });
    } else {
      const from = this.opponent.position.clone().add(new Vector3(0.35, 1.10, 0.4));
      const drill = drills[state.trainingShot];
      const target = state.mode === 'match' ? new Vector3(-this.opponent.position.x, 0, 5.2)
        : new Vector3(this.player.position.x + 0.34, 0, state.mode === 'training' ? drill.feedLandingZ : Math.min(7.7, this.player.position.z + 1.8));
      const loft = state.mode === 'training' ? drill.loft : 11;
      // Overhead drills need a descending contact in front of the player, not a floor
      // target that carries a high feed behind their head before it enters racket reach.
      const overheadFeed = state.mode === 'training' && state.trainingShot === 'Smash' && state.settings.controls === 'assisted';
      const launch = overheadFeed ? planIntercept(from, new Vector3(this.player.position.x + 0.2, 2.7, this.player.position.z - 0.85), 12).velocity
        : planReturn(from, target, loft).velocity;
      this.shuttle.reset(from, launch);
      this.shuttle.lastHit = 1; this.shuttle.served = true; this.shuttle.hitCooldown = 0.35;
      this.match.hits = 1; this.opponent.swing = 1; this.opponent.contactPoint.copy(from); audio.sound('hit', 15, from);
      useGameStore.setState({ message: '' });
    }
    useGameStore.setState({ rallyActive: true, contact: null, shot: null, impactPoint: null, lastLanding: null, nextFeed: 0 });
  }
  frame(delta: number) {
    const state = useGameStore.getState();
    if (this.session !== state.session) { this.session = state.session; this.reset(); }
    if (state.phase !== 'playing' || !this.input?.locked) return;
    if (this.lastControls !== state.settings.controls) { this.lastControls = state.settings.controls; this.racket = new RacketController(); this.guide = new GuidedSwing(); }
    this.accumulator += Math.min(delta, 0.08);
    const count = Math.floor(this.accumulator / (1 / 120));
    if (!count) return;
    const dx = this.input.dx / count, dy = this.input.dy / count; this.input.dx = 0; this.input.dy = 0;
    for (let i = 0; i < count; i++) { this.step(1 / 120, dx, dy); this.accumulator -= 1 / 120; }
  }
  private step(dt: number, dx: number, dy: number) {
    const state = useGameStore.getState(), input = this.input!;
    if (state.phase !== 'playing') return;
    const assisted = state.settings.controls === 'assisted';
    const requested = input.pendingShot ?? undefined;
    const pressed = requested !== undefined || input.swingPressed || (input.swinging && !this.wasSwinging);
    this.guide.input(dt, !!pressed, input.swinging || !!input.dropHeld || input.keys.has('KeyF'), dx, dy, requested ?? (input.dropHeld ? 'drop' : input.keys.has('KeyF') ? 'smash' : undefined));
    input.swingPressed = false; input.pendingShot = null;
    this.replyPulse = Math.max(0, this.replyPulse - dt);
    this.contactPulse = Math.max(0, this.contactPulse - dt * 1.4);
    this.time += dt; this.cooldown -= dt; this.squeakTimer -= dt;
    const transition = this.transition.step(dt);
    if (transition.prepare) this.ready();
    const movement = this.player.step(dt, input, state.settings, dx, dy);
    if (movement.landed) audio.sound('land', 1, this.player.position);
    if (movement.hardTurn && this.squeakTimer <= 0) { audio.sound('squeak', 1, this.player.position); this.squeakTimer = 0.5; }
    const serving = state.mode === 'match' && this.match.hits === 0 && this.match.score.server === 0;
    this.racket.step(dt, this.player, assisted ? 0 : dx, assisted ? 0 : dy, assisted ? false : input.swinging, state.settings.sensitivity, serving);
    if (assisted && !this.shuttle.active) this.guide.track(dt, this.racket, this.player, this.shuttle);
    if (input.swinging && !this.wasSwinging) { this.swingContact = false; this.racket.travel = 0; }
    if (!assisted && !input.swinging && this.wasSwinging && !this.swingContact && this.racket.travel > 0.35 && this.shuttle.active) {
      useGameStore.setState({ contact: 'Miss', shot: null, impactPoint: null, feedback: contactAdvice('Miss', null) });
    }
    this.wasSwinging = input.swinging;
    if (this.player.position.y === 0) audio.footsteps(dt, Math.hypot(this.player.velocity.x, this.player.velocity.z), this.player.position);
    if (state.mode === 'practice' && input.serve) { this.run.cancel(); useGameStore.setState({ run: this.run.snapshot() }); }
    if (state.mode !== 'match' && input.serve) { this.shuttle.active = false; this.shuttle.visible = false; this.cooldown = 0; }
    if (!this.shuttle.active && this.cooldown <= 0 && !this.transition.active) {
      if (state.mode !== 'match' || this.match.score.server === 1 || input.serve || (assisted && this.guide.waitingForShuttle)) {
        if (assisted && input.serve && state.mode === 'match') this.guide.input(dt, true, input.swinging, 0, 0);
        this.serve();
      }
    }
    input.serve = false; this.netMotion *= Math.exp(-3 * dt);
    if (this.shuttle.active) this.updateFlight(dt, serving);
    else if (!this.transition.active) this.opponent.step(dt, this.shuttle, this.player.position, state.settings.difficulty, this.match.hits, state.settings.controls === 'assisted' || state.mode === 'practice', state.mode === 'practice');
    this.publish(dt);
  }
  private updateFlight(dt: number, serving: boolean) {
    const state = useGameStore.getState();
    this.match.rallyTime += dt; this.shuttle.step(dt);
    const previousHitter = this.shuttle.lastHit;
    const assisted = state.settings.controls === 'assisted';
    if (assisted) this.guide.track(dt, this.racket, this.player, this.shuttle);
    const serveX = this.match.score.points[0] % 2 === 0 ? -1.25 : 1.25;
    const contact = assisted ? this.guide.contact(this.shuttle, this.racket, this.player, serveX) : racketContact(this.shuttle, this.racket);
    if (contact) {
      if (state.mode === 'practice') this.run.propose(contact.shot, contact.timed);
      const doubleHit = this.match.hits > 0 && previousHitter === 0 && state.mode === 'match';
      this.contactPulse = 1; this.match.hits++; this.swingContact = true; this.playerShot = contact.shot;
      audio.sound(contact.shot === 'Smash' ? 'smash' : 'hit', contact.speed, this.shuttle.position);
      useGameStore.setState((s) => ({
        contact: contact.quality, shot: contact.shot, speed: contact.speed * 3.6, contacts: s.contacts + 1,
        trainingHits: s.trainingHits + Number(s.mode === 'training' && contact.shot === s.trainingShot),
        impactPoint: contact.point, timedContact: contact.timed ?? false, feedback: contact.feedback ?? contactAdvice(contact.quality, contact.shot), rally: this.match.hits, message: '',
      }));
      if (doubleHit) { this.end(1, 'Double contact'); return; }
      if (serving && this.shuttle.position.y > 1.15) { this.end(1, 'Service too high'); return; }
    }
    const crossing = netCrossing(this.shuttle);
    if (crossing === 'under') { this.end(this.shuttle.lastHit === 0 ? 1 : 0, 'Under the net'); return; }
    if (crossing === 'net' || crossing === 'tape') { this.netMotion = crossing === 'tape' ? 0.65 : 1; audio.sound('net', 1, this.shuttle.position); }
    if (crossing === 'over' || crossing === 'tape') this.shuttle.crossedNet = true;
    if (state.mode !== 'training' && this.opponent.step(dt, this.shuttle, this.player.position, state.settings.difficulty, this.match.hits, state.settings.controls === 'assisted' || state.mode === 'practice', state.mode === 'practice')) {
      if (state.mode === 'practice') { this.run.bank(); useGameStore.setState({ run: this.run.snapshot() }); }
      this.match.hits++; this.replyPulse = 1.5; audio.sound(this.opponent.lastShot === 'Smash' ? 'smash' : 'hit', this.shuttle.velocity.length(), this.shuttle.position); useGameStore.setState({ rally: this.match.hits, opponentShot: this.opponent.lastShot ?? 'Return' });
    }
    if (this.shuttle.position.y < 0.035 || Math.abs(this.shuttle.position.z) > 12 || Math.abs(this.shuttle.position.x) > 9) {
      if (this.shuttle.position.y < 0.035) this.shuttle.position.y = 0.035;
      const result = this.match.land(this.shuttle, state.mode === 'match'); this.end(result.winner, result.reason);
    }
  }
  private publish(dt: number) {
    const state = useGameStore.getState(); this.telemetry += dt; this.flightTimer += dt;
    if (this.telemetry > 0.08) {
      this.telemetry = 0;
      if (this.shuttle.active) this.shuttle.record();
      if (this.shuttle.active && state.mode !== 'match' && state.settings.landing) {
        this.landing.copy(predictFlight(this.shuttle.position, this.shuttle.velocity).landing); this.landing.y = 0.025; this.showLanding = true;
      }
      useGameStore.setState({ replyPulse: this.replyPulse, bestRally: Math.max(state.bestRally, this.match.hits), smashReady: this.guide.smashReady && this.shuttle.active, selectedShot: this.guide.intent, reachReady: this.guide.reachable && this.shuttle.active, swingReady: this.guide.armed, contactPulse: this.contactPulse, racketSpeed: this.racket.velocity.length() * 3.6, courtFade: this.transition.opacity,
        nextFeed: !this.shuttle.active && state.mode !== 'match' ? Math.max(0, this.cooldown) : 0 });
      audio.volume(state.settings.volume); audio.listener(this.player.head, this.forward.set(0, 0, -1).applyQuaternion(this.player.rotation));
    }
    if (this.flightTimer > 0.16 && this.shuttle.active && this.shuttle.velocity.length() > 12) {
      audio.sound('flight', 1, this.shuttle.position); this.flightTimer = 0;
    }
  }
  private end(winner: 0 | 1, reason: string) {
    this.shuttle.active = false; this.cooldown = 2.3; this.showLanding = false;
    const state = useGameStore.getState();
    if (state.mode === 'practice') {
      const legalWinner = winner === 0 && reason === 'In' && this.shuttle.lastHit === 0;
      if (legalWinner) this.run.bank();
      this.run.finish(legalWinner); useGameStore.setState({ run: this.run.snapshot() });
    }
    useGameStore.setState({ rallies: state.rallies + 1, bestRally: Math.max(state.bestRally, this.match.hits) });
    if (state.mode === 'match') {
      const winnerShot = winner === 0 && reason === 'In' && this.shuttle.lastHit === 0 && this.playerShot !== null;
      if (winnerShot) useGameStore.setState({ winners: state.winners + 1, smashWinners: state.smashWinners + Number(this.playerShot === 'Smash'), touchWinners: state.touchWinners + Number(this.playerShot === 'Drop' || this.playerShot === 'Net shot') });
      const resultText = winnerShot ? `${this.playerShot} winner` : reason;
      const prevGame = this.match.score.game;
      this.match.point(winner); const s = this.match.score;
      useGameStore.setState({ score: s.points, games: s.games, game: s.game, server: s.server, gameHistory: s.history,
        rallyActive: false, message: `${resultText} · ${winner === 0 ? 'Your point' : 'Opponent’s point'}${s.game !== prevGame ? ' · Change ends' : ''}`, winner: s.winner });
      if (s.winner !== null) {
        useGameStore.setState({ phase: 'result' }); if (typeof document !== 'undefined') document.exitPointerLock(); audio.suspend(); return;
      }
      this.transition.begin();
    } else {
      const assessment = assessDrill(state.trainingShot, this.playerShot, this.shuttle.position.x, this.shuttle.position.z, this.shuttle.crossedNet, state.settings.controls === 'assisted');
      const inCourt = this.shuttle.lastHit === 0 && this.shuttle.crossedNet && Math.abs(this.shuttle.position.x) <= 2.61 && this.shuttle.position.z >= -6.72 && this.shuttle.position.z < 0;
      if (state.mode === 'training') {
        const success = assessment.success && this.shuttle.lastHit === 0;
        const streak = success ? state.trainingStreak + 1 : 0;
        useGameStore.setState({ trainingAttempts: state.trainingAttempts + 1, trainingSuccess: state.trainingSuccess + Number(success), trainingStreak: streak,
          trainingBestStreak: Math.max(streak, state.trainingBestStreak), feedback: assessment.feedback,
          lastLanding: success ? 'Target' : inCourt ? 'In' : 'Out' });
      } else useGameStore.setState({ lastLanding: inCourt ? 'In' : 'Out', feedback: this.playerShot ? inCourt ? 'Inside the lines. Find that rhythm again.' : 'Keep your next landing inside the singles lines.' : contactAdvice('Miss', null) });
      useGameStore.setState({ rallyActive: false, message: state.mode === 'training' && assessment.success ? 'Right shot. Right place.' : `${reason} · Take a breath` });
    }
  }
  dispose() { this.input?.dispose(); }
}
