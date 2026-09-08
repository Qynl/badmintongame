import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Group, Shape, ShapeGeometry } from 'three';
import type { GameEngine } from '../GameEngine';
export function ShuttleModel() {
  const feather = useMemo(() => {
    const shape = new Shape(); shape.moveTo(0, 0); shape.quadraticCurveTo(-0.009, 0.036, -0.0085, 0.059); shape.quadraticCurveTo(0, 0.071, 0.0085, 0.059); shape.quadraticCurveTo(0.009, 0.037, 0, 0);
    return new ShapeGeometry(shape, 6);
  }, []);
  return <group>
    <mesh position={[0, -0.006, 0]} castShadow><sphereGeometry args={[0.013, 16, 12]}/><meshStandardMaterial color="#e7deba" roughness={0.92}/></mesh>
    <mesh position={[0, 0.002, 0]}><cylinderGeometry args={[0.013, 0.013, 0.014, 16]}/><meshStandardMaterial color="#f1eee0" roughness={0.85}/></mesh>
    <mesh position={[0, 0.011, 0]}><cylinderGeometry args={[0.014, 0.013, 0.006, 16]}/><meshStandardMaterial color="#385c47" roughness={0.85}/></mesh>
    {Array.from({ length: 16 }, (_, i) => <group key={i} rotation={[0, i * Math.PI / 8, 0]} position={[0, 0.012, 0]}>
      <group position={[0, 0, 0.01]} rotation={[0.31, 0, 0]}>
        <mesh geometry={feather}><meshStandardMaterial color={i % 3 === 0 ? '#e5e4d7' : '#fcfaec'} roughness={0.85} side={DoubleSide}/></mesh>
        <mesh position={[0, 0.03, 0.0004]}><cylinderGeometry args={[0.0004, 0.0008, 0.06, 4]}/><meshStandardMaterial color="#cfcbb4" roughness={1}/></mesh>
      </group>
    </group>)}
    {[0.022, 0.031].map((y) => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.01 + y * 0.32, 0.0007, 4, 24]}/><meshStandardMaterial color="#e6e2cc"/></mesh>)}
  </group>;
}
export function Shuttlecock({ engine }: { engine: GameEngine }) {
  const group = useRef<Group>(null), feathers = useRef<Group>(null);
  useFrame(() => { if (!group.current) return; group.current.visible = engine.shuttle.visible; group.current.position.copy(engine.shuttle.position); group.current.quaternion.copy(engine.shuttle.orientation); if (feathers.current) feathers.current.rotation.y = engine.shuttle.spin; });
  return <group ref={group}><group ref={feathers}><ShuttleModel/></group></group>;
}
