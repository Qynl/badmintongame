import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PILLARS: { x: number; z: number; h: number; w: number }[] = []
{
  let seed = 1337
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + rnd() * 0.4
    const r = 15 + rnd() * 10
    PILLARS.push({
      x: Math.sin(ang) * r,
      z: Math.cos(ang) * r,
      h: 2.5 + rnd() * 6,
      w: 0.5 + rnd() * 1.2,
    })
  }
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
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color="#0a0618" roughness={0.9} metalness={0.2} />
      </mesh>
      <gridHelper args={[80, 80, '#4c1d95', '#1b1040']} position={[0, 0.001, 0]} />

      {/* glow ring around the court */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[7.4, 7.55, 64]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[9.8, 9.86, 64]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.22} />
      </mesh>

      {/* distant pillars */}
      {PILLARS.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, p.h / 2, 0]}>
            <boxGeometry args={[p.w, p.h, p.w]} />
            <meshStandardMaterial color="#0c0820" roughness={0.7} metalness={0.4} />
          </mesh>
          <mesh position={[0, p.h + 0.05, 0]}>
            <boxGeometry args={[p.w * 1.15, 0.1, p.w * 1.15]} />
            <meshBasicMaterial color={i % 3 === 0 ? '#f472b6' : i % 3 === 1 ? '#22d3ee' : '#a78bfa'} />
          </mesh>
        </group>
      ))}

      {/* synthwave sun */}
      <group position={[0, 7.2, -30]}>
        <mesh>
          <circleGeometry args={[6.5, 48]} />
          <meshBasicMaterial color="#f43f5e" transparent opacity={0.85} />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <circleGeometry args={[5.2, 48]} />
          <meshBasicMaterial color="#fb923c" transparent opacity={0.55} />
        </mesh>
        {/* horizontal slats */}
        {[-2.6, -1.5, -0.6, 0.2, 0.9].map((y, i) => (
          <mesh key={i} position={[0, y, 0.12]}>
            <planeGeometry args={[14, 0.22 + i * 0.05]} />
            <meshBasicMaterial color="#07030f" />
          </mesh>
        ))}
      </group>

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
