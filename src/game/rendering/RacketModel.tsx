import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, TubeGeometry, Vector3 } from 'three';
export function RacketModel({ color = '#d98d57', vibration }: { color?: string; vibration?: () => number }) {
  const frame = useMemo(() => {
    const points = Array.from({ length: 65 }, (_, i) => { const a = i / 64 * Math.PI * 2; return new Vector3(Math.cos(a) * 0.145, Math.sin(a) * 0.195, 0); });
    return new TubeGeometry(new CatmullRomCurve3(points, true), 96, 0.008, 6, true);
  }, []);
  const strings = useMemo(() => {
    const vertices: number[] = [];
    const string = (ax: number, ay: number, bx: number, by: number) => { const mx = (ax + bx) / 2, my = (ay + by) / 2; vertices.push(ax, ay, 0, mx, my, 0, mx, my, 0, bx, by, 0); };
    for (let x = -0.132; x <= 0.134; x += 0.0132) { const y = 0.184 * Math.sqrt(1 - (x / 0.143) ** 2); string(x, -y, x, y); }
    for (let y = -0.17; y <= 0.18; y += 0.0127) { const x = 0.137 * Math.sqrt(1 - (y / 0.191) ** 2); string(-x, y, x, y); }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(vertices, 3)); return g;
  }, []);
  useFrame(({ clock }) => {
    if (!vibration) return;
    const amplitude = vibration() * 0.002, position = strings.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i);
      const envelope = Math.max(0, 1 - (x / 0.145) ** 2 - (y / 0.195) ** 2);
      position.setZ(i, Math.sin(clock.elapsedTime * 145 + x * 12) * amplitude * envelope);
    }
    position.needsUpdate = true;
  });
  return <group>
    <mesh geometry={frame} castShadow><meshStandardMaterial color="#222c2b" metalness={0.7} roughness={0.25}/></mesh>
    <mesh geometry={frame} scale={[1.017, 1.015, 0.6]}><meshStandardMaterial color={color} metalness={0.65} roughness={0.26}/></mesh>
    <lineSegments geometry={strings}><lineBasicMaterial color="#e0e1c7" transparent opacity={0.72}/></lineSegments>
    <mesh position={[0, -0.328, 0]} castShadow><cylinderGeometry args={[0.004, 0.006, 0.285, 10]}/><meshStandardMaterial color="#464c45" metalness={0.75} roughness={0.2}/></mesh>
    <mesh position={[0, -0.182, 0]}><sphereGeometry args={[0.017, 12, 8]}/><meshStandardMaterial color="#bdb7a5" metalness={0.75} roughness={0.25}/></mesh>
    <mesh position={[0, -0.517, 0]} castShadow><cylinderGeometry args={[0.014, 0.017, 0.135, 12]}/><meshStandardMaterial color="#d6d4bd" roughness={0.95}/></mesh>
    {Array.from({ length: 10 }, (_, i) => <mesh key={i} position={[0, -0.463 - i * 0.012, 0]} rotation={[0.15, 0, 0]}><torusGeometry args={[0.015, 0.0009, 4, 12]}/><meshStandardMaterial color="#8b907f" roughness={1}/></mesh>)}
    <mesh position={[0, -0.591, 0]}><cylinderGeometry args={[0.018, 0.018, 0.012, 12]}/><meshStandardMaterial color="#c67743" roughness={0.5}/></mesh>
  </group>;
}
