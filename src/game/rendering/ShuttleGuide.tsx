import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3 } from 'three';
import { useGameStore } from '../../state/gameStore';
import type { GameEngine } from '../GameEngine';
/** Screen-space readability cue; no changes to the shuttle's position or physics. */
export function ShuttleGuide({ engine }: { engine: GameEngine }) {
  const marker = useRef<HTMLDivElement>(null), arrow = useRef<HTMLSpanElement>(null), label = useRef<HTMLSpanElement>(null);
  const settings = useGameStore((s) => s.settings), phase = useGameStore((s) => s.phase);
  const { size } = useThree(); const point = new Vector3(), local = new Vector3();
  useFrame(({ camera }) => {
    const element = marker.current; if (!element) return;
    const visible = settings.controls === 'assisted' && settings.guides && phase === 'playing' && engine.shuttle.active && engine.input?.locked;
    element.style.display = visible ? 'flex' : 'none'; if (!visible) return;
    camera.updateMatrixWorld();
    point.copy(engine.shuttle.position).project(camera);
    local.copy(engine.shuttle.position).applyMatrix4(camera.matrixWorldInverse);
    const behind = local.z > 0;
    const offscreen = behind || Math.abs(point.x) > 0.9 || point.y > 0.70 || point.y < -0.65;
    let x = (point.x * 0.5 + 0.5) * size.width, y = (-point.y * 0.5 + 0.5) * size.height;
    if (behind) { x = local.x >= 0 ? size.width * 0.94 : size.width * 0.06; y = size.height * 0.53; }
    x = MathUtils.clamp(x, size.width * 0.06, size.width * 0.94); y = MathUtils.clamp(y, size.height * 0.16, size.height * 0.76);
    element.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
    const incoming = engine.shuttle.lastHit === 1 || !engine.shuttle.served;
    element.className = `shuttle-tracker ${offscreen ? 'offscreen' : ''} ${engine.guide.reachable && incoming ? 'within-reach' : ''}`;
    if (arrow.current) arrow.current.style.transform = `rotate(${Math.atan2(local.x, local.y) * 180 / Math.PI}deg)`;
    if (label.current) label.current.textContent = offscreen ? behind ? 'TURN TO THE SHUTTLE' : point.y > 0.7 ? 'LOOK UP' : point.x < 0 ? 'LOOK LEFT' : 'LOOK RIGHT' : incoming && engine.guide.reachable ? 'CLICK TO HIT' : '';
  });
  return <Html fullscreen calculatePosition={() => [size.width / 2, size.height / 2]} zIndexRange={[1, 1]} style={{ pointerEvents: 'none' }}><div className="shuttle-guide-layer" aria-hidden="true"><div ref={marker} className="shuttle-tracker"><span className="tracker-ring"/><span className="tracker-arrow" ref={arrow}>↑</span><span className="tracker-label" ref={label}/></div></div></Html>;
}
