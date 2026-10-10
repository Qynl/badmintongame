import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { engine } from '../game/engine'
import { PLAYER_Z, PADDLE_REACH } from '../game/constants'

const PERFECT_R = 0.32 + 0.1 * 1.1 // ring radius when tta == PERFECT window

export function Reticle() {
  const disc = useRef<THREE.Group>(null)
  const discMat = useRef<THREE.MeshBasicMaterial>(null)
  const discMat2 = useRef<THREE.MeshBasicMaterial>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const sweet = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const d = disc.current
    const r = ring.current
    if (!d || !r) return

    // ── aim reticle on opponent's table ──
    const preview = engine.mode === 'demo' || engine.mode === 'duel' ? null : engine.getAimPreview()
    if (!preview || engine.phase !== 'rally') {
      d.visible = false
    } else {
      d.visible = true
      d.position.set(preview.x, 1.03, preview.z)
      const pulse = 1 + Math.sin(clock.elapsedTime * 7) * 0.1
      d.scale.setScalar(pulse)
      const color = preview.quality === 'gold' ? '#fbbf24' : preview.quality === 'dim' ? '#475569' : '#67e8f9'
      if (discMat.current) {
        discMat.current.color.set(color)
        discMat.current.opacity = preview.quality === 'dim' ? 0.25 : 0.85
      }
      if (discMat2.current) {
        discMat2.current.color.set(color)
        discMat2.current.opacity = preview.quality === 'dim' ? 0.12 : 0.3
      }
      d.rotation.z = clock.elapsedTime * 1.5
    }

    // ── timing ring at the contact plane ──
    const tta = engine.mode === 'demo' || engine.mode === 'duel' ? null : engine.timeToPlayerPlane()
    if (tta === null || engine.mode === 'trick') {
      r.visible = false
      if (sweet.current) sweet.current.visible = false
    } else {
      const cx = engine.predictedPlayerContactX()
      r.visible = true
      r.position.set(cx, 1.45, PLAYER_Z - 0.2)
      const radius = Math.max(0.2, 0.32 + tta * 1.1)
      r.scale.setScalar(radius)
      const inWindow = tta <= 0.12
      if (ringMat.current) {
        ringMat.current.color.set(inWindow ? '#fbbf24' : engine.player.charging ? '#67e8f9' : '#94a3b8')
        ringMat.current.opacity = inWindow ? 1 : 0.55
      }
      if (sweet.current) {
        sweet.current.visible = true
        sweet.current.position.set(cx, 1.45, PLAYER_Z - 0.19)
        sweet.current.scale.setScalar(PERFECT_R)
      }
    }
  })

  return (
    <group>
      {/* aim reticle */}
      <group ref={disc} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.4, 32]} />
          <meshBasicMaterial ref={discMat} color="#67e8f9" transparent opacity={0.85} side={2} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.26, 24]} />
          <meshBasicMaterial ref={discMat2} color="#67e8f9" transparent opacity={0.3} side={2} />
        </mesh>
      </group>

      {/* timing ring (shrinks onto the sweet ring) */}
      <mesh ref={ring} visible={false}>
        <ringGeometry args={[0.92, 1, 40]} />
        <meshBasicMaterial ref={ringMat} color="#94a3b8" transparent opacity={0.55} side={2} toneMapped={false} />
      </mesh>
      {/* sweet-spot marker */}
      <mesh ref={sweet} visible={false}>
        <ringGeometry args={[0.96, 1, 40]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.5} side={2} toneMapped={false} />
      </mesh>
    </group>
  )
}
