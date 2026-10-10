// Headless engine smoke test: run the simulation without a browser.
import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'

const DT = 1 / 60

function run(seconds: number) {
  for (let i = 0; i < seconds * 60; i++) engine.update(DT)
}

// ── 1. demo mode: rallies should keep flowing, no crash ──
engine.startDemo()
let serveCount = 0
let lastPhase = engine.phase
for (let i = 0; i < 60 * 60; i++) {
  engine.update(DT)
  if (engine.phase === 'serve' && lastPhase !== 'serve') serveCount++
  lastPhase = engine.phase
}
console.log(`[demo] 60s simulated, serves cycled: ${serveCount}, ball pos sane:`,
  Math.abs(engine.ball.pos.x) < 30 && engine.ball.pos.y < 30)

// ── 2. quick match: scripted player vs ROOKIE-9 must finish ──
engine.startQuick(0)
let ticks = 0
while (ticks < 60 * 400) {
  ticks++
  if (engine.ball.active && engine.ball.vel.z > 0) {
    const t = (4.29 - engine.ball.pos.z) / engine.ball.vel.z
    if (t > 0) engine.setAim('player', engine.ball.pos.x + engine.ball.vel.x * t)
  } else {
    engine.setAim('player', 0)
  }
  if (engine.phase === 'serve' && engine.server === 'player') engine.action('player')
  else engine.setCharging('player', ticks % 120 < 95)
  engine.update(DT)
  if (useStore.getState().screen === 'result') break
}
const st = useStore.getState()
console.log('[quick] ended at screen:', st.screen, '| result:', JSON.stringify(st.result), '| score', JSON.stringify(engine.score), '| ticks', ticks)

// ── 3. trick mode: targets + timer ──
engine.startTrick()
run(5)
console.log('[trick] targets alive:', engine.trick.targets.filter((t) => t.alive).length, 'timeLeft:', engine.trick.timeLeft.toFixed(1))
for (let i = 0; i < 60 * 70; i++) {
  if (engine.ball.active && engine.ball.vel.z > 0) {
    const t = (4.29 - engine.ball.pos.z) / engine.ball.vel.z
    if (t > 0) engine.setAim('player', engine.ball.pos.x + engine.ball.vel.x * t)
  }
  if (engine.phase === 'serve' && engine.server === 'player') engine.action('player')
  else engine.setCharging('player', ticks % 90 < 60)
  engine.update(DT)
  if (useStore.getState().screen === 'result') break
}
console.log('[trick] end:', JSON.stringify(useStore.getState().result), 'score:', engine.trick.score)

// ── 4. duel mode sanity: two scripted paddles ──
engine.startDuel()
run(20)
console.log('[duel] 20s ok, phase:', engine.phase, 'score:', JSON.stringify(engine.score))

console.log('SMOKE OK')
