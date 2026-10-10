import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'
import { AI_Z } from '../src/game/constants'

const DT = 1 / 60
useStore.setState({ screen: 'game' })
useStore.getState().startQuick(2)
engine.startQuick(2)

let aim = 0
let logged = 0
for (let tick = 0; tick < 60 * 90; tick++) {
  let want = 0
  if (engine.ball.active && engine.ball.vel.z > 0) {
    const t = (4.36 - engine.ball.pos.z) / engine.ball.vel.z
    if (t > 0) want = engine.ball.pos.x + engine.ball.vel.x * t + (Math.random() - 0.5) * 0.95
  }
  const maxMove = 6.2 * DT
  aim += Math.max(-maxMove, Math.min(maxMove, want - aim))
  engine.setAim('player', aim)
  if (engine.phase === 'serve' && engine.server === 'player') engine.action('player')
  else engine.setCharging('player', tick % 140 < 100)

  const prevZ = engine.ball.pos.z
  engine.update(DT)

  if (
    engine.ball.active &&
    engine.ball.vel.z < 0 &&
    prevZ > AI_Z + 0.26 &&
    engine.ball.pos.z <= AI_Z + 0.26 &&
    logged < 14
  ) {
    logged++
    console.log(
      `AI cross: ball.x=${engine.ball.pos.x.toFixed(2)} y=${engine.ball.pos.y.toFixed(2)} | ai.x=${engine.ai.x.toFixed(2)} dx=${(engine.ball.pos.x - engine.ai.x).toFixed(2)} | rally=${engine.rally} hitter=${engine.lastHitter}`
    )
  }
  if (useStore.getState().screen === 'result') break
}
