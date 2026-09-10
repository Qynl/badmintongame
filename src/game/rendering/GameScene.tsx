import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment as LightEnvironment } from '@react-three/drei';
import { ACESFilmicToneMapping, Color, Group, PerspectiveCamera, Vector3 } from 'three';
import { Court } from '../world/Court';
import { Environment } from '../world/Environment';
import { PlayerBody } from '../player/PlayerBody';
import { Shuttlecock } from '../shuttle/Shuttlecock';
import { Opponent } from '../ai/Opponent';
import { ShuttleGuide } from './ShuttleGuide';
import { PracticeAids } from './PracticeAids';
import { AimMarker } from './AimMarker';
import { GameEngine } from '../GameEngine';
import { useGameStore } from '../../state/gameStore';
function Scene({ engine }: { engine: GameEngine }) {
  const phase = useGameStore((s) => s.phase), quality = useGameStore((s) => s.settings.quality);
  const { camera, gl } = useThree();
  const menu = phase === 'menu';
  const elapsed = useRef(0), hall = useRef<Group>(null);
  useEffect(() => { engine.attach(gl.domElement); return () => engine.dispose(); }, [engine, gl]);
  useFrame((_, delta) => {
    engine.frame(delta);
    if (hall.current) hall.current.rotation.y = !menu && engine.ends ? Math.PI : 0;
    if (menu) {
      if (camera instanceof PerspectiveCamera && camera.fov !== 48) { camera.fov = 48; camera.updateProjectionMatrix(); }
      elapsed.current += delta;
      const t = elapsed.current;
      camera.position.set(10.0 + Math.sin(t * 0.055) * 0.20, 7.2, 14.0 + Math.sin(t * 0.04) * 0.15);
      camera.lookAt(-2.7, 0.10, -0.7);
    } else { if (camera instanceof PerspectiveCamera && camera.fov !== 72) { camera.fov = 72; camera.updateProjectionMatrix(); } camera.position.copy(engine.player.head); camera.quaternion.copy(engine.player.rotation); }
  });
  return <>
    <color attach="background" args={['#323a30']}/><fog attach="fog" args={['#303b32', 22, 54]}/>
    <hemisphereLight args={['#e5ecd9', '#605a40', 1.55]}/><ambientLight intensity={0.22}/>
    <directionalLight position={[-7, 12, 4]} color="#fff1d6" intensity={2.1} castShadow={quality !== 'performance'} shadow-mapSize={quality === 'ultra' ? [4096, 4096] : [2048, 2048]} shadow-camera-left={-13} shadow-camera-right={13} shadow-camera-top={15} shadow-camera-bottom={-15} shadow-camera-near={1} shadow-camera-far={35} shadow-bias={-0.00025} shadow-normalBias={0.025}/>
    <pointLight position={[1, 7, -5]} color="#e7eedc" intensity={65} distance={23} decay={2}/>
    <pointLight position={[3, 6, 5]} color="#fff0d5" intensity={55} distance={22} decay={2}/>
    <pointLight position={[-7, 5, -8]} color="#c0d2bf" intensity={35} distance={18} decay={2}/>
    <Suspense fallback={null}><LightEnvironment resolution={64} frames={1}><mesh scale={20}><sphereGeometry args={[1, 16, 16]}/><meshBasicMaterial side={1} color={new Color('#a7b3a0')} toneMapped={false}/></mesh><mesh position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 15, 1]}><planeGeometry/><meshBasicMaterial color="#fff4dd" toneMapped={false}/></mesh></LightEnvironment></Suspense>
    <group ref={hall}><Environment/></group>
    <Court engine={engine}/><Opponent engine={engine} menu={menu}/>
    {!menu && <><PlayerBody engine={engine}/><Shuttlecock engine={engine}/><ShuttleGuide engine={engine}/><PracticeAids engine={engine}/><AimMarker engine={engine}/></>}
  </>;
}
export function GameScene() {
  const engine = useMemo(() => new GameEngine(), []);
  const quality = useGameStore((s) => s.settings.quality);
  return <div className="game-canvas"><Canvas shadows={quality !== 'performance'} dpr={quality === 'performance' ? 1 : [1, quality === 'ultra' ? 2 : 1.5]} camera={{ fov: 48, near: 0.035, far: 80, position: new Vector3(10, 7.2, 14) }} gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.1 }}><Scene engine={engine}/></Canvas></div>;
}
