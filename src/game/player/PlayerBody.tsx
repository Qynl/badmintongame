import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, Vector3 } from 'three';
import type { GameEngine } from '../GameEngine';
import { forearmGeometry, upperArmGeometry, skinTexture } from './anatomy';
import { RacketModel } from '../rendering/RacketModel';
const UP = new Vector3(0, 1, 0);
export function positionLimb(mesh: Mesh | null, a: Vector3, b: Vector3, width = 1) {
  if (!mesh) return; mesh.position.addVectors(a, b).multiplyScalar(0.5); mesh.scale.set(width, a.distanceTo(b), width); mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
}
function Hand({ left = false }: { left?: boolean }) {
  const pores = useMemo(skinTexture, []);
  return <group scale={[left ? -1 : 1, 1, 1]}>
    <mesh position={[0.010, 0, 0.021]} scale={[0.032, 0.052, 0.021]} castShadow><sphereGeometry args={[1, 24, 18]}/><meshStandardMaterial color="#ae8067" roughness={0.71} bumpMap={pores} bumpScale={0.00035}/></mesh>
    {[0, 1, 2, 3].map((i) => <group key={i} position={[-0.01, 0.035 - i * 0.02, -0.003]} rotation={[0, 0.2, 0]}>
      <mesh position={[-0.012, 0, -0.01]} rotation={[0, 0, Math.PI / 2]}><capsuleGeometry args={[0.0085, 0.024, 6, 12]}/><meshStandardMaterial color="#b5876d" roughness={0.8}/></mesh>
      <mesh position={[-0.031, 0, 0.001]} rotation={[0.4, 0, -0.3]}><capsuleGeometry args={[0.0075, 0.018, 6, 12]}/><meshStandardMaterial color="#b98a70" roughness={0.75}/></mesh>
      <mesh position={[-0.034, 0.001, 0.009]} scale={[0.0045, 0.006, 0.0015]}><sphereGeometry args={[1, 10, 6]}/><meshStandardMaterial color="#c79e86" roughness={0.53}/></mesh>
      <mesh position={[-0.012, 0, 0.022]} scale={[0.009, 0.009, 0.005]}><sphereGeometry args={[1, 10, 8]}/><meshStandardMaterial color="#b5876d" roughness={0.75}/></mesh>
    </group>)}
    <mesh position={[0.012, 0.034, -0.026]} rotation={[0.6, 0, 0.6]}><capsuleGeometry args={[0.012, 0.041, 5, 10]}/><meshStandardMaterial color="#b98a70" roughness={0.8}/></mesh>
  </group>;
}
export function PlayerBody({ engine }: { engine: GameEngine }) {
  const root = useRef<Group>(null), racket = useRef<Group>(null), left = useRef<Group>(null);
  const forearm = useRef<Mesh>(null), upperArm = useRef<Mesh>(null), sleeve = useRef<Mesh>(null), wristband = useRef<Mesh>(null);
  const shoulder = new Vector3(), elbow = new Vector3();
  const forearmShape = useMemo(forearmGeometry, []), upperArmShape = useMemo(upperArmGeometry, []), pores = useMemo(skinTexture, []);
  useFrame(() => {
    const p = engine.player, r = engine.racket;
    if (root.current) root.current.visible = !!engine.input?.locked;
    if (racket.current) { racket.current.position.copy(r.center); racket.current.quaternion.copy(r.rotation); racket.current.rotateY(Math.sin(engine.time * 130) * r.vibration * 0.013); }
    shoulder.set(0.25, -0.36, 0.1).applyQuaternion(p.rotation).add(p.head);
    elbow.set(0.47 + r.gesture.x * 0.12, -0.6 + r.gesture.y * 0.18, -0.28).applyQuaternion(p.rotation).add(p.head);
    positionLimb(forearm.current, elbow, r.wrist);
    positionLimb(wristband.current, r.wrist.clone().lerp(elbow, 0.12), r.wrist.clone().lerp(elbow, 0.26));
    positionLimb(upperArm.current, shoulder, elbow);
    const sleeveEnd = shoulder.clone().lerp(elbow, 0.38); positionLimb(sleeve.current, shoulder, sleeveEnd);
    if (left.current) { left.current.position.set(-0.24, -0.34 + Math.sin(engine.time * 2) * 0.008, -0.62).applyQuaternion(p.rotation).add(p.head); left.current.quaternion.copy(p.rotation); left.current.rotateZ(0.4); }
  });
  return <group ref={root}>
    <mesh ref={forearm} geometry={forearmShape} castShadow><meshStandardMaterial color="#ae8067" roughness={0.75} bumpMap={pores} bumpScale={0.0004}/></mesh>
    <mesh ref={upperArm} geometry={upperArmShape} castShadow><meshStandardMaterial color="#ab7b61" roughness={0.79} bumpMap={pores} bumpScale={0.0004}/></mesh>
    <mesh ref={sleeve}><cylinderGeometry args={[0.073, 0.078, 1, 16]}/><meshStandardMaterial color="#d5d7c6" roughness={0.95}/></mesh>
    <mesh ref={wristband}><cylinderGeometry args={[0.037, 0.039, 1, 16]}/><meshStandardMaterial color="#d2d3bc" roughness={1}/></mesh>
    <group ref={racket}>
      <RacketModel vibration={() => engine.racket.vibration}/>
      <group position={[0, -0.52, 0]}><Hand/></group>
    </group>
    <group ref={left} rotation={[0, 0, 0.5]}><Hand left/><mesh position={[0, -0.18, 0.03]} geometry={forearmShape} scale={[0.83, 0.32, 0.88]}><meshStandardMaterial color="#ae8067" roughness={0.75} bumpMap={pores} bumpScale={0.0004}/></mesh></group>
  </group>;
}
