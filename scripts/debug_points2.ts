import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'

const DT = 1 / 60

// wrap awardPoint to log reasons
const origAward = (engine as any).awardPoint.bind(engine)
;(engine as any).awardPoint = function (winner: string, label: string) {
  console.log(
    `POINT ${winner === 'player' ? 'YOU ' : 'AI  '} reason="${label}" rally=${this.rally} score-> ${winner === 'player' ? this.score.p + 1 : this.score.p}:${winner === 'player' ? this.score.a : this.score.a + 1} hitter=${this.lastHitter} landed=${this.landedTargetSide}`
  )
  return origAward(winner, label)
}

useStore.setState({ screen: 'game' })
useStore.getState().startQuick(2)
engine.startQuick(2)

let aim = 0
for (let tick = 0; tick < 60 * 240; tick++) {
  let want = 0
  if (engine.ball.active && engine.ball.vel.z > 0) {
    const t = (4.29 - engine.ball.pos.z) / engine.ball.vel.z
    if (t > 0) want = engine.ball.pos.x + engine.ball.vel.x * t + (Math.random() - 0.5) * 0.45
  }
  const maxMove = 8.5 * DT
  aim += Math.max(-maxMove, Math.min(maxMove, want - aim))
  engine.setAim('player', aim)
  if (engine.phase === 'serve' && engine.server === 'player') engine.action('player')
  else engine.setCharging('player', tick % 140 < 100)
  engine.update(DT)
  if (useStore.getState().screen === 'result') break
}
console.log('final:', JSON.stringify(useStore.getState().result))
