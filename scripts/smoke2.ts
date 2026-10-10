// Second pass: trick mode correctness + AI competitiveness.
import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'

const DT = 1 / 60

function scriptedPlayerTick(tick: number, noise: number) {
  if (engine.ball.active && engine.ball.vel.z > 0) {
    const t = (4.29 - engine.ball.pos.z) / engine.ball.vel.z
    if (t > 0) {
      const px = engine.ball.pos.x + engine.ball.vel.x * t + (Math.random() - 0.5) * noise
      engine.setAim('player', px)
    }
  }
  if (engine.phase === 'serve' && engine.server === 'player') engine.action('player')
  else engine.setCharging('player', tick % 120 < 95)
}

function playMatch(tier: number | null, maxSeconds = 400): { result: any; bestRally: number } {
  useStore.setState({ screen: 'game' })
  if (tier === null) {
    useStore.getState().startTrick()
    engine.startTrick()
  } else {
    useStore.getState().startQuick(tier)
    engine.startQuick(tier)
  }
  for (let i = 0; i < 60 * maxSeconds; i++) {
    scriptedPlayerTick(i, tier === 2 ? 0.55 : 0.35)
    engine.update(DT)
    if (useStore.getState().screen === 'result') break
  }
  const s = useStore.getState()
  return { result: s.result, bestRally: s.bestRally }
}

// trick mode
{
  let lastScore = 0
  let hits = 0
  useStore.setState({ screen: 'game' })
  useStore.getState().startTrick()
  engine.startTrick()
  for (let i = 0; i < 60 * 75; i++) {
    scriptedPlayerTick(i, 0.3)
    engine.update(DT)
    if (engine.trick.score > lastScore) {
      hits++
      lastScore = engine.trick.score
    }
    if (useStore.getState().screen === 'result') break
  }
  console.log('[trick] result:', JSON.stringify(useStore.getState().result), '| scoring returns:', hits, '| timeLeft:', engine.trick.timeLeft.toFixed(1))
}

for (const tier of [0, 1, 2]) {
  const { result, bestRally } = playMatch(tier)
  console.log(`[tier ${tier}]`, JSON.stringify(result), '| best rally:', bestRally)
}
console.log('SMOKE2 OK')
