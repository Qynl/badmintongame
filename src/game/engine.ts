// ─────────────────────────────────────────────────────────────────────────────
// NEON SMASH core engine: deterministic fixed-step table tennis simulation.
// Runs outside React; three.js layer reads state every frame, UI subscribes to
// the zustand store which the engine pushes discrete events into.
// ─────────────────────────────────────────────────────────────────────────────
import {
  TABLE,
  HALF_L,
  HALF_W,
  NET_H,
  BALL_R,
  GRAV,
  PLAYER_Z,
  AI_Z,
  PADDLE_REACH,
  PADDLE_TOP,
  STEP,
  TIERS,
  GAUNTLET,
  GAME_TARGET,
  clamp,
  rand,
  type TierDef,
} from './constants'
import { sfx, setMusicIntensity, startMusic } from './audio'
import { useStore, type Mode, type Side } from './store'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type Phase = 'serve' | 'rally' | 'point' | 'over'

export interface FXEvent {
  kind: 'spark' | 'ring'
  pos: Vec3
  color: string
  count: number
  speed: number
  big?: boolean
}

interface Paddle {
  x: number
  tx: number
  vx: number
  spinVx: number // low-passed vx used for imparting sidespin
  cool: number
  charging: boolean
  charge: number
  maxSpeed: number // lateral speed limit (Infinity for human-driven paddles)
}

interface Target {
  x: number
  z: number
  r: number
  alive: boolean
  pop: number // pop-in animation timer
}

const FLOW_DURATION = 3.5
const POINT_DELAY = 1.6
const WIN_DELAY = 2.6

export class Engine {
  mode: Mode = 'demo'
  phase: Phase = 'serve'
  paused = false

  ball = {
    pos: { x: 0, y: TABLE.H + 0.6, z: 2.5 } as Vec3,
    vel: { x: 0, y: 0, z: 0 } as Vec3,
    curveH: 0, // horizontal bend accel (sidespin)
    curveV: 0, // extra vertical accel (topspin dip when negative)
    active: false,
    visible: true,
    heat: 0, // 0..1, visual energy from speed
  }

  player: Paddle = { x: 0, tx: 0, vx: 0, spinVx: 0, cool: 0, charging: false, charge: 0, maxSpeed: Infinity }
  ai: Paddle = { x: 0, tx: 0, vx: 0, spinVx: 0, cool: 0, charging: false, charge: 0, maxSpeed: Infinity }

  tier: TierDef = { ...TIERS[1] }
  aiName = 'VECTOR'

  score = { p: 0, a: 0 }
  server: Side = 'player'
  rally = 0
  lastHitter: Side | null = null
  landedTargetSide = false
  shotId = 0 // incremented per hit; AI re-plans on change

  flow = 0
  flowUntil = -1
  private flowOn = false

  trick = {
    targets: [] as Target[],
    timeLeft: 60,
    score: 0,
    combo: 1,
  }

  // timing
  private acc = 0
  private simTime = 0
  private pointTimer = 0
  private serveTimer = 0
  private aiPlanT = 0
  private aiErr = 0
  private aiPlannedShot = -1
  private aiRecoverT = 0 // sluggish after smashing — the moment to counter
  private demoShot = -1
  private demoErrA = 0
  private demoErrP = 0
  private stillT = 0
  private trickTimePushed = -1
  private lastMpShown: Side | null = null

  // juice
  fx: FXEvent[] = []
  shake = 0
  slowmoT = 0
  hitStopT = 0
  cinematic = false

  // duel keyboard state
  p1Key = 0
  p2Key = 0

  private pendingServe: Side = 'player'

  // ── setup ────────────────────────────────────────────────────────────────
  startDemo() {
    this.mode = 'demo'
    this.tier = { ...TIERS[1], name: 'VECTOR', error: 0.55, curveRead: 0.5, smashChance: 0.2 }
    this.aiName = 'VECTOR'
    this.resetMatch()
    this.server = Math.random() < 0.5 ? 'player' : 'ai'
    this.setupServe()
    setMusicIntensity(0)
  }

  startQuick(tierIdx: number) {
    this.mode = 'quick'
    this.tier = { ...TIERS[tierIdx] }
    this.aiName = TIERS[tierIdx].name
    this.beginPlay()
  }

  startGauntlet(round: number) {
    this.mode = 'gauntlet'
    const g = GAUNTLET[round]
    const base = TIERS[g.tier]
    this.tier = {
      ...base,
      name: g.name,
      speed: base.speed * g.mult,
      returnSpeed: base.returnSpeed * g.mult,
      error: base.error / g.mult,
      reaction: base.reaction / g.mult,
      smashChance: Math.min(0.5, base.smashChance * g.mult),
    }
    this.aiName = g.name
    this.beginPlay()
  }

