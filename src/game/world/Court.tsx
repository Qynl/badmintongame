import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group } from 'three';
import { sportsTexture, woodTexture, labelTexture } from './materials';
import { netHeight } from '../physics/NetCollision';
import type { GameEngine } from '../GameEngine';
function Line({ x = 0, z = 0, w = 0.04, l = 13.4 }: { x?: number; z?: number; w?: number; l?: number }) {
  return <mesh position={[x, 0.018, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[w, l]}/><meshStandardMaterial color="#edece0" roughness={0.74}/></mesh>;
}
export function Court({ engine }: { engine: GameEngine }) {
  const net = useRef<Group>(null);
  const floor = useMemo(woodTexture, []), surface = useMemo(sportsTexture, []);
  const brand = useMemo(() => labelTexture('F E A T H E R', '#adbc9e', '#25594f'), []);
  const netGeometry = useMemo(() => {
    const vertices: number[] = [];
    for (let x = -3.05; x <= 3.06; x += 0.035) vertices.push(x, 0.76 + netHeight(x) - 1.524, 0, x, netHeight(x), 0);
    for (let y = 0.76; y < 1.52; y += 0.035) for (let x = -3.05; x < 3.04; x += 0.2) { const end = Math.min(3.05, x + 0.2); vertices.push(x, y + netHeight(x) - 1.524, 0, end, y + netHeight(end) - 1.524, 0); }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(vertices, 3)); return g;
  }, []);
  const tape = useMemo(() => {
    const geometry = new BoxGeometry(6.16, 0.065, 0.018, 64, 1, 1), position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) + netHeight(position.getX(i)) - 0.0325);
    geometry.computeVertexNormals(); return geometry;
  }, []);
  useFrame(() => { if (net.current) net.current.rotation.x = Math.sin(engine.time * 21) * engine.netMotion * 0.05; });
  return <group>
    <mesh position={[0, -0.09, 0]} receiveShadow><boxGeometry args={[26, 0.16, 34]}/><meshStandardMaterial map={floor} roughness={0.38} metalness={0.06}/></mesh>
    <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[8.1, 15.6]}/><meshStandardMaterial color="#367967" map={surface} roughness={0.72} metalness={0.03}/></mesh>
    {[-3.05, -2.59, 2.59, 3.05].map((x) => <Line key={x} x={x}/>)}
    {[-6.7, -5.94, -1.98, 1.98, 5.94, 6.7].map((z) => <Line key={z} z={z} w={6.1} l={0.04}/>)}
    <Line z={-4.34} l={4.72}/><Line z={4.34} l={4.72}/>
    {[-2.7, -1.35, 0, 1.35, 2.7].map((x) => <mesh key={x} position={[x, 0.007, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.006, 15.6]}/><meshStandardMaterial color="#346c5c" transparent opacity={0.4}/></mesh>)}
    {[-1, 1].map((side) => <mesh key={side} position={[0, 0.014, side * 7.33]} rotation={[-Math.PI / 2, 0, side < 0 ? 0 : Math.PI]}><planeGeometry args={[2.2, 0.43]}/><meshStandardMaterial map={brand} roughness={0.8}/></mesh>)}
    <group ref={net}>
      <lineSegments geometry={netGeometry}><lineBasicMaterial color="#514f3f" transparent opacity={0.74}/></lineSegments>
      <mesh geometry={tape} castShadow><meshStandardMaterial color="#e8e7d8" roughness={0.85}/></mesh>
      <mesh position={[0, 0.765, 0]}><boxGeometry args={[6.1, 0.016, 0.012]}/><meshStandardMaterial color="#8a8a78"/></mesh>
    </group>
    {[-3.08, 3.08].map((x) => <group key={x} position={[x, 0, 0]}>
      <mesh position={[0, 0.79, 0]} castShadow><cylinderGeometry args={[0.035, 0.042, 1.58, 16]}/><meshStandardMaterial color="#b4b5a8" metalness={0.8} roughness={0.27}/></mesh>
      <mesh position={[0, 0.08, 0]} castShadow><boxGeometry args={[0.34, 0.15, 0.42]}/><meshStandardMaterial color="#28352f" metalness={0.5} roughness={0.4}/></mesh>
      <mesh position={[0, 1.565, 0]}><sphereGeometry args={[0.043, 12, 8]}/><meshStandardMaterial color="#d0d1c5" metalness={0.7} roughness={0.25}/></mesh>
    </group>)}
  </group>;
}
