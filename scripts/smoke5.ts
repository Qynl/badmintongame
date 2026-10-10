// "Skilled human" bot: aims for corners via edge-contact + counters after AI smashes.
import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'

const DT = 1 / 60

function makeSkilledBot() {
  let aim = 0
  let cornerSign = 1
  return (tick: number) => {
    if (engine.ball.active && engine.ball.vel.z > 0) {
      const t = (4.36 - engine.ball.pos.z) / engine.ball.vel.z
      if (t > 0) {
        const px = engine.ball.pos.x + engine.ball.vel.x * t
        // intercept slightly off-center to hit with the paddle edge → corner shot
        const want = px + cornerSign * 0.62 + (Math.random() - 0.5) * 0.2
        const maxMove = 9.5 * DT
        aim += Math.max(-maxMove, Math.min(maxMove, want - aim))
      }
    } else {
      const maxMove = 9.5 * DT
      aim += Math.max(-maxMove, Math.min(maxMove, -aim))
    }
    engine.setAim('player', aim)
    if (engine.phase === 'serve' && engine.server === 'player') engine.action('player')
    else engine.setCharging('player', true) // always charged: smash everything
    // alternate corners each rally
    if (engine.rally === 0) cornerSign = Math.random() < 0.5 ? -1 : 1
  }
}

for (const tier of [1, 2]) {
  const out: string[] = []
  for (let trial = 0; trial < 4; trial++) {
    useStore.setState({ screen: 'game' })
    useStore.getState().startQuick(tier)
    engine.startQuick(tier)
    const bot = makeSkilledBot()
    for (let i = 0; i < 60 * 300; i++) {
      bot(i)
      engine.update(DT)
      if (useStore.getState().screen === 'result') break
    }
    const s = useStore.getState()
    out.push(`${s.result?.won ? 'W' : s.result ? 'L' : 'T(300s)'} ${engine.score.p}:${engine.score.a}`)
  }
  console.log(`tier ${tier}:`, out.join('  |  '))
}
console.log('SMOKE5 OK')
