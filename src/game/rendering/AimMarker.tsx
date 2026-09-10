import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Group, Line as ThreeLine, LineBasicMaterial, MeshBasicMaterial } from 'three';
import { useGameStore } from '../../state/gameStore';
import type { GameEngine } from '../GameEngine';

/**
 * Shows the landing point the assisted swing is currently committed to.
 * It only visualizes the aim; nothing here touches the shuttle.
 */
export function AimMarker({ engine }: { engine: GameEngine }) {
  const marker = useRef<Group>(null);
  const ring = useRef<MeshBasicMaterial>(null), core = useRef<MeshBasicMaterial>(null);
  const phase = useGameStore((s) => s.phase), guides = useGameStore((s) => s.settings.guides);
  const assisted = useGameStore((s) => s.settings.controls === 'assisted');
  const line = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
    return new ThreeLine(geometry, new LineBasicMaterial({ color: '#e8d7a8', transparent: true, opacity: 0.3 }));
  }, []);
  useFrame(({ clock }) => {
    const group = marker.current; if (!group) return;
    const visible = assisted && guides && phase === 'playing' && !!engine.input?.locked && engine.aimVisible;
    group.visible = visible; line.visible = visible;
    if (!visible) return;
    const aim = engine.guide.aim;
    const pulse = 1 + Math.sin(clock.elapsedTime * 4.2) * 0.045;
    group.position.set(aim.x, 0.021, aim.z);
    group.scale.setScalar(engine.guide.armed ? pulse * 1.06 : pulse);
    const armed = engine.guide.armed;
    const color = engine.guide.intent === 'smash' ? '#f0b274' : engine.guide.intent === 'drop' ? '#bcd6a2' : '#e8d7a8';
    if (ring.current) { ring.current.color.set(color); ring.current.opacity = armed ? 0.95 : 0.5; }
    if (core.current) { core.current.color.set(color); core.current.opacity = armed ? 0.95 : 0.55; }
    const attribute = line.geometry.getAttribute('position');
    attribute.setXYZ(0, engine.player.position.x, 0.02, engine.player.position.z);
    attribute.setXYZ(1, aim.x, 0.02, aim.z);
    attribute.needsUpdate = true;
    (line.material as LineBasicMaterial).color.set(color);
    (line.material as LineBasicMaterial).opacity = armed ? 0.34 : 0.16;
  });
  return <>
    <primitive object={line}/>
    <group ref={marker} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh><ringGeometry args={[0.3, 0.325, 44]}/><meshBasicMaterial ref={ring} color="#e8d7a8" transparent opacity={0.6} depthWrite={false}/></mesh>
      <mesh><ringGeometry args={[0.115, 0.125, 28]}/><meshBasicMaterial color="#e8d7a8" transparent opacity={0.3} depthWrite={false}/></mesh>
      <mesh><circleGeometry args={[0.03, 14]}/><meshBasicMaterial ref={core} color="#e8d7a8" transparent opacity={0.6} depthWrite={false}/></mesh>
      {([[0.39, 0, 0.11, 0.016], [-0.39, 0, 0.11, 0.016], [0, 0.39, 0.016, 0.11], [0, -0.39, 0.016, 0.11]] as const).map(([x, y, w, h], i) =>
        <mesh key={i} position={[x, y, 0]}><planeGeometry args={[w, h]}/><meshBasicMaterial color="#e8d7a8" transparent opacity={0.45} depthWrite={false}/></mesh>)}
    </group>
  </>;
}
