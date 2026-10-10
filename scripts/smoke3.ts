// Third pass: gauntlet ladder + duel + flow state sanity.
import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'
import { GAUNTLET } from '../src/game/constants'

const DT = 1 / 60

function playerBot(tick: number, noise = 0.3) {
  if (engine.ball.active && engine.ball.vel.z > 0) {
    const t = (4.29 - engine.ball.pos.z) / engine.ball.vel.z
    if (t > 0) engine.setAim('player', engine.ball.pos.x + engine.ball.vel.x * t + (Math.random() - 0.5) * noise)
  } else engine.setAim('player', 0)
  if (engine.phase === 'serve' && engine.server === 'player') engine.action('player')
  else engine.setCharging('player', tick % 120 < 95)
}

function aiSideBot(tick: number) {
  if (engine.ball.active && engine.ball.vel.z < 0) {
    const t = (-4.29 - engine.ball.pos.z) / engine.ball.vel.z
    if (t > 0) engine.setAim('ai', engine.ball.pos.x + engine.ball.vel.x * t)
  } else engine.setAim('ai', 0)
  if (engine.phase === 'serve' && engine.server === 'ai') engine.action('ai')
  else engine.setCharging('ai', tick % 120 < 95)
}

// ── gauntlet: simulate clearing all 5 rounds with a strong-ish bot ──
let round = 0
while (round < GAUNTLET.length) {
  useStore.setState({ screen: 'game' })
  useStore.getState().startGauntlet(round)
  engine.startGauntlet(round)
  for (let i = 0; i < 60 * 400; i++) {
    playerBot(i, 0.15) // very strong bot
    engine.update(DT)
    if (useStore.getState().screen === 'result') break
  }
  const s = useStore.getState()
  console.log(`[gauntlet r${round + 1} ${GAUNTLET[round].name}]`, JSON.stringify(s.result))
  if (!s.result?.won) break
  round++
}
console.log('[gauntlet] rounds cleared:', round, '| gauntletCleared:', useStore.getState().gauntletCleared)

// ── duel: bot vs bot ──
useStore.setState({ screen: 'game' })
useStore.getState().startDuel()
engine.startDuel()
for (let i = 0; i < 60 * 400; i++) {
  playerBot(i, 0.25)
  aiSideBot(i)
  engine.update(DT)
  if (useStore.getState().screen === 'result') break
}
console.log('[duel]', JSON.stringify(useStore.getState().result), 'score:', JSON.stringify(engine.score))

// ── flow state triggers in quick mode ──
useStore.setState({ screen: 'game' })
useStore.getState().startQuick(0)
engine.startQuick(0)
let flowSeen = false
for (let i = 0; i < 60 * 200; i++) {
  playerBot(i, 0.2)
  engine.update(DT)
  if (engine.flowActive) flowSeen = true
  if (useStore.getState().screen === 'result') break
}
console.log('[flow] activated during long rally:', flowSeen)

console.log('SMOKE3 OK')