  startTrick() {
    this.mode = 'trick'
    this.tier = { ...TIERS[1] }
    this.aiName = 'THE WALL'
    this.trick.timeLeft = 60
    this.trick.score = 0
    this.trick.combo = 1
    this.trick.targets = []
    this.trickTimePushed = -1
    for (let i = 0; i < 3; i++) this.spawnTarget()
    this.beginPlay()
  }

  startDuel() {
    this.mode = 'duel'
    this.tier = { ...TIERS[1] }
    this.aiName = 'PLAYER 2'
    this.beginPlay()
  }

  private beginPlay() {
    this.resetMatch()
    this.server = 'player'
    this.setupServe()
    startMusic()
    setMusicIntensity(0)
  }

  private resetMatch() {
    this.score = { p: 0, a: 0 }
    this.rally = 0
    this.flow = 0
    this.flowUntil = -1
    this.setFlowActive(false)
    this.lastHitter = null
    this.player.x = 0
    this.player.tx = 0
    this.player.charge = 0
    this.player.charging = false
    this.ai.x = 0
    this.ai.tx = 0
    this.lastMpShown = null
    this.cinematic = false
    this.slowmoT = 0
    this.hitStopT = 0
    const s = useStore.getState()
    s.setRally(0)
    s.setFlow(0, false)
    s.setCharge(0)
    s.setMatchPoint(null)
  }

  // ── input API ─────────────────────────────────────────────────────────────
  setAim(side: Side, x: number) {
    const p = side === 'player' ? this.player : this.ai
    p.tx = clamp(x, -(HALF_W + 0.7), HALF_W + 0.7)
  }

  moveKey(side: Side, dir: number, dt: number) {
    const p = side === 'player' ? this.player : this.ai
    p.tx = clamp(p.tx + dir * 7.2 * dt, -(HALF_W + 0.7), HALF_W + 0.7)
  }

  setCharging(side: Side, on: boolean) {
    const p = side === 'player' ? this.player : this.ai
    p.charging = on
    if (!on) p.charge = 0
  }

  /** Press-to-serve / press-to-charge unified action. */
  action(side: Side) {
    if (this.mode === 'demo') return
    if (this.phase === 'serve' && this.server === side) {
      this.doServe(side)
    } else {
      const p = side === 'player' ? this.player : this.ai
      p.charging = true
    }
  }

  releaseAction(side: Side) {
    const p = side === 'player' ? this.player : this.ai
    // only drop charge if the shot hasn't fired yet this press
    if (p.charging) {
      p.charging = false
      p.charge = 0
    }
  }

  togglePause() {
    if (this.mode === 'demo' || this.phase === 'over') return
    this.paused = !this.paused
    useStore.getState().setPaused(this.paused)
  }

  // ── main loop ─────────────────────────────────────────────────────────────
  update(dtReal: number) {
    if (this.paused) return
    // slow-mo / hit-stop time scaling
    this.slowmoT = Math.max(0, this.slowmoT - dtReal)
    this.hitStopT = Math.max(0, this.hitStopT - dtReal)
    let ts = 1
    if (this.slowmoT > 0) ts = 0.28
    else if (this.hitStopT > 0) ts = 0.12
    this.cinematic = this.slowmoT > 0

    this.acc += Math.min(dtReal, 0.1) * ts
    while (this.acc >= STEP) {
      this.stepSim(STEP)
      this.acc -= STEP
    }
    this.shake = Math.max(0, this.shake - dtReal * 2.2)
  }

  private stepSim(dt: number) {
    this.simTime += dt

    // paddles
    if (this.p1Key !== 0 && this.mode !== 'demo') this.moveKey('player', this.p1Key, dt)
    if (this.p2Key !== 0 && this.mode === 'duel') this.moveKey('ai', this.p2Key, dt)
    this.updatePaddle(this.player, dt)
    this.updatePaddle(this.ai, dt)
    if (this.mode === 'demo') {
      this.updateAI(dt)
    } else if (this.mode === 'duel') {
      // no AI in duel
    } else if (this.mode !== 'trick') {
      this.updateAI(dt)
    }

    // charging
    if (this.player.charging && this.mode !== 'duel') {
      this.player.charge = Math.min(1, this.player.charge + dt / 0.85)
    }
    if (this.mode === 'duel') {
      if (this.player.charging) this.player.charge = Math.min(1, this.player.charge + dt / 0.85)
      if (this.ai.charging) this.ai.charge = Math.min(1, this.ai.charge + dt / 0.85)
    }

    // flow state expiry
    if (this.flowOn && this.simTime > this.flowUntil) {
      this.setFlowActive(false)
    }

    if (this.phase === 'serve') {
      this.stepServe(dt)
    } else if (this.phase === 'rally') {
      this.stepBall(dt)
      if (this.mode === 'trick') {
        this.trick.timeLeft -= dt
        if (this.trick.timeLeft <= 0) {
          this.endTrick()
          return
        }
        const secs = Math.ceil(this.trick.timeLeft)
        if (secs !== this.trickTimePushed) {
          this.trickTimePushed = secs
          useStore.getState().setTrick(this.trick.score, this.trick.timeLeft, this.trick.combo)
        }
      }
    } else if (this.phase === 'point') {
      this.pointTimer -= dt
      if (this.pointTimer <= 0) this.afterPoint()
    }

    // rally-based music intensity
    if (this.mode !== 'demo') {
      setMusicIntensity(this.rally >= 8 ? 2 : this.rally >= 3 ? 1 : 0)
    }
  }

