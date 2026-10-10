// Full-mode regression suite for the v2 combat engine (headless).
import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'
import { GAUNTLET } from '../src/game/constants'

const DT = 1 / 60

/** Timing bot: charges and releases just before contact; aims with edge offsets. */
function makeBot(skill: number) {
  let aim = 0
  let cornerSign = 1
  let pressed = false
  return (i: number) => {
    const tta = engine.timeToPlayerPlane()
    if (engine.ball.active && engine.ball.vel.z > 0 && tta !== null) {
      const px = engine.predictedPlayerContactX()
      const want = px + cornerSign * 0.5 + (Math.random() - 0.5) * 0.3 * skill
      const maxMove = 9.5 * DT
      aim += Math.max(-maxMove, Math.min(maxMove, want - aim))
    } else {
      const maxMove = 9.5 * DT
      aim += Math.max(-maxMove, Math.min(maxMove, -aim * 0.4))
    }
    engine.setAim('player', aim)

    if (engine.phase === 'serve' && engine.server === 'player') {
      engine.action('player')
      cornerSign = Math.random() < 0.5 ? -1 : 1
      return
    }
    if (tta !== null) {
      if (!pressed && tta < 0.4) {
        engine.action('player')
        pressed = true
      }
      if (pressed && tta < 0.05 + skill * 0.12 * Math.random()) {
        engine.releaseAction('player')
        pressed = false
      }
    } else if (pressed) {
      engine.releaseAction('player')
      pressed = false
    }
  }
}

function p2Bot(i: number) {
  if (engine.ball.active && engine.ball.vel.z < 0) {
    const t = (-4.36 - engine.ball.pos.z) / engine.ball.vel.z
    if (t > 0) engine.setAim('ai', engine.ball.pos.x + engine.ball.vel.x * t + (Math.random() - 0.5) * 0.3)
  } else engine.setAim('ai', 0)
  if (engine.phase === 'serve' && engine.server === 'ai') engine.action('ai')
  else if (engine.ball.active && engine.ball.vel.z > 0) {
    // p2 swings when ball leaves player side
    engine.action('ai')
    setTimeout(() => engine.releaseAction('ai'), 240)
  }
  void i
}

// ── 1. demo backdrop ──
engine.startDemo()
let rallies = 0
let lastPhase = engine.phase
for (let i = 0; i < 60 * 45; i++) {
  engine.update(DT)
  if (engine.phase === 'serve' && lastPhase !== 'serve') rallies++
  lastPhase = engine.phase
}
console.log(`[demo] 45s ok, serve cycles: ${rallies}`)

// ── 2. quick match vs each tier ──
for (const tier of [0, 1, 2]) {
  useStore.setState({ screen: 'game' })
  useStore.getState().startQuick(tier)
  engine.startQuick(tier)
  const bot = makeBot(0.3)
  for (let i = 0; i < 60 * 300; i++) {
    bot(i)
    engine.update(DT)
    if (useStore.getState().screen === 'result') break
  }
  const s = useStore.getState()
  console.log(`[quick t${tier}]`, s.result ? `${s.result.title} ${engine.score.p}:${engine.score.a}` : 'TIMEOUT')
}

// ── 3. trick shot ──
useStore.setState({ screen: 'game' })
useStore.getState().startTrick()
engine.startTrick()
{
  const bot = makeBot(0.4)
  for (let i = 0; i < 60 * 75; i++) {
    bot(i)
    engine.update(DT)
    if (useStore.getState().screen === 'result') break
  }
  console.log('[trick]', JSON.stringify(useStore.getState().result), 'score:', engine.trick.score)
}

// ── 4. gauntlet round 1 sanity ──
useStore.setState({ screen: 'game' })
useStore.getState().startGauntlet(0)
engine.startGauntlet(0)
{
  const bot = makeBot(0.2)
  for (let i = 0; i < 60 * 300; i++) {
    bot(i)
    engine.update(DT)
    if (useStore.getState().screen === 'result') break
  }
  console.log('[gauntlet r1]', JSON.stringify(useStore.getState().result))
}

// ── 5. duel bot vs bot (should rally without crashing) ──
useStore.setState({ screen: 'game' })
useStore.getState().startDuel()
engine.startDuel()
{
  const bot1 = makeBot(0.5)
  for (let i = 0; i < 60 * 40; i++) {
    bot1(i)
    p2Bot(i)
    engine.update(DT)
    if (useStore.getState().screen === 'result') break
  }
  console.log('[duel] 40s ok, phase:', engine.phase, 'score:', JSON.stringify(engine.score))
}

console.log('SMOKE OK')
