import { Canvas, useFrame } from '@react-three/fiber'
import { engine } from '../game/engine'
import { Arena } from './Arena'
import { TableMesh } from './TableMesh'
import { Paddles } from './Paddles'
import { BallFX } from './BallFX'
import { ImpactFX } from './ImpactFX'
import { Targets } from './Targets'
import { CameraRig } from './CameraRig'
import { Effects } from './Effects'

/** Drives the fixed-step simulation from the render loop. Must mount first. */
function Loop() {
  useFrame((_, dt) => {
    engine.update(Math.min(dt, 0.1))
  })
  return null
}

export function Scene() {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 50, position: [0, 4.2, 9.6], near: 0.1, far: 120 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#07030f']} />
      <fog attach="fog" args={['#07030f', 18, 46]} />
      <Loop />
      <CameraRig />

      <ambientLight intensity={0.35} color="#a5b4fc" />
      <directionalLight position={[6, 10, 4]} intensity={1.4} color="#e0e7ff" />
      <directionalLight position={[-5, 8, -6]} intensity={0.7} color="#c084fc" />

      <Arena />
      <TableMesh />
      <Targets />
      <Paddles />
      <BallFX />
      <ImpactFX />
      <Effects />
    </Canvas>
  )
}