  private updatePaddle(p: Paddle, dt: number) {
    const prev = p.x
    const k = 1 - Math.exp(-dt * 20)
    let dx = (p.tx - p.x) * k
    const maxStep = p.maxSpeed * dt
    if (Math.abs(dx) > maxStep) dx = Math.sign(dx) * maxStep
    p.x += dx
    p.vx = (p.x - prev) / dt
    // smooth velocity for spin so input jitter doesn't wildly bend shots
    const sk = 1 - Math.exp(-dt * 9)
    p.spinVx += (p.vx - p.spinVx) * sk
    p.cool = Math.max(0, p.cool - dt)
  }

  // ── serve ─────────────────────────────────────────────────────────────────
  private setupServe() {
    this.phase = 'serve'
    this.ball.active = false
    this.ball.visible = true
    this.ball.curveH = 0
    this.ball.curveV = 0
    this.lastHitter = null
    this.landedTargetSide = false
    this.rally = 0
    useStore.getState().setRally(0)
    this.serveTimer = this.server === 'ai' || this.mode === 'demo' ? rand(0.9, 1.5) : -1
    this.pendingServe = this.server

    // match point callout
    const mp = this.matchPointSide()
    const st = useStore.getState()
    st.setMatchPoint(mp)
    st.setServer(this.server)
    if (mp && mp !== this.lastMpShown) {
      this.lastMpShown = mp
      const who = this.sideName(mp)
      st.showBanner('MATCH POINT', 'epic', `${who} needs the next point`)
    }
  }

  private stepServe(dt: number) {
    // ball hovers at the server's paddle
    const srv = this.pendingServe
    const pad = srv === 'player' ? this.player : this.ai
    const z = srv === 'player' ? PLAYER_Z - 0.35 : AI_Z + 0.35
    const bob = Math.sin(this.simTime * 3.2) * 0.06
    this.ball.pos.x += (pad.x * 0.75 - this.ball.pos.x) * (1 - Math.exp(-dt * 10))
    this.ball.pos.y = TABLE.H + 0.62 + bob
    this.ball.pos.z = z

    const auto = this.mode === 'demo' || (srv === 'ai' && this.mode !== 'duel' && this.mode !== 'trick')
    if (auto) {
      this.serveTimer -= dt
      if (this.serveTimer <= 0) this.doServe(srv)
    }
  }

  private doServe(side: Side) {
    const pad = side === 'player' ? this.player : this.ai
    const b = this.ball
    b.active = true
    this.phase = 'rally'
    this.lastHitter = side
    this.landedTargetSide = false
    this.shotId++
    this.rally = 0

    const depth = rand(2.3, 3.2)
    let targetX: number
    let targetZ: number
    let speed: number

    if (side === 'player') {
      targetX = clamp(pad.tx * 0.62, -1.95, 1.95)
      targetZ = -depth
      speed = rand(8.2, 9.2)
    } else {
      targetX = this.mode === 'duel' ? rand(-1.8, 1.8) : rand(-1.7, 1.7)
      targetZ = depth
      speed = rand(7.6, 8.8)
    }

    const v = this.solveShot(b.pos, targetX, targetZ, speed, 0)
    b.vel = v
    b.curveH = clamp(pad.vx * 0.5, -2, 2)
    b.curveV = -1.2

    pad.cool = 0.3
    this.emitFX(b.pos, side === 'player' ? '#67e8f9' : this.tier.color, 8, 3)
    this.bumpShake(0.12)
    if (this.mode !== 'demo') sfx.serve()
    // AI plans for the incoming serve
    this.aiPlannedShot = -1
  }

