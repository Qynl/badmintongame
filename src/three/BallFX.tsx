import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { engine } from '../game/engine'
import { BALL_R } from '../game/constants'

const TRAIL_LEN = 22
const tmpObj = new THREE.Object3D()
const tmpColor = new THREE.Color()

export function BallFX() {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const trail = useRef<THREE.InstancedMesh>(null)
  const history = useMemo(() => [] as THREE.Vector3[], [])
  const cool = useMemo(() => new THREE.Color('#ffffff'), [])
  const hot = useMemo(() => new THREE.Color('#ffb347'), [])

  useEffect(() => {
    const t = trail.current
    if (!t) return
    tmpObj.scale.setScalar(0.0001)
    tmpObj.position.set(0, -50, 0)
    tmpObj.updateMatrix()
    for (let i = 0; i < TRAIL_LEN; i++) t.setMatrixAt(i, tmpObj.matrix)
    t.instanceMatrix.needsUpdate = true
  }, [])

  useFrame(() => {
    const b = engine.ball
    const m = mesh.current
    if (!m) return
    m.visible = b.visible
    m.position.set(b.pos.x, b.pos.y, b.pos.z)
    if (mat.current) {
      tmpColor.copy(cool).lerp(hot, b.heat)
      mat.current.emissive.copy(tmpColor)
      mat.current.emissiveIntensity = 1.6 + b.heat * 2.4
      mat.current.color.copy(tmpColor)
    }
    if (light.current) {
      light.current.intensity = b.visible ? 4 + b.heat * 10 : 0
      light.current.color.copy(tmpColor)
    }

    // trail
    const t = trail.current
    if (!t) return
    if (b.visible && b.active) {
      history.push(new THREE.Vector3(b.pos.x, b.pos.y, b.pos.z))
      if (history.length > TRAIL_LEN) history.shift()
    } else if (history.length) {
      history.shift()
    }
    for (let i = 0; i < TRAIL_LEN; i++) {
      const p = history[history.length - 1 - i]
      if (p && b.visible) {
        const f = 1 - i / TRAIL_LEN
        tmpObj.position.copy(p)
        tmpObj.scale.setScalar(Math.max(0.001, BALL_R * 0.92 * f * f))
      } else {
        tmpObj.scale.setScalar(0.0001)
        tmpObj.position.set(0, -10, 0)
      }
      tmpObj.updateMatrix()
      t.setMatrixAt(i, tmpObj.matrix)
      t.setColorAt(i, tmpColor.copy(cool).lerp(hot, b.heat))
    }
    t.instanceMatrix.needsUpdate = true
    if (t.instanceColor) t.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <mesh ref={mesh} castShadow>
        <sphereGeometry args={[BALL_R, 24, 24]} />
        <meshStandardMaterial ref={mat} color="#ffffff" emissive="#ffffff" emissiveIntensity={1.8} roughness={0.2} metalness={0.1} />
      </mesh>
      <pointLight ref={light} position={[0, 1.5, 2]} distance={5.5} decay={2} />
      <instancedMesh ref={trail} args={[undefined, undefined, TRAIL_LEN]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
