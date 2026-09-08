import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Group, Line as ThreeLine, LineBasicMaterial, MeshBasicMaterial } from 'three';
import type { GameEngine } from '../GameEngine';
import { useGameStore } from '../../state/gameStore';
import { drills, insideTarget } from '../training/Drills';
export function PracticeAids({ engine }: { engine: GameEngine }) {
  const mode = useGameStore((s) => s.mode), settings = useGameStore((s) => s.settings), shot = useGameStore((s) => s.trainingShot);
  const marker = useRef<Group>(null), markerMaterial = useRef<MeshBasicMaterial>(null);
  const lastPointCount = useRef(0);
  const geometry = useMemo(() => { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(new Float32Array(140 * 3), 3)); return g; }, []);
  const line = useMemo(() => new ThreeLine(geometry, new LineBasicMaterial({ color: '#e8bb7f', transparent: true, opacity: 0.5 })), [geometry]);
  useFrame(() => {
    const shortTrail = mode === 'match' && settings.controls === 'assisted' && settings.guides;
    line.visible = ((mode !== 'match' && settings.trajectory) || shortTrail) && engine.shuttle.active;
    line.material.opacity = shortTrail ? 0.26 : 0.5;
    const path = engine.shuttle.path;
    if (line.visible && (path.length !== lastPointCount.current || path.length === 140)) {
      const attr = geometry.getAttribute('position'), start = shortTrail ? Math.max(0, path.length - 10) : 0;
      for (let i = start; i < path.length; i++) attr.setXYZ(i - start, path[i].x, path[i].y, path[i].z);
      attr.needsUpdate = true; geometry.setDrawRange(0, path.length - start); geometry.computeBoundingSphere(); lastPointCount.current = path.length;
    }
    if (marker.current) {
      marker.current.visible = mode !== 'match' && settings.landing && engine.showLanding && engine.shuttle.active;
      marker.current.position.copy(engine.landing);
      if (markerMaterial.current) {
        const inCourt = Math.abs(engine.landing.x) <= 2.61 && Math.abs(engine.landing.z) <= 6.72;
        const onTarget = mode === 'training' && insideTarget(shot, engine.landing.x, engine.landing.z);
        markerMaterial.current.color.set(!inCourt ? '#d3917e' : onTarget ? '#cfe0b4' : '#efd0a1');
      }
    }
  });
  return <>
    <primitive object={line}/>
    <group ref={marker} rotation={[-Math.PI / 2, 0, 0]}><mesh><ringGeometry args={[0.2, 0.22, 40]}/><meshBasicMaterial ref={markerMaterial} color="#efd0a1" transparent opacity={0.8}/></mesh><mesh><circleGeometry args={[0.025, 12]}/><meshBasicMaterial color="#efd0a1"/></mesh></group>
    {mode === 'training' && <TargetZone shot={shot}/>}
  </>;
}
function TargetZone({ shot }: { shot: keyof typeof drills }) {
  const d = drills[shot], width = d.halfWidth * 2, depth = d.maxZ - d.minZ, z = (d.maxZ + d.minZ) * 0.5;
  return <group position={[0, 0.023, z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[width, depth]}/><meshBasicMaterial color="#e7bd83" transparent opacity={0.075} depthWrite={false}/></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh position={[side * width / 2, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.025, depth]}/><meshBasicMaterial color="#e8bd83" transparent opacity={0.62}/></mesh>
      <mesh position={[0, 0.001, side * depth / 2]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[width, 0.025]}/><meshBasicMaterial color="#e8bd83" transparent opacity={0.62}/></mesh>
    </group>)}
    <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.16, 0.175, 32]}/><meshBasicMaterial color="#e8bd83" transparent opacity={0.5}/></mesh>
  </group>;
}