  // ── ball physics ──────────────────────────────────────────────────────────
  private stepBall(dt: number) {
    const b = this.ball
    if (!b.active) return

    const prevZ = b.pos.z
    const prevY = b.pos.y

    // forces
    b.vel.y += (GRAV + b.curveV) * dt
    b.vel.x += b.curveH * dt
    // light air drag
    const drag = 1 - 0.1 * dt
    b.vel.x *= drag
    b.vel.z *= drag

    b.pos.x += b.vel.x * dt
    b.pos.y += b.vel.y * dt
    b.pos.z += b.vel.z * dt

    b.heat = clamp((Math.hypot(b.vel.x, b.vel.y, b.vel.z) - 7) / 9, 0, 1)

    // ── net collision ──
    if (prevZ !== b.pos.z && Math.sign(prevZ) !== Math.sign(b.pos.z)) {
      const t = Math.abs(prevZ) / (Math.abs(prevZ) + Math.abs(b.pos.z))
      const yAt = prevY + (b.pos.y - prevY) * t
      const xAt = b.pos.x
      if (yAt < NET_H + BALL_R * 0.8 && Math.abs(xAt) < HALF_W + 0.3) {
        this.onNet()
        return
      }
    }

    // ── table bounce ──
    if (
      b.vel.y < 0 &&
      b.pos.y - BALL_R <= TABLE.H &&
      prevY - BALL_R > TABLE.H - 0.2 &&
      Math.abs(b.pos.x) <= HALF_W + 0.05 &&
      Math.abs(b.pos.z) <= HALF_L + 0.05
    ) {
      b.pos.y = TABLE.H + BALL_R
      b.vel.y = -b.vel.y * 0.66
      b.vel.x *= 0.95
      b.vel.z *= 0.95
      b.curveH *= 0.65
      b.curveV *= 0.4
      this.onBounce()
    }

    // ── paddle hits ──
    if (b.vel.z > 0 && prevZ < PLAYER_Z - 0.26 && b.pos.z >= PLAYER_Z - 0.26) {
      this.tryHit('player')
    }
    if (b.vel.z < 0 && prevZ > AI_Z + 0.26 && b.pos.z <= AI_Z + 0.26) {
      if (this.mode === 'trick') this.wallReturn()
      else this.tryHit('ai')
    }

    // ── stillness safety ──
    const spd = Math.hypot(b.vel.x, b.vel.y, b.vel.z)
    if (spd < 0.6 && b.pos.y < TABLE.H + 0.3) this.stillT += dt
    else this.stillT = 0
    if (this.stillT > 1.6) {
      this.resolveDead()
      return
    }

    // ── out of bounds → dead ──
    if (
      b.pos.y - BALL_R <= 0.01 ||
      Math.abs(b.pos.z) > HALF_L + 3.2 ||
      Math.abs(b.pos.x) > HALF_W + 4
    ) {
      if (b.pos.y - BALL_R <= 0.01) {
        b.pos.y = BALL_R
        // one floor bounce then die
        if (b.vel.y < 0) b.vel.y = -b.vel.y * 0.4
        if (Math.abs(b.vel.y) < 1.2) {
          this.resolveDead()
          return
        }
      } else {
        this.resolveDead()
      }
    }
  }

  private onBounce() {
    const b = this.ball
    const side: Side = b.pos.z < 0 ? 'ai' : 'player'
    const color = side === 'ai' ? '#67e8f9' : '#f0abfc'
    this.emitFX({ ...b.pos, y: TABLE.H + 0.02 }, color, 6, 2.2)
    this.pushRing({ x: b.pos.x, y: TABLE.H + 0.03, z: b.pos.z }, color)
    if (this.mode !== 'demo') sfx.tableBounce()

    if (this.mode === 'trick' && side === 'ai') {
      this.checkTargets()
    }

    if (this.lastHitter && !this.landedTargetSide) {
      const opponentSide: Side = this.lastHitter === 'player' ? 'ai' : 'player'
      if (side === opponentSide) {
        this.landedTargetSide = true // good, legal bounce
      } else {
        // bounced on own side first → fault
        this.awardPoint(opponentSide, 'FAULT')
      }
    }
  }

  private onNet() {
    const b = this.ball
    this.emitFX({ x: b.pos.x, y: NET_H * 0.7 + TABLE.H * 0, z: 0 }, '#ff5470', 14, 3.4)
    if (this.mode !== 'demo') sfx.net()
    this.bumpShake(0.25)
    const winner: Side = this.lastHitter === 'player' ? 'ai' : 'player'
    if (this.mode === 'demo') {
      this.silentRestart()
      return
    }
    if (this.mode === 'trick') {
      this.endRallyTrick()
      return
    }
    this.awardPoint(winner, 'NET!')
  }

