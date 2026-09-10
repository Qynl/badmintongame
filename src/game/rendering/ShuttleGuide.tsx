import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3 } from 'three';
import { useGameStore } from '../../state/gameStore';
import { STRIKE_EARLY, inStrikeWindow, timeToStrike } from '../player/StrikeWindow';
import type { GameEngine } from '../GameEngine';
/** Screen-space readability cue; no changes to the shuttle's position or physics. */
export function ShuttleGuide({ engine }: { engine: GameEngine }) {
  const marker = useRef<HTMLDivElement>(null), arrow = useRef<HTMLSpanElement>(null), label = useRef<HTMLSpanElement>(null);
  const strike = useRef<HTMLSpanElement>(null);
  const settings = useGameStore((s) => s.settings), phase = useGameStore((s) => s.phase);
  const { size } = useThree(); const point = new Vector3(), local = new Vector3();
  useFrame(({ camera }) => {
    const element = marker.current; if (!element) return;
    const assisted = settings.controls === 'assisted';
    const visible = settings.guides && phase === 'playing' && engine.shuttle.active && engine.input?.locked;
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
    element.className = `shuttle-tracker ${offscreen ? 'offscreen' : ''} ${engine.guide.reachable && incoming ? 'within-reach' : ''} ${engine.guide.smashReady && incoming ? 'smash-window' : ''}`;
    if (arrow.current) arrow.current.style.transform = `rotate(${Math.atan2(local.x, local.y) * 180 / Math.PI}deg)`;
    // Timing ring: it closes on the shuttle as the swing window arrives, then flashes.
    const seconds = timeToStrike(engine.player, engine.shuttle);
    const open = assisted && seconds >= 0 && seconds < STRIKE_EARLY + 0.3;
    const now = inStrikeWindow(seconds);
    if (strike.current) {
      strike.current.style.display = open && incoming ? 'block' : 'none';
      strike.current.style.transform = `scale(${(0.42 + Math.max(0, seconds) * 2.3).toFixed(3)})`;
      strike.current.style.opacity = String(Math.min(0.95, 0.35 + (STRIKE_EARLY + 0.3 - Math.max(0, seconds)) * 1.5));
      strike.current.className = `strike-ring ${now ? 'window' : ''}`;
    }
    if (label.current) label.current.textContent = offscreen ? behind ? 'TURN TO THE SHUTTLE' : point.y > 0.7 ? 'LOOK UP' : point.x < 0 ? 'LOOK LEFT' : 'LOOK RIGHT' : incoming && engine.guide.smashReady ? 'F · SMASH' : incoming && engine.guide.reachable ? 'LMB · RALLY   RMB · DROP' : '';
  });
  return <Html fullscreen calculatePosition={() => [size.width / 2, size.height / 2]} zIndexRange={[1, 1]} style={{ pointerEvents: 'none' }}><div className="shuttle-guide-layer" aria-hidden="true"><div ref={marker} className="shuttle-tracker"><span className="strike-ring" ref={strike}/><span className="tracker-ring"/><span className="tracker-arrow" ref={arrow}>↑</span><span className="tracker-label" ref={label}/></div></div></Html>;
}
