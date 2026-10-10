import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { engine } from '../game/engine'
import { TABLE } from '../game/constants'

const MAX_TARGETS = 8

export function Targets() {
  const groups = useRef<(THREE.Group | null)[]>([])

  useFrame(({ clock }) => {
    const targets = engine.trick.targets
    for (let i = 0; i < MAX_TARGETS; i++) {
      const g = groups.current[i]
      if (!g) continue
      const t = targets[i]
      if (!t || !t.alive || engine.mode !== 'trick') {
        g.visible = false
        continue
      }
      g.visible = true
      g.position.set(t.x, TABLE.H + 0.025, t.z)
      const pulse = 1 + Math.sin(clock.elapsedTime * 4 + i * 1.3) * 0.08
      g.scale.setScalar(pulse)
      g.rotation.z = clock.elapsedTime * 0.8
    }
    // prune dead targets occasionally
    if (engine.mode === 'trick' && engine.trick.targets.length > MAX_TARGETS) {
      engine.trick.targets = engine.trick.targets.filter((t) => t.alive)
    }
  })

  return (
    <group>
      {Array.from({ length: MAX_TARGETS }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el
          }}
          visible={false}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.38, 0.55, 32]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.95} side={2} toneMapped={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.36, 32]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.22} side={2} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.1, 0.16, 24]} />
            <meshBasicMaterial color="#fde68a" transparent opacity={0.9} side={2} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