  private resolveDead() {
    if (this.mode === 'demo') {
      this.silentRestart()
      return
    }
    if (this.mode === 'trick') {
      this.endRallyTrick()
      return
    }
    if (!this.lastHitter) {
      this.awardPoint(this.server === 'player' ? 'ai' : 'player', '')
      return
    }
    if (this.landedTargetSide) {
      // legal shot, opponent failed to return
      this.awardPoint(this.lastHitter, this.lastHitter === 'player' ? 'WINNER!' : '')
    } else {
      // hitter's shot never landed on the opponent side
      this.awardPoint(this.lastHitter === 'player' ? 'ai' : 'player', 'OUT!')
    }
  }

  // ── paddle contact ────────────────────────────────────────────────────────
  private tryHit(side: Side) {
    const b = this.ball
    const pad = side === 'player' ? this.player : this.ai
    if (pad.cool > 0) return

    const human = side === 'player' || this.mode === 'duel'
    let reach = PADDLE_REACH
    let errX = 0
    if (!human) {
      // AI reach can be fooled by flow state
      if (this.flowOn) reach *= 0.78
    }

    const dx = b.pos.x - pad.x
    if (Math.abs(dx) > reach || b.pos.y > PADDLE_TOP || b.pos.y < TABLE.H - 0.4) return

    // ── contact! ──
    pad.cool = 0.24
    this.shotId++
    this.lastHitter = side
    this.landedTargetSide = false
    this.rally++
    useStore.getState().setRally(this.rally)

    const power = pad.charge
    pad.charge = 0
    pad.charging = false

    let speed: number
    let targetX: number
    let targetZ: number
    let curveV: number

    if (human) {
      speed = 8.6 + power * 6.2 + Math.min(this.rally, 10) * 0.08
      const off = clamp(dx / PADDLE_REACH, -1, 1)
      const oppPad = side === 'player' ? this.ai : this.player
      targetX = clamp(off * 2.0 - oppPad.x * 0.42, -2.05, 2.05)
      targetZ = side === 'player' ? -(2.3 + power * 1.15 + rand(0, 0.5)) : 2.3 + power * 1.15 + rand(0, 0.5)
      curveV = -(1.4 + power * 5.4)
    } else {
      // AI shot planning
      const smash = Math.random() < this.tier.smashChance && this.rally >= 2
      speed = this.tier.returnSpeed + pad.charge * 2.2 + rand(-0.5, 1.4) + (smash ? 2.6 : 0)
      if (this.flowOn) speed *= 0.82
      const away = this.player.x >= 0 ? -1 : 1
      targetX = clamp(
        away * rand(this.tier.aimMin, this.tier.aimMax) + rand(-this.tier.error, this.tier.error) * 2,
        -2.05,
        2.05
      )
      targetZ = Math.min(4.0, 2.2 + rand(0, 1.3) + (smash ? 0.8 : 0))
      curveV = -(1.2 + (smash ? 4.5 : rand(0, 1.5)))
      if (smash) {
        // smashes leave the machine recovering — and sometimes overhit
        this.aiRecoverT = 0.55
        if (this.mode !== 'demo' && Math.random() < 0.2) {
          targetZ = rand(4.45, 5.1) // sails long → fault
        }
        if (this.mode !== 'demo') {
          useStore.getState().showBanner(`${this.aiName} SMASHES`, 'bad')
          sfx.smash()
          this.bumpShake(0.4)
        }
      }
    }

    const v = this.solveShot(b.pos, targetX, targetZ, speed, curveV)
    b.vel = v
    b.curveH = human ? clamp(pad.spinVx * 0.82, -2.9, 2.9) : clamp(pad.spinVx * 0.32, -2.2, 2.2)
    b.curveV = curveV

    // juice
    const smash = human && power > 0.7
    const color = side === 'player' ? '#67e8f9' : this.tier.color
    this.emitFX({ ...b.pos }, smash ? '#ffd166' : color, smash ? 22 : 10, smash ? 6 : 3.4)
    if (smash) {
      this.pushRing({ ...b.pos }, '#ffd166')
      sfx.smash()
      this.bumpShake(0.55)
      this.hitStopT = 0.09
      useStore.getState().showBanner('SMASH!', 'epic')
    } else if (this.mode !== 'demo') {
      sfx.paddleHit(0.25 + power * 0.75)
      this.bumpShake(0.08 + power * 0.18)
    }

    // flow meter (single-player vs AI only)
    if (side === 'player' && (this.mode === 'quick' || this.mode === 'gauntlet')) {
      this.flow = Math.min(1, this.flow + 0.15)
      if (this.flow >= 1 && !this.flowOn) {
        this.setFlowActive(true)
        this.flowUntil = this.simTime + FLOW_DURATION
        this.flow = 0
        sfx.flow()
        useStore.getState().showBanner('FLOW STATE', 'epic', 'the world slows down')
      }
      useStore.getState().setFlow(this.flow, this.flowOn)
    }
  }

