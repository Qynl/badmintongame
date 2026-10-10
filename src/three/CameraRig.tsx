import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { engine } from '../game/engine'

const lookTarget = new THREE.Vector3()
const desired = new THREE.Vector3()

export function CameraRig() {
  const { camera } = useThree()
  const shakeSeed = useRef(Math.random() * 100)
  const fov = useRef(50)

  useFrame(({ clock }, dt) => {
    dt = Math.min(dt, 0.05)
    const t = clock.elapsedTime
    const mode = engine.mode
    const ball = engine.ball.pos

    if (engine.cinematic) {
      // orbit-ish dramatic angle on match-winning point
      desired.set(4.6, 2.0, 3.2)
      lookTarget.set(ball.x * 0.5, 1.1, ball.z * 0.5)
      fov.current = THREE.MathUtils.damp(fov.current, 42, 3, dt)
    } else if (mode === 'demo') {
      const ang = t * 0.12
      desired.set(Math.sin(ang) * 10.5, 4.6 + Math.sin(t * 0.2) * 0.6, Math.cos(ang) * 10.5)
      lookTarget.set(0, 1.0, 0)
      fov.current = THREE.MathUtils.damp(fov.current, 50, 2, dt)
    } else if (mode === 'duel') {
      // broadcast side angle
      desired.set(8.8, 5.4, 0)
      lookTarget.set(ball.x * 0.25, 0.9, ball.z * 0.15)
      fov.current = THREE.MathUtils.damp(fov.current, 46, 2, dt)
    } else {
      // behind-the-player view with ball tracking
      const bx = THREE.MathUtils.clamp(ball.x * 0.38, -1.6, 1.6)
      desired.set(bx, 3.55 + ball.y * 0.12, 9.3)
      lookTarget.set(ball.x * 0.22, 0.95, ball.z * 0.12)
      const targetFov = engine.flowActive ? 46 : 50
      fov.current = THREE.MathUtils.damp(fov.current, targetFov, 2.5, dt)
    }

    const k = engine.cinematic ? 2.2 : 5.5
    camera.position.x = THREE.MathUtils.damp(camera.position.x, desired.x, k, dt)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desired.y, k, dt)
    camera.position.z = THREE.MathUtils.damp(camera.position.z, desired.z, k, dt)

    // screen shake
    const s = engine.shake
    if (s > 0.001) {
      const seed = shakeSeed.current
      camera.position.x += Math.sin(t * 67 + seed) * 0.055 * s
      camera.position.y += Math.sin(t * 81 + seed * 2) * 0.05 * s
    }

    camera.lookAt(lookTarget)
    const pc = camera as THREE.PerspectiveCamera
    if (Math.abs(pc.fov - fov.current) > 0.01) {
      pc.fov = fov.current
      pc.updateProjectionMatrix()
    }
  })

  return null
}
