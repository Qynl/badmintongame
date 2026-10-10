import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { engine } from '../game/engine'
import { BALL_R, TABLE, HALF_W, HALF_L } from '../game/constants'

const TRAIL_LEN = 26
const tmpObj = new THREE.Object3D()
const tmpColor = new THREE.Color()
const tmpVec = new THREE.Vector3()

export function BallFX() {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const shadowMat = useRef<THREE.MeshBasicMaterial>(null)
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

    // stretch along velocity / squash on bounce
    if (b.squash > 0) {
      m.rotation.set(0, 0, 0)
      m.scale.set(1 + b.squash * 0.35, 1 - b.squash * 0.45, 1 + b.squash * 0.35)
    } else {
      const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z)
      const stretch = Math.min(0.9, Math.max(0, (speed - 8) / 10))
      if (speed > 0.5 && b.active) {
        tmpVec.set(b.pos.x + b.vel.x, b.pos.y + b.vel.y, b.pos.z + b.vel.z)
        m.lookAt(tmpVec)
        m.scale.set(1 - stretch * 0.25, 1 - stretch * 0.25, 1 + stretch)
      } else {
        m.scale.set(1, 1, 1)
      }
    }

    if (mat.current) {
      tmpColor.copy(cool).lerp(hot, b.heat)
      mat.current.emissive.copy(tmpColor)
      mat.current.emissiveIntensity = 1.7 + b.heat * 2.6
      mat.current.color.copy(tmpColor)
    }
    if (light.current) {
      light.current.position.copy(m.position)
      light.current.intensity = b.visible ? 4 + b.heat * 12 : 0
      light.current.color.copy(tmpColor)
    }

    // blob shadow
    const sh = shadow.current
    if (sh && shadowMat.current) {
      if (!b.visible) {
        sh.visible = false
      } else {
        sh.visible = true
        const overTable = Math.abs(b.pos.x) <= HALF_W + 0.3 && Math.abs(b.pos.z) <= HALF_L + 0.3
        sh.position.set(b.pos.x, overTable ? TABLE.H + 0.015 : 0.02, b.pos.z)
        const h = Math.max(0, b.pos.y - (overTable ? TABLE.H : 0))
        const f = Math.max(0.15, 1 - h / 3.2)
        sh.scale.setScalar(0.8 + h * 0.25)
        shadowMat.current.opacity = 0.4 * f
      }
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
        tmpObj.rotation.set(0, 0, 0)
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
      <pointLight ref={light} distance={6} decay={2} />
      {/* blob shadow */}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[BALL_R * 1.7, 20]} />
        <meshBasicMaterial ref={shadowMat} color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <instancedMesh ref={trail} args={[undefined, undefined, TRAIL_LEN]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}