  /** Trick-mode wall: always returns, keeps the rally alive. */
  private wallReturn() {
    const b = this.ball
    this.shotId++
    this.lastHitter = 'ai'
    this.landedTargetSide = false
    this.rally++
    useStore.getState().setRally(this.rally)

    const targetX = clamp(this.player.x * 0.5 + rand(-1.4, 1.4), -2.0, 2.0)
    const targetZ = 2.2 + rand(0, 1.2)
    const speed = rand(7.2, 9.4)
    b.vel = this.solveShot(b.pos, targetX, targetZ, speed, -1.6)
    b.curveH = rand(-1.5, 1.5)
    b.curveV = -1.6
    this.ai.cool = 0.3

    this.emitFX({ ...b.pos }, '#f0abfc', 8, 3)
    if (this.mode !== 'demo') sfx.wallHit(0.5)
    this.bumpShake(0.08)
  }

  // ── AI ────────────────────────────────────────────────────────────────────
  private updateAI(dt: number) {
    const a = this.ai
    let desired = 0
    this.aiRecoverT = Math.max(0, this.aiRecoverT - dt)
    let speedMul = this.flowOn ? 0.45 : 1
    if (this.aiRecoverT > 0) speedMul *= 0.28
    const errMul = this.flowOn ? 2.6 : 1

    if (this.mode === 'demo') {
      // both paddles AI-driven for the menu backdrop demo rally
      if (this.demoShot !== this.shotId) {
        this.demoShot = this.shotId
        this.demoErrA = rand(-1.15, 1.15)
        this.demoErrP = rand(-1.15, 1.15)
      }
      desired = this.predictFor(-1) + this.demoErrA
      this.moveToward(a, desired, this.tier.speed)
      const p = this.player
      const dP = this.predictFor(1) + this.demoErrP
      this.moveToward(p, dP, this.tier.speed)
      // occasional dramatic charges
      if (this.ball.active) {
        if (this.ball.vel.z < 0) {
          if (!a.charging && Math.random() < 0.004) a.charging = true
        } else a.charging = false
        if (this.ball.vel.z > 0) {
          if (!p.charging && Math.random() < 0.004) p.charging = true
        } else p.charging = false
        if (a.charging) a.charge = Math.min(1, a.charge + dt / 0.8)
        if (p.charging) p.charge = Math.min(1, p.charge + dt / 0.8)
      }
      return
    }

    if (this.phase === 'rally' && this.ball.active && this.ball.vel.z < 0 && this.lastHitter === 'player') {
      if (this.aiPlannedShot !== this.shotId) {
        this.aiPlanT += dt
        if (this.aiPlanT >= this.tier.reaction) {
          this.aiPlannedShot = this.shotId
          // fast balls are harder to read — smashes stretch every machine
          const ballSpeed = Math.hypot(this.ball.vel.x, this.ball.vel.y, this.ball.vel.z)
          const speedErr = 1 + Math.max(0, ballSpeed - 9.5) * 0.14
          this.aiErr = rand(-1, 1) * this.tier.error * errMul * speedErr
          this.aiPlanT = 0
        }
      }
      if (this.aiPlannedShot === this.shotId) {
        desired = this.predictFor(-1) + this.aiErr
      } else {
        desired = a.x // hold until reacted
      }
    } else if (this.phase === 'serve' && this.server === 'ai') {
      desired = rand(-0.5, 0.5)
    } else {
      desired = clamp(this.ball.pos.x * 0.25, -1, 1)
    }

    this.moveToward(a, desired, this.tier.speed * speedMul)

    // AI charges up for smashes vs incoming ball
    if (this.phase === 'rally' && this.ball.vel.z < 0 && this.tier.smashChance > 0.1) {
      a.charging = true
    } else {
      a.charging = false
      a.charge = 0
    }
    if (a.charging) a.charge = Math.min(1, a.charge + dt / 0.7)
  }

  /** Predict ball x at the given side's paddle plane. dir: -1 → AI plane, +1 → player plane. */
  private predictFor(dir: -1 | 1): number {
    const b = this.ball
    if (!b.active) return 0
    const planeZ = dir === -1 ? AI_Z + 0.26 : PLAYER_Z - 0.26
    if ((dir === -1 && b.vel.z >= 0) || (dir === 1 && b.vel.z <= 0)) return 0
    const t = (planeZ - b.pos.z) / b.vel.z
    if (t < 0) return 0
    // imperfect spin reading: curved shots fool weaker machines
    const x = b.pos.x + b.vel.x * t + 0.5 * b.curveH * this.tier.curveRead * t * t
    return clamp(x, -(HALF_W + 0.6), HALF_W + 0.6)
  }

