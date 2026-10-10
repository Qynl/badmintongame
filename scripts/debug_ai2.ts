import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'

const DT = 1 / 60
useStore.setState({ screen: 'game' })
useStore.getState().startQuick(2)
engine.startQuick(2)

// serve immediately
engine.action('player')

let logged = 0
for (let tick = 0; tick < 60 * 4 && logged < 20; tick++) {
  engine.setCharging('player', false)
  engine.update(DT)
  const b = engine.ball
  if (b.active && b.vel.z < 0 && engine.lastHitter === 'player') {
    logged++
    const e: any = engine
    console.log(
      `t=${(tick / 60).toFixed(2)} ball.z=${b.pos.z.toFixed(2)} x=${b.pos.x.toFixed(2)} vz=${b.vel.z.toFixed(1)} | shotId=${e.shotId} planned=${e.aiPlannedShot} planT=${e.aiPlanT.toFixed(2)} | ai.x=${engine.ai.x.toFixed(2)} ai.tx=${engine.ai.tx.toFixed(2)} | phase=${engine.phase}`
    )
  }
}
