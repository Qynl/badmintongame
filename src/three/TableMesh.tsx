import { TABLE, HALF_L, HALF_W, NET_H } from '../game/constants'

export function TableMesh() {
  const edge = '#22d3ee'
  return (
    <group>
      {/* table top */}
      <mesh position={[0, TABLE.H - TABLE.T / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[TABLE.W, TABLE.T, TABLE.L]} />
        <meshStandardMaterial color="#0d1233" roughness={0.35} metalness={0.55} />
      </mesh>

      {/* glowing boundary */}
      {([
        [0, HALF_L, TABLE.W + 0.08, 0.06],
        [0, -HALF_L, TABLE.W + 0.08, 0.06],
      ] as const).map(([x, z, w, d], i) => (
        <mesh key={`e${i}`} position={[x, TABLE.H + 0.008, z]}>
          <boxGeometry args={[w, 0.016, d]} />
          <meshBasicMaterial color={edge} />
        </mesh>
      ))}
      {([HALF_W, -HALF_W] as const).map((x, i) => (
        <mesh key={`s${i}`} position={[x, TABLE.H + 0.008, 0]}>
          <boxGeometry args={[0.06, 0.016, TABLE.L + 0.08]} />
          <meshBasicMaterial color={edge} />
        </mesh>
      ))}

      {/* center line */}
      <mesh position={[0, TABLE.H + 0.007, 0]}>
        <boxGeometry args={[0.035, 0.012, TABLE.L]} />
        <meshBasicMaterial color="#e879f9" transparent opacity={0.8} />
      </mesh>

      {/* table skirt glow */}
      <mesh position={[0, TABLE.H - TABLE.T - 0.02, 0]}>
        <boxGeometry args={[TABLE.W + 0.06, 0.05, TABLE.L + 0.06]} />
        <meshBasicMaterial color="#4c1d95" />
      </mesh>

      {/* legs */}
      {([
        [-HALF_W + 0.35, HALF_L - 0.5],
        [HALF_W - 0.35, HALF_L - 0.5],
        [-HALF_W + 0.35, -HALF_L + 0.5],
        [HALF_W - 0.35, -HALF_L + 0.5],
      ] as const).map(([x, z], i) => (
        <mesh key={`l${i}`} position={[x, (TABLE.H - TABLE.T) / 2, z]}>
          <boxGeometry args={[0.14, TABLE.H - TABLE.T, 0.14]} />
          <meshStandardMaterial color="#11102a" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}

      {/* under-table glow */}
      <pointLight position={[0, TABLE.H - 0.45, 0]} intensity={5} color="#7c3aed" distance={7} />

      {/* net */}
      <group>
        <mesh position={[0, TABLE.H + NET_H / 2, 0]}>
          <planeGeometry args={[TABLE.W + 0.36, NET_H]} />
          <meshStandardMaterial
            color="#cbd5e1"
            transparent
            opacity={0.16}
            side={2}
            roughness={0.9}
          />
        </mesh>
        {/* net mesh lines */}
        {Array.from({ length: 13 }, (_, i) => -1.95 + (i * 3.9) / 12).map((x, i) => (
          <mesh key={`nv${i}`} position={[x * ((TABLE.W + 0.3) / 3.9), TABLE.H + NET_H / 2, 0]}>
            <boxGeometry args={[0.008, NET_H, 0.008]} />
            <meshBasicMaterial color="#94a3b8" transparent opacity={0.35} />
          </mesh>
        ))}
        {[0.33, 0.66, 1].map((f, i) => (
          <mesh key={`nh${i}`} position={[0, TABLE.H + NET_H * f, 0]}>
            <boxGeometry args={[TABLE.W + 0.36, 0.008, 0.008]} />
            <meshBasicMaterial color="#94a3b8" transparent opacity={0.35} />
          </mesh>
        ))}
        {/* top cord */}
        <mesh position={[0, TABLE.H + NET_H + 0.01, 0]}>
          <boxGeometry args={[TABLE.W + 0.38, 0.035, 0.03]} />
          <meshBasicMaterial color="#f472b6" />
        </mesh>
        {/* posts */}
        {[-1, 1].map((s) => (
          <mesh key={`p${s}`} position={[s * (HALF_W + 0.19), TABLE.H + NET_H / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.04, NET_H + 0.04, 8]} />
            <meshStandardMaterial color="#312e81" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