  private moveToward(p: Paddle, target: number, speed: number) {
    p.maxSpeed = speed
    p.tx = clamp(target, -(HALF_W + 0.7), HALF_W + 0.7)
  }

  // ── scoring ───────────────────────────────────────────────────────────────
  private matchPointSide(): Side | null {
    const { p, a } = this.score
    if (p >= GAME_TARGET - 1 && p > a) return 'player'
    if (a >= GAME_TARGET - 1 && a > p) return 'ai'
    return null
  }

  private sideName(side: Side): string {
    if (this.mode === 'duel') return side === 'player' ? 'PLAYER 1' : 'PLAYER 2'
    return side === 'player' ? 'YOU' : this.aiName
  }

  private awardPoint(winner: Side, label: string) {
    if (this.phase !== 'rally') return
    this.phase = 'point'
    this.ball.active = false
    this.ball.visible = false
    this.pointTimer = POINT_DELAY
    this.server = winner // winner serves next (momentum rule)

    if (winner === 'player') this.score.p++
    else this.score.a++

    const st = useStore.getState()
    st.point(winner, this.score.p, this.score.a, this.server)
    st.setRally(0)
    this.rally = 0

    this.emitFX({ ...this.ball.pos }, winner === 'player' ? '#67e8f9' : '#ff5470', 26, 6, true)
    this.pushRing({ ...this.ball.pos }, winner === 'player' ? '#67e8f9' : '#ff5470')
    this.bumpShake(0.4)

    // did this win the game?
    const { p, a } = this.score
    const won =
      (winner === 'player' && p >= GAME_TARGET && p - a >= 2) ||
      (winner === 'ai' && a >= GAME_TARGET && a - p >= 2)

    if (won) {
      this.pointTimer = WIN_DELAY
      this.slowmoT = 1.25
      this.lastMpShown = null
    }

    const winText =
      this.mode === 'duel'
        ? winner === 'player'
          ? 'POINT — PLAYER 1'
          : 'POINT — PLAYER 2'
        : winner === 'player'
          ? 'POINT — YOU'
          : `POINT — ${this.aiName}`

    if (won) {
      st.showBanner(winner === 'player' ? 'GAME!' : 'GAME...', winner === 'player' ? 'epic' : 'bad', label)
      if (this.mode !== 'demo') {
        if (winner === 'player') sfx.matchWin()
        else sfx.matchLose()
      }
      this.pendingGameOver = { winner, winnerSideWon: winner }
    } else {
      st.showBanner(winText, winner === 'player' ? 'good' : 'bad', label || undefined)
      if (this.mode !== 'demo') sfx.point(winner === 'player')
    }
  }

  private pendingGameOver: { winner: Side; winnerSideWon: Side } | null = null

  private afterPoint() {
    if (this.pendingGameOver) {
      const winner = this.pendingGameOver.winner
      this.pendingGameOver = null
      this.finishMatch(winner)
      return
    }
    this.setupServe()
  }

  private finishMatch(winner: Side) {
    this.phase = 'over'
    this.ball.visible = false
    const st = useStore.getState()
    const playerWon = winner === 'player'

    if (this.mode === 'quick') {
      if (playerWon && this.mode === 'quick' && st.tierIndex >= 1) st.unlockOverdrive()
      st.finishGame({
        won: playerWon,
        title: playerWon ? 'VICTORY' : 'DEFEAT',
        sub: playerWon
          ? `${this.aiName} dismantled — ${this.score.p}:${this.score.a}`
          : `${this.aiName} takes it ${this.score.a}:${this.score.p}`,
      })
    } else if (this.mode === 'gauntlet') {
      if (playerWon) {
        if (st.gauntletRound >= GAUNTLET.length - 1) {
          st.clearGauntlet()
          st.finishGame({
            won: true,
            title: 'GAUNTLET CHAMPION',
            sub: `All five machines defeated. MIDAS paddle unlocked.`,
          })
        } else {
          st.finishGame({
            won: true,
            title: 'ROUND CLEAR',
            sub: `Next up: ${GAUNTLET[st.gauntletRound + 1].name}`,
          })
        }
      } else {
        st.finishGame({
          won: false,
          title: 'GAUNTLET OVER',
          sub: `${this.aiName} ends your run at round ${st.gauntletRound + 1}`,
        })
      }
    } else if (this.mode === 'duel') {
      st.finishGame({
        won: playerWon,
        title: playerWon ? 'PLAYER 1 WINS' : 'PLAYER 2 WINS',
        sub: `${this.score.p}:${this.score.a} — what a duel`,
      })
    }
  }

