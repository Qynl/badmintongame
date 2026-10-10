import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { engine } from '../game/engine'
import { useStore } from '../game/store'
import { SKINS, PLAYER_Z, AI_Z, TABLE, HALF_L, clamp } from '../game/constants'

function PaddleMesh({ side }: { side: 'player' | 'ai' }) {
  const group = useRef<THREE.Group>(null)
  const faceMat = useRef<THREE.MeshStandardMaterial>(null)
  const glow = useRef<THREE.PointLight>(null)
  const skin = useStore((s) => s.skin)

  const skinDef = SKINS[skin]

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const pad = side === 'player' ? engine.player : engine.ai
    const z = side === 'player' ? PLAYER_Z : AI_Z
    const bob = Math.sin(clock.elapsedTime * 2.2 + (side === 'ai' ? 1.7 : 0)) * 0.04

    g.position.x = pad.x
    g.position.y = 1.5 + bob + pad.charge * 0.16
    g.position.z = z

    // swing animation: cool counts down after a hit
    const windUp = -0.22 - pad.charge * 0.55
    g.rotation.x = (side === 'player' ? 1 : -1) * (windUp + (pad.cool > 0 ? 1.05 * (1 - pad.cool / 0.24) : 0))
    g.rotation.z = clamp(-pad.vx * 0.045, -0.5, 0.5)

    const pulse = pad.charge >= 1 ? 1 + Math.sin(clock.elapsedTime * 18) * 0.045 : 1
    g.scale.setScalar(pulse)

    if (glow.current) glow.current.intensity = pad.charge * 14 + 0.6

    // live colors (opponent tier can change between matches)
    const color = side === 'player' ? skinDef.color : engine.tier.color
    if (faceMat.current) {
      faceMat.current.color.set(color)
      faceMat.current.emissive.set(color)
    }
    if (glow.current) glow.current.color.set(side === 'player' ? skinDef.glow : color)
  })

  return (
    <group ref={group}>
      <group rotation={[0, side === 'player' ? Math.PI : 0, 0]}>
        {/* face */}
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.62, 0.8, 0.085]} />
          <meshStandardMaterial
            ref={faceMat}
            color="#22d3ee"
            emissive="#22d3ee"
            emissiveIntensity={0.55}
            roughness={0.25}
            metalness={0.6}
          />
        </mesh>
        {/* rim */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.68, 0.86, 0.05]} />
          <meshStandardMaterial color="#14102e" roughness={0.4} metalness={0.8} />
        </mesh>
        {/* handle */}
        <mesh position={[0, -0.56, 0.06]} rotation={[0.35, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.07, 0.42, 10]} />
          <meshStandardMaterial color="#1e1b4b" roughness={0.5} metalness={0.6} />
        </mesh>
      </group>
      <pointLight ref={glow} position={[0, 0, side === 'player' ? -0.5 : 0.5]} color="#22d3ee" distance={3.4} />
    </group>
  )
}

function ServeGhost() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    const showing =
      engine.phase === 'serve' &&
      engine.mode !== 'demo' &&
      ((engine.server === 'player' && engine.mode !== 'duel') || engine.mode === 'duel')
    if (!showing) {
      m.visible = false
      return
    }
    m.visible = true
    const mat = m.material as THREE.MeshBasicMaterial
    if (engine.server === 'player') {
      const aimX = clamp(engine.player.tx * 0.62, -1.95, 1.95)
      m.position.set(aimX, TABLE.H + 0.03, -(HALF_L - 1.4))
      mat.color.set('#67e8f9')
    } else {
      const aimX = clamp(engine.ai.tx * 0.62, -1.95, 1.95)
      m.position.set(aimX, TABLE.H + 0.03, HALF_L - 1.4)
      mat.color.set('#f0abfc')
    }
    const s = 1 + Math.sin(clock.elapsedTime * 6) * 0.12
    m.scale.set(s, s, 1)
    mat.opacity = 0.4 + Math.sin(clock.elapsedTime * 6) * 0.15
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.22, 0.34, 32]} />
      <meshBasicMaterial color="#67e8f9" transparent opacity={0.4} side={2} />
    </mesh>
  )
}

export function Paddles() {
  return (
    <group>
      <PaddleMesh side="player" />
      <PaddleMesh side="ai" />
      <ServeGhost />
    </group>
  )
}
