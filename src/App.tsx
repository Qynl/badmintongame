import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';
import { GameScene } from './game/rendering/GameScene';
import { MainMenu } from './components/Menus/MainMenu';
import { GameHUD } from './components/HUD/GameHUD';
import { useGameStore } from './state/gameStore';
import { Brand } from './components/UI/Brand';
class GameBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="render-error"><Brand/><h2>The court couldn’t load.</h2><p>Please enable hardware acceleration and use a WebGL 2 compatible browser.</p><button className="primary-button" onClick={() => window.location.reload()}>Try again ↗</button></div> : this.props.children; }
}
export default function App() {
  const phase = useGameStore((s) => s.phase);
  return <GameBoundary><Suspense fallback={<div className="loading"><Brand/><span>PREPARING YOUR COURT…</span></div>}><GameScene/></Suspense>{phase === 'menu' ? <MainMenu/> : <GameHUD/>}</GameBoundary>;
}