  private endTrick() {
    this.phase = 'over'
    this.ball.active = false
    this.ball.visible = false
    const st = useStore.getState()
    const s = this.trick.score
    st.finishGame({
      won: s > 0,
      title: 'TIME!',
      sub: `Trick shot score: ${s}${s >= st.trickBest && s > 0 ? ' — NEW BEST!' : ''}`,
    })
  }

  private endRallyTrick() {
    // rally ended without timer expiring → reset combo, quick re-serve
    this.trick.combo = 1
    useStore.getState().setTrick(this.trick.score, this.trick.timeLeft, 1)
    this.phase = 'point'
    this.pointTimer = 0.8
    this.ball.active = false
    this.ball.visible = false
    this.server = 'player'
    this.pendingGameOver = null
  }

  private checkTargets() {
    const b = this.ball
    for (const tg of this.trick.targets) {
      if (!tg.alive) continue
      const d = Math.hypot(b.pos.x - tg.x, b.pos.z - tg.z)
      if (d < tg.r + BALL_R) {
        tg.alive = false
        const pts = 100 * this.trick.combo
        this.trick.score += pts
        this.trick.combo = Math.min(9, this.trick.combo + 1)
        this.emitFX({ x: tg.x, y: TABLE.H + 0.1, z: tg.z }, '#ffd166', 24, 5, true)
        this.pushRing({ x: tg.x, y: TABLE.H + 0.05, z: tg.z }, '#ffd166')
        sfx.target()
        this.bumpShake(0.3)
        const st = useStore.getState()
        st.setTrick(this.trick.score, this.trick.timeLeft, this.trick.combo)
        st.showBanner(`+${pts}`, 'epic', this.trick.combo > 2 ? `COMBO x${this.trick.combo - 1}` : undefined)
        setTimeout(() => this.spawnTarget(), 400)
        return
      }
    }
  }

  private spawnTarget() {
    if (this.mode !== 'trick') return
    for (let tries = 0; tries < 30; tries++) {
      const x = rand(-1.85, 1.85)
      const z = rand(-3.5, -1.0)
      const ok = this.trick.targets.every((t) => !t.alive || Math.hypot(t.x - x, t.z - z) > 1.25)
      if (ok) {
        this.trick.targets.push({ x, z, r: 0.55, alive: true, pop: 0 })
        return
      }
    }
    this.trick.targets.push({ x: rand(-1.85, 1.85), z: rand(-3.5, -1.0), r: 0.55, alive: true, pop: 0 })
  }

  private silentRestart() {
    this.phase = 'point'
    this.pointTimer = 0.6
    this.ball.active = false
    this.ball.visible = false
    this.server = Math.random() < 0.5 ? 'player' : 'ai'
    this.pendingGameOver = null
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  /** Solve a launch velocity from p0 to (tx, tz) at table-top height with given horizontal speed. */
  private solveShot(p0: Vec3, tx: number, tz: number, speed: number, curveV: number): Vec3 {
    let T = Math.max(0.3, Math.hypot(tx - p0.x, tz - p0.z) / speed)
    const g = GRAV + curveV
    let vy = 0
    let vx = 0
    let vz = 0
    for (let attempt = 0; attempt < 5; attempt++) {
      vy = (TABLE.H + BALL_R + 0.02 - p0.y - 0.5 * g * T * T) / T
      vx = (tx - p0.x) / T
      vz = (tz - p0.z) / T
      // net clearance check
      if (Math.sign(p0.z) === Math.sign(tz) || tz === 0) break // doesn't cross net plane
      const tn = -p0.z / vz
      if (tn <= 0 || tn >= T) break
      const yNet = p0.y + vy * tn + 0.5 * g * tn * tn
      if (yNet > NET_H + BALL_R + 0.1) break
      T *= 1.18 // lob higher
    }
    return { x: vx, y: vy, z: vz }
  }

  emitFX(pos: Vec3, color: string, count: number, speed: number, big = false) {
    if (this.fx.length > 60) this.fx.splice(0, this.fx.length - 60)
    this.fx.push({ kind: 'spark', pos: { ...pos }, color, count, speed, big })
  }

  pushRing(pos: Vec3, color: string) {
    this.fx.push({ kind: 'ring', pos: { ...pos }, color, count: 0, speed: 0 })
  }

  bumpShake(amount: number) {
    this.shake = Math.min(1.2, this.shake + amount)
  }

  private setFlowActive(on: boolean) {
    if (this.flowOn === on) return
    this.flowOn = on
    useStore.getState().setFlow(on ? 1 : this.flow, on)
  }

  get flowActive() {
    return this.flowOn
  }
}

export const engine = new Engine()
