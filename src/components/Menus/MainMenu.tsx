import { useCallback, useState } from 'react';
import { ArrowUpRight, ArrowRight, Volume2, VolumeX, Settings2, Trophy, Target, Infinity as InfinityIcon, MoveUpRight, Headphones, CircleHelp } from 'lucide-react';
import { Brand, ShuttleIcon } from '../UI/Brand';
import { useGameStore } from '../../state/gameStore';
import type { Mode } from '../../state/gameStore';
import { Settings } from './Settings';
import { HowToPlay } from './HowToPlay';
import { Setup } from './Setup';
const modes = [
  { id: 'match' as Mode, label: 'Play a match', sub: 'Quick duel. Proper rivalry.', icon: Trophy, number: '01' },
  { id: 'practice' as Mode, label: 'Free practice', sub: 'Find your rhythm. No pressure.', icon: InfinityIcon, number: '02' },
  { id: 'training' as Mode, label: 'Shot training', sub: 'Small details. Better game.', icon: Target, number: '03' },
];
export function MainMenu() {
  const [mode, setMode] = useState<Mode>('match');
  const [panel, setPanel] = useState<'settings' | 'guide' | 'setup' | null>(null);
  const volume = useGameStore((s) => s.settings.volume), setSettings = useGameStore((s) => s.setSettings);
  const close = useCallback(() => setPanel(null), []);
  return <main className="main-menu">
    <div className="menu-shade"/>
    <header className="topbar"><Brand/><nav aria-label="Main navigation"><button className="nav-link active" onClick={() => { setPanel(null); setMode('match'); }}>THE COURT</button><button className="nav-link" onClick={() => setPanel('guide')}>HOW TO PLAY <ArrowUpRight size={13}/></button></nav><div className="header-tools"><span className="club-status"><i className="live-dot"/> YOUR COURT IS READY</span><span className="tool-divider"/><button className="icon-button" aria-label={volume > 0 ? 'Mute audio' : 'Enable audio'} title={volume > 0 ? 'Mute audio' : 'Enable audio'} onClick={() => setSettings({ volume: volume > 0 ? 0 : 0.55 })}>{volume > 0 ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button><button className="icon-button" aria-label="Settings" title="Settings" onClick={() => setPanel('settings')}><Settings2 size={19}/></button></div></header>
    <div className="menu-content">
      <section className="hero-copy"><div className="eyebrow hero-eyebrow"><span/> NOT JUST A GAME. A FEELING.</div><h1>FEEL EVERY<br/><em>CONTACT.</em><span className="title-period">®</span></h1><p className="hero-description">Easy to pick up. One more rally. One more perfect connection.<br/>The court is yours — just step in and swing.</p><div className="hero-action"><button className="primary-button" onClick={() => setPanel('setup')}>{mode === 'match' ? 'Let’s play' : mode === 'practice' ? 'Find your rhythm' : 'Sharpen your game'}<ArrowUpRight size={24}/></button><span className="perspective-label"><span className="tiny-viewfinder"/>A FIRST-PERSON EXPERIENCE</span></div></section>
      <div className="court-caption"><div className="court-caption-top"><span className="live-dot"/> THE FEATHER CLUB <span className="caption-line"/></div><div className="court-caption-title">Home court.<br/>Away from everything.</div><p>INDOOR HALL <span> / </span> COURT 01</p><div className="venue-coordinates"><span>6.10 M × 13.40 M</span><ShuttleIcon size={25}/></div></div>
      <section className="mode-section"><div className="section-heading"><span>FIND YOUR GAME</span><span>THREE WAYS TO STEP IN <ArrowRight size={13}/></span></div><div className="mode-cards" role="group" aria-label="Game mode">{modes.map((item) => <button key={item.id} className={`mode-card ${mode === item.id ? 'selected' : ''}`} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}><div className="mode-card-top"><item.icon size={22} strokeWidth={1.4}/><span>{item.number}</span></div><div className="mode-card-title">{item.label}<MoveUpRight size={17}/></div><p>{item.sub}</p><span className="selection-line"/></button>)}</div></section>
    </div>
    <footer className="menu-footer"><div className="footer-message"><span className="footer-mark">F.</span><span>A LITTLE CLOSER TO THE REAL THING.</span></div><button className="headphone-note" onClick={() => setPanel('guide')}><Headphones size={15}/><span>Best experienced with headphones</span><CircleHelp size={13}/></button><div className="version"><span className="live-dot"/> IN DEVELOPMENT <span> / </span> V.2.3</div></footer>
    {panel === 'settings' && <Settings onClose={close}/>} {panel === 'guide' && <HowToPlay onClose={close}/>} {panel === 'setup' && <Setup mode={mode} onClose={close}/>}
  </main>;
}
