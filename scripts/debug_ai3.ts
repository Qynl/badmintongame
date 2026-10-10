import { engine } from '../src/game/engine'
import { useStore } from '../src/game/store'

const DT = 1 / 60
useStore.setState({ screen: 'game' })
useStore.getState().startQuick(2)
engine.startQuick(2)

// aim wide right, wait, then serve
engine.setAim('player', 2.4)
for (let i = 0; i < 30; i++) engine.update(DT)
engine.action('player') // serve

let logged = 0
for (let tick = 0; tick < 60 * 4 && logged < 22; tick++) {
  engine.update(DT)
  const b = engine.ball
  if (b.active && b.vel.z < 0 && engine.lastHitter === 'player') {
    logged++
    const e: any = engine
    const pred = (engine as any).predictFor(-1)
    console.log(
      `t=${(tick / 60).toFixed(2)} ball.x=${b.pos.x.toFixed(2)} z=${b.pos.z.toFixed(2)} vx=${b.vel.x.toFixed(1)} vz=${b.vel.z.toFixed(1)} curveH=${b.curveH.toFixed(2)} | pred=${pred.toFixed(2)} ai.x=${engine.ai.x.toFixed(2)} ai.tx=${engine.ai.tx.toFixed(2)} planned=${e.aiPlannedShot}/${e.shotId}`
    )
  }
}
