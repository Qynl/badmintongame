import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'

const DT = 1 / 60
useStore.setState({ screen: 'game' })
useStore.getState().startQuick(2)
engine.startQuick(2)

// wrap stepBall plane crossing via monkey-patch through public fields: just log each frame
let logged = 0
for (let i = 0; i < 60 * 30; i++) {
  const prevZ = engine.ball.pos.z
  // perfect player
  if (engine.ball.active && engine.ball.vel.z > 0) {
    const t = (4.29 - engine.ball.pos.z) / engine.ball.vel.z
    if (t > 0) engine.setAim('player', engine.ball.pos.x + engine.ball.vel.x * t)
  } else engine.setAim('player', 0)
  if (engine.phase === 'serve' && engine.server === 'player') engine.action('player')
  else engine.setCharging('player', i % 120 < 95)

  engine.update(DT)

  if (engine.ball.active && prevZ > -4.29 && engine.ball.pos.z <= -4.29 && engine.ball.vel.z < 0 && logged < 6) {
    logged++
    console.log(
      `cross #${logged}: ball.x=${engine.ball.pos.x.toFixed(2)} y=${engine.ball.pos.y.toFixed(2)} | ai.x=${engine.ai.x.toFixed(2)} ai.tx=${engine.ai.tx.toFixed(2)} | lastHitter=${engine.lastHitter} shotId=${(engine as any).shotId} planned=${(engine as any).aiPlannedShot} rally=${engine.rally}`
    )
  }
  if (useStore.getState().screen === 'result') break
}
console.log('score:', JSON.stringify(engine.score), 'phase:', engine.phase)
