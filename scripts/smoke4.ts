// Balance pass: human-like bot (speed-limited aim + noise) vs each tier, 3 trials.
import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'

const DT = 1 / 60

function makeHumanBot(skill: number) {
  let aim = 0
  return (tick: number) => {
    let want = aim
    if (engine.ball.active && engine.ball.vel.z > 0) {
      const t = (4.29 - engine.ball.pos.z) / engine.ball.vel.z
      if (t > 0) want = engine.ball.pos.x + engine.ball.vel.x * t + (Math.random() - 0.5) * skill
    } else {
      want = 0
    }
    // human hand speed limit
    const maxMove = 8.5 * DT
    aim += Math.max(-maxMove, Math.min(maxMove, want - aim))
    engine.setAim('player', aim)
    if (engine.phase === 'serve' && engine.server === 'player') engine.action('player')
    else engine.setCharging('player', tick % 140 < 100)
  }
}

const results: Record<string, string[]> = {}
for (const tier of [0, 1, 2]) {
  results[tier] = []
  for (let trial = 0; trial < 3; trial++) {
    useStore.setState({ screen: 'game' })
    useStore.getState().startQuick(tier)
    engine.startQuick(tier)
    const bot = makeHumanBot(0.45)
    for (let i = 0; i < 60 * 500; i++) {
      bot(i)
      engine.update(DT)
      if (useStore.getState().screen === 'result') break
    }
    const s = useStore.getState()
    results[tier].push(`${s.result?.won ? 'W' : 'L'} ${engine.score.p}:${engine.score.a}`)
  }
}
for (const [tier, rs] of Object.entries(results)) {
  console.log(`tier ${tier}:`, rs.join('  |  '))
}
console.log('SMOKE4 OK')
