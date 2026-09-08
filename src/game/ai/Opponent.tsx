import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, LatheGeometry, Mesh, Vector2, Vector3 } from 'three';
import type { GameEngine } from '../GameEngine';
import { RacketModel } from '../rendering/RacketModel';
import { positionLimb } from '../player/PlayerBody';
function Shoe() {
  return <group><mesh position={[0, 0.06, 0.045]} castShadow scale={[0.074, 0.067, 0.15]}><sphereGeometry args={[1, 16, 10]}/><meshStandardMaterial color="#d9dccb" roughness={0.72}/></mesh><mesh position={[0, 0.025, 0.045]} scale={[0.08, 0.025, 0.16]}><sphereGeometry args={[1, 16, 8]}/><meshStandardMaterial color="#b69c6e" roughness={0.94}/></mesh><mesh position={[0, 0.08, 0.105]} rotation={[-0.5, 0, 0]}><boxGeometry args={[0.076, 0.011, 0.064]}/><meshStandardMaterial color="#344b3c" roughness={0.8}/></mesh></group>;
}
export function Opponent({ engine, menu = false }: { engine: GameEngine; menu?: boolean }) {
  const root = useRef<Group>(null), legs = [useRef<Group>(null), useRef<Group>(null)];
  const racket = useRef<Group>(null), arm = useRef<Mesh>(null), forearm = useRef<Mesh>(null);
  const torso = useMemo(() => new LatheGeometry([new Vector2(0.15, 0), new Vector2(0.17, 0.08), new Vector2(0.2, 0.29), new Vector2(0.23, 0.42), new Vector2(0.19, 0.47), new Vector2(0.078, 0.52)], 20), []);
  const shoulder = new Vector3(0.22, 1.43, 0), elbow = new Vector3(), wrist = new Vector3(), center = new Vector3();
  useFrame(({ clock }) => {
    const ai = engine.opponent; if (root.current) { root.current.position.copy(menu ? new Vector3(-0.6, 0, -3.8) : ai.position); root.current.position.y += Math.sin(menu ? clock.elapsedTime * 1.7 : ai.stride * 2) * 0.012; }
    const stride = menu ? 0 : Math.min(ai.velocity.length() / 3, 1) * 0.46;
    legs.forEach((leg, i) => { if (leg.current) leg.current.rotation.x = Math.sin(ai.stride + i * Math.PI) * stride; });
    center.set(0.47, 1.55, 0.6);
    if (ai.swing > 0 && !menu) center.lerp(ai.contactPoint.clone().sub(ai.position), Math.sin(ai.swing * Math.PI * 0.5));
    if (racket.current) { racket.current.position.copy(center); racket.current.rotation.set(-0.18 + ai.swing * 0.6, 0.12, -0.28); }
    wrist.set(0, -0.53, 0); if (racket.current) wrist.applyQuaternion(racket.current.quaternion); wrist.add(center);
    elbow.set(0.36, 1.09, 0.17).lerp(wrist, 0.24); positionLimb(arm.current, shoulder, elbow); positionLimb(forearm.current, elbow, wrist);
  });
  return <group ref={root}>
    <mesh geometry={torso} position={[0, 0.99, 0]} scale={[1, 1, 0.63]} castShadow><meshStandardMaterial color="#b7c7a5" roughness={0.93}/></mesh>
    {[-1, 1].map((side) => <group key={`sleeve-${side}`} position={[side * 0.218, 1.425, 0]} rotation={[0, 0, side * 0.35]}>
      <mesh position={[0, -0.025, 0]} castShadow><cylinderGeometry args={[0.083, 0.075, 0.17, 20]}/><meshStandardMaterial color="#b7c7a5" roughness={0.95}/></mesh>
      <mesh position={[0, -0.10, 0]}><cylinderGeometry args={[0.077, 0.077, 0.017, 20]}/><meshStandardMaterial color="#354d3e" roughness={0.95}/></mesh>
    </group>)}
    <mesh position={[0, 1.493, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.72, 1]}><torusGeometry args={[0.082, 0.009, 6, 24]}/><meshStandardMaterial color="#354d3e" roughness={0.95}/></mesh>
    <mesh position={[0, 1.365, 0.139]}><boxGeometry args={[0.065, 0.026, 0.004]}/><meshStandardMaterial color="#d7a16e" roughness={1}/></mesh>
    <mesh position={[0, 1.55, 0]}><cylinderGeometry args={[0.066, 0.073, 0.13, 12]}/><meshStandardMaterial color="#b18160" roughness={0.8}/></mesh>
    <mesh position={[0, 1.715, 0.006]} scale={[0.103, 0.133, 0.1]} castShadow><sphereGeometry args={[1, 20, 16]}/><meshStandardMaterial color="#b78868" roughness={0.8}/></mesh>
    <mesh position={[0, 1.78, -0.017]} scale={[0.107, 0.08, 0.096]} castShadow><sphereGeometry args={[1, 20, 12]}/><meshStandardMaterial color="#292c24" roughness={0.95}/></mesh>
    <mesh position={[0, 1.722, 0.1]} scale={[0.019, 0.027, 0.027]}><sphereGeometry args={[1, 12, 8]}/><meshStandardMaterial color="#b88869" roughness={0.8}/></mesh>
    {[-1, 1].map((s) => <group key={s}>
      <mesh position={[s * 0.104, 1.72, 0]} scale={[0.022, 0.033, 0.016]}><sphereGeometry args={[1, 12, 8]}/><meshStandardMaterial color="#b78868" roughness={0.8}/></mesh>
      <mesh position={[s * 0.036, 1.746, 0.095]} scale={[0.018, 0.006, 0.004]}><sphereGeometry args={[1, 8, 6]}/><meshStandardMaterial color="#37362b"/></mesh>
    </group>)}
    {legs.map((ref, i) => <group key={i} ref={ref} position={[i === 0 ? -0.11 : 0.11, 1.02, 0]}>
      <mesh position={[0, -0.13, 0]} castShadow><cylinderGeometry args={[0.112, 0.105, 0.27, 14]}/><meshStandardMaterial color="#27392e" roughness={0.95}/></mesh>
      <mesh position={[0, -0.38, 0]} castShadow><capsuleGeometry args={[0.065, 0.27, 5, 12]}/><meshStandardMaterial color="#b18160" roughness={0.86}/></mesh>
      <mesh position={[0, -0.69, 0.01]} castShadow><cylinderGeometry args={[0.063, 0.04, 0.35, 14]}/><meshStandardMaterial color="#b48765" roughness={0.85}/></mesh>
      <mesh position={[0, -0.82, 0.015]}><cylinderGeometry args={[0.046, 0.04, 0.19, 12]}/><meshStandardMaterial color="#d6d8c8" roughness={1}/></mesh>
      <group position={[0, -1.02, 0]}><Shoe/></group>
    </group>)}
    <mesh ref={arm} castShadow><cylinderGeometry args={[0.066, 0.05, 1, 12]}/><meshStandardMaterial color="#b18160" roughness={0.85}/></mesh>
    <mesh ref={forearm} castShadow><cylinderGeometry args={[0.048, 0.029, 1, 12]}/><meshStandardMaterial color="#b18160" roughness={0.85}/></mesh>
    <group position={[-0.24, 1.43, 0]} rotation={[-0.32, 0, -0.15]}><mesh position={[0, -0.24, 0]} castShadow><capsuleGeometry args={[0.044, 0.43, 5, 12]}/><meshStandardMaterial color="#b18160" roughness={0.85}/></mesh><mesh position={[0, -0.48, 0]}><sphereGeometry args={[0.038, 12, 8]}/><meshStandardMaterial color="#b18160" roughness={0.8}/></mesh></group>
    <group ref={racket}><RacketModel color="#b5c6ae"/><mesh position={[0, -0.52, 0.02]}><capsuleGeometry args={[0.029, 0.046, 5, 10]}/><meshStandardMaterial color="#b18160" roughness={0.8}/></mesh></group>
  </group>;
}
