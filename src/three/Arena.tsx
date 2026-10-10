import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { engine } from '../game/engine'

const CROWD_N = 240
const crowdBase = new Float32Array(CROWD_N * 3)
const crowdPhase = new Float32Array(CROWD_N)
{
  for (let i = 0; i < CROWD_N; i++) {
    const ang = Math.random() * Math.PI * 2
    const r = 11 + Math.random() * 13
    crowdBase[i * 3] = Math.sin(ang) * r
    crowdBase[i * 3 + 1] = 0.8 + Math.random() * 6.5
    crowdBase[i * 3 + 2] = Math.cos(ang) * r
    crowdPhase[i] = Math.random() * Math.PI * 2
  }
}

const tmpObj = new THREE.Object3D()
const tmpColor = new THREE.Color()
const CROWD_COLORS = ['#22d3ee', '#e879f9', '#a78bfa', '#f472b6', '#818cf8']

function Crowd() {
  const inst = useRef<THREE.InstancedMesh>(null)

  const colorsSet = useRef(false)
  useFrame(({ clock }) => {
    const m = inst.current
    if (!m) return
    if (!colorsSet.current) {
      for (let i = 0; i < CROWD_N; i++) {
        m.setColorAt(i, tmpColor.set(CROWD_COLORS[i % CROWD_COLORS.length]))
      }
      colorsSet.current = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    const t = clock.elapsedTime
    const energy = engine.hitPulse * 0.9 + Math.min(engine.rally / 12, 0.6)
    for (let i = 0; i < CROWD_N; i++) {
      const bounce = Math.max(0, Math.sin(t * (2.2 + (i % 5) * 0.3) + crowdPhase[i])) * (0.15 + energy * 0.8)
      tmpObj.position.set(crowdBase[i * 3], crowdBase[i * 3 + 1] + bounce, crowdBase[i * 3 + 2])
      const s = 0.09 + (i % 3) * 0.03 + energy * 0.05 * Math.sin(t * 8 + crowdPhase[i])
      tmpObj.scale.setScalar(Math.max(0.03, s))
      tmpObj.updateMatrix()
      m.setMatrixAt(i, tmpObj.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={inst} args={[undefined, undefined, CROWD_N]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  )
}

const SHARD_N = 46
const shardBase = new Float32Array(SHARD_N * 4) // radius, height, phase, speed
for (let i = 0; i < SHARD_N; i++) {
  shardBase[i * 4] = 8 + Math.random() * 8
  shardBase[i * 4 + 1] = 1.5 + Math.random() * 6
  shardBase[i * 4 + 2] = Math.random() * Math.PI * 2
  shardBase[i * 4 + 3] = (0.04 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1)
}
const shardTmp = new THREE.Object3D()

function Shards() {
  const inst = useRef<THREE.InstancedMesh>(null)
  useFrame(({ clock }) => {
    const m = inst.current
    if (!m) return
    const t = clock.elapsedTime
    for (let i = 0; i < SHARD_N; i++) {
      const r = shardBase[i * 4]
      const h = shardBase[i * 4 + 1]
      const ph = shardBase[i * 4 + 2] + t * shardBase[i * 4 + 3]
      shardTmp.position.set(Math.sin(ph) * r, h + Math.sin(t * 0.7 + i) * 0.3, Math.cos(ph) * r)
      shardTmp.rotation.set(t * 0.3 + i, t * 0.5 + i * 2, 0)
      shardTmp.scale.setScalar(0.1 + (i % 4) * 0.05)
      shardTmp.updateMatrix()
      m.setMatrixAt(i, shardTmp.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, SHARD_N]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#1e1b4b" emissive="#7c3aed" emissiveIntensity={0.5} roughness={0.3} metalness={0.8} />
    </instancedMesh>
  )
}

function SpotlightTower({ x, z, color, lean }: { x: number; z: number; color: string; lean: number }) {
  const beam = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (beam.current) {
      beam.current.rotation.z = lean + Math.sin(clock.elapsedTime * 0.6 + x) * 0.05
      beam.current.rotation.x = Math.cos(clock.elapsedTime * 0.5 + z) * 0.04
    }
  })
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3.2, 0]}>
        <cylinderGeometry args={[0.09, 0.16, 6.4, 8]} />
        <meshStandardMaterial color="#0f0d28" roughness={0.5} metalness={0.7} />
      </mesh>
      <mesh position={[0, 6.4, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 6.2, 0]} intensity={14} color={color} distance={14} />
      <group ref={beam} position={[0, 6.3, 0]} rotation={[0, Math.atan2(-x, -z), 0]}>
        <group rotation={[-0.62, 0, 0]}>
          <mesh position={[0, -3.4, 0]}>
            <coneGeometry args={[2.4, 7.2, 24, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.05} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -3.4, 0]}>
            <coneGeometry args={[1.1, 7.2, 20, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.05} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function LaserPerimeter() {
  const mats = useRef<THREE.MeshBasicMaterial[]>([])
  useFrame(() => {
    const glow = 0.35 + engine.hitPulse * 0.65
    for (const m of mats.current) {
      if (!m) continue
      m.opacity = glow * (m.userData.base as number)
    }
  })
  const reg = (el: THREE.MeshBasicMaterial | null, i: number, base: number) => {
    if (el) {
      el.userData.base = base
      mats.current[i] = el
    }
  }
  const W = 7.6
  const L = 8.6
  return (
    <group>
      {([
        [0, 0.06, L, W * 2, 0.03, 0],
        [0, 0.06, -L, W * 2, 0.03, 1],
        [W, 0.06, 0, 0.03, L * 2, 2],
        [-W, 0.06, 0, 0.03, L * 2, 3],
      ] as const).map(([x, y, z, w, d, i]) => (
        <mesh key={`lf${i}`} position={[x, y, z]}>
          <boxGeometry args={[w, 0.035, d]} />
          <meshBasicMaterial ref={(el) => reg(el, i, 0.5)} color="#7c3aed" transparent opacity={0.3} toneMapped={false} />
        </mesh>
      ))}
      {([
        [W, L],
        [-W, L],
        [W, -L],
        [-W, -L],
      ] as const).map(([x, z], i) => (
        <mesh key={`cv${i}`} position={[x, 1.1, z]}>
          <boxGeometry args={[0.04, 2.2, 0.04]} />
          <meshBasicMaterial ref={(el) => reg(el, i + 4, 0.8)} color={i % 2 ? '#e879f9' : '#22d3ee'} transparent opacity={0.5} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

export function Arena() {
  const dust = useRef<THREE.Points>(null)

  const dustGeo = useMemo(() => {
    const n = 260
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 34
      pos[i * 3 + 1] = Math.random() * 9
      pos[i * 3 + 2] = (Math.random() - 0.5) * 34
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])

  useFrame(({ clock }) => {
    if (dust.current) {
      dust.current.rotation.y = clock.elapsedTime * 0.014
      dust.current.position.y = Math.sin(clock.elapsedTime * 0.3) * 0.25
    }
  })

  return (
    <group>
      {/* reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[90, 90]} />
        <MeshReflectorMaterial
          blur={[220, 90]}
          resolution={1024}
          mixBlur={0.92}
          mixStrength={1.4}
          roughness={0.75}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#070417"
          metalness={0.55}
          mirror={0.45}
        />
      </mesh>
      <gridHelper args={[80, 80, '#4c1d95', '#180d38']} position={[0, 0.001, 0]} />

      {/* glow rings around the court */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[7.4, 7.55, 64]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[9.8, 9.86, 64]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.22} toneMapped={false} />
      </mesh>

      {/* court dressing */}
      <SpotlightTower x={-6.8} z={7.8} color="#22d3ee" lean={0.06} />
      <SpotlightTower x={6.8} z={7.8} color="#e879f9" lean={-0.06} />
      <SpotlightTower x={-6.8} z={-7.8} color="#e879f9" lean={0.06} />
      <SpotlightTower x={6.8} z={-7.8} color="#22d3ee" lean={-0.06} />
      <LaserPerimeter />
      <Shards />

      {/* crowd of light orbs */}
      <Crowd />

      {/* floating dust */}
      <points ref={dust} geometry={dustGeo}>
        <pointsMaterial color="#8b7ff5" size={0.05} transparent opacity={0.5} sizeAttenuation />
      </points>

      {/* colored rim lights */}
      <pointLight position={[-9, 5, 6]} intensity={26} color="#22d3ee" distance={26} />
      <pointLight position={[9, 5, -6]} intensity={26} color="#e879f9" distance={26} />
      <pointLight position={[0, 6.5, 0]} intensity={30} color="#7c3aed" distance={24} />
    </group>
  )
}
