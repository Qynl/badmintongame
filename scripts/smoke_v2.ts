// Tests for combat v2: timing-based hitting.
import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'

const DT = 1 / 60

/** Bot that presses to charge and releases just before contact (timing skill). */
function makeTimingBot(skill: number) {
  let aim = 0
  let cornerSign = 1
  let pressed = false
  let perfects = 0
  let goods = 0
  let weaks = 0
  const api = {
    perfects: () => perfects,
    goods: () => goods,
    weaks: () => weaks,
    tick: (i: number) => {
      const tta = engine.timeToPlayerPlane()
      // movement: intercept with edge offset for angles
      if (engine.ball.active && engine.ball.vel.z > 0 && tta !== null) {
        const px = engine.predictedPlayerContactX()
        const want = px + cornerSign * 0.55 + (Math.random() - 0.5) * (0.3 * skill)
        const maxMove = 9.5 * DT
        aim += Math.max(-maxMove, Math.min(maxMove, want - aim))
      } else {
        const maxMove = 9.5 * DT
        aim += Math.max(-maxMove, Math.min(maxMove, -aim * 0.4))
      }
      engine.setAim('player', aim)

      if (engine.phase === 'serve' && engine.server === 'player') {
        engine.action('player')
        if (engine.rally === 0) cornerSign = Math.random() < 0.5 ? -1 : 1
        return
      }

      // timing: press ~0.4s before contact, release with skill-based accuracy
      if (tta !== null) {
        if (!pressed && tta < 0.42) {
          engine.action('player')
          pressed = true
        }
        if (pressed && tta < 0.05 + skill * 0.15 * Math.random()) {
          engine.releaseAction('player')
          pressed = false
        }
      } else {
        if (pressed) {
          engine.releaseAction('player')
          pressed = false
        }
      }
      const q = engine.lastQuality
      void q
    },
  }
  // sample quality counters from engine after each contact
  const origHuman = (engine as any).humanStrike.bind(engine)
  let lastId = -1
  const wrapped = function (side: string, quality: string, dx: number, sp: number) {
    if (side === 'player' && engine.shotId !== lastId) {
      lastId = engine.shotId
      if (quality === 'perfect') perfects++
      else if (quality === 'good' || quality === 'block') goods++
      else weaks++
    }
    return origHuman(side, quality, dx, sp)
  }
  ;(engine as any).humanStrike = wrapped
  return api
}

function runMatch(tier: number, skill: number, maxSec = 300) {
  useStore.setState({ screen: 'game' })
  useStore.getState().startQuick(tier)
  engine.startQuick(tier)
  const bot = makeTimingBot(skill)
  for (let i = 0; i < 60 * maxSec; i++) {
    bot.tick(i)
    engine.update(DT)
    if (useStore.getState().screen === 'result') break
  }
  const s = useStore.getState()
  return {
    res: `${s.result?.won ? 'W' : s.result ? 'L' : 'TIMEOUT'} ${engine.score.p}:${engine.score.a}`,
    perfects: bot.perfects(),
    goods: bot.goods(),
    weaks: bot.weaks(),
  }
}

console.log('skilled (timing) vs tier2:', JSON.stringify(runMatch(2, 0.15)))
console.log('skilled (timing) vs tier1:', JSON.stringify(runMatch(1, 0.15)))
console.log('clumsy  (timing) vs tier0:', JSON.stringify(runMatch(0, 1.0)))
console.log('clumsy  (timing) vs tier2:', JSON.stringify(runMatch(2, 1.0)))

// passive bot (never presses → always soft returns) vs tier0 — should lose but resolve
useStore.setState({ screen: 'game' })
useStore.getState().startQuick(0)
engine.startQuick(0)
{
  let aim = 0
  for (let i = 0; i < 60 * 200; i++) {
    if (engine.ball.active && engine.ball.vel.z > 0) {
      const t = (4.36 - engine.ball.pos.z) / engine.ball.vel.z
      if (t > 0) {
        const want = engine.ball.pos.x + engine.ball.vel.x * t
        const maxMove = 9.5 * DT
        aim += Math.max(-maxMove, Math.min(maxMove, want - aim))
      }
    }
    engine.setAim('player', aim)
    if (engine.phase === 'serve' && engine.server === 'player') engine.action('player')
    engine.update(DT)
    if (useStore.getState().screen === 'result') break
  }
  console.log('passive vs tier0:', useStore.getState().result ? JSON.stringify(useStore.getState().result) : 'TIMEOUT', engine.score)
}

console.log('SMOKE_V2 OK')
