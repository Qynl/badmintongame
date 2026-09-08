import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Pause, Play, Settings2, Mouse, Flag, RotateCcw, ArrowLeft, Trophy } from 'lucide-react';
import { useGameStore } from '../../state/gameStore';
import { Brand, ShuttleIcon } from '../UI/Brand';
import { focusGame, leaveGame, resumeGame, startGame } from '../UI/gameActions';
import { Settings } from '../Menus/Settings';
import { HowToPlay } from '../Menus/HowToPlay';
import { NextFeed, PracticeMetrics, SessionStats } from './PracticeMetrics';
export function GameHUD() {
  const phase = useGameStore((s) => s.phase), mode = useGameStore((s) => s.mode), score = useGameStore((s) => s.score), games = useGameStore((s) => s.games), game = useGameStore((s) => s.game), server = useGameStore((s) => s.server), active = useGameStore((s) => s.rallyActive), message = useGameStore((s) => s.message), rally = useGameStore((s) => s.rally);
  const [locked, setLocked] = useState(!!document.pointerLockElement);
  useEffect(() => { const update = () => setLocked(!!document.pointerLockElement); document.addEventListener('pointerlockchange', update); return () => document.removeEventListener('pointerlockchange', update); }, []);
  const pause = () => { useGameStore.getState().pause(); if (document.pointerLockElement) document.exitPointerLock(); };
  return <div className="game-hud"><CourtFade/>
    <div className="hud-top"><Brand compact/>{mode === 'match' ? <div className="scoreboard"><div className="score-person"><span>YOU {server === 0 && <i/>}</span><strong>{String(score[0]).padStart(2, '0')}</strong></div><div className="score-middle"><span>GAME {game}</span><ShuttleIcon size={23}/><div>{games[0]} <span>–</span> {games[1]}</div></div><div className="score-person opponent-score"><span>{server === 1 && <i/>} OPPONENT</span><strong>{String(score[1]).padStart(2, '0')}</strong></div></div> : <div className="practice-title"><span className="live-dot"/>{mode === 'practice' ? 'FREE PRACTICE' : 'SHOT TRAINING'}<span>COURT 01</span></div>}<button className="icon-button hud-pause" aria-label="Pause game" onClick={pause}><Pause size={19}/></button></div>
    {phase === 'playing' && locked && <><span className="reticle"/>{!active && <div className="rally-message"><span>{message}</span><p>{mode === 'match' ? server === 0 ? <><kbd>E</kbd> Release shuttle <span>·</span> Hold click & move to swing</> : 'Take your receiving position' : <NextFeed/>}</p></div>}<div className="hud-bottom"><span><kbd>W A S D</kbd> MOVE <i/> <Mouse size={14}/> LOOK <i/><kbd>HOLD LMB</kbd> + MOVE TO SWING</span><span>{mode !== 'match' && <><kbd>E</kbd> NEW FEED <i/></>}{rally > 0 && `${rally} CONTACT${rally === 1 ? '' : 'S'} · `}<kbd>ESC</kbd> PAUSE</span></div>{mode !== 'match' && <PracticeMetrics/>}</>}
    {phase === 'playing' && !locked && <div className="focus-overlay"><div><Mouse size={29}/><h2>Your place is on the court.</h2><p>Click below to focus the game. Your mouse controls your view<br/>and racket. Press Escape whenever you need a breather.</p><button className="primary-button" onClick={focusGame}>Ready when you are <ArrowUpRight size={21}/></button><button className="text-button" onClick={leaveGame}><ArrowLeft size={15}/> Back to the club</button></div></div>}
    {phase === 'paused' && <PauseMenu/>}{phase === 'result' && <MatchResult/>}
  </div>;
}
function CourtFade() {
  const opacity = useGameStore((s) => s.courtFade);
  return <div className="court-transition-veil" style={{ opacity }} aria-hidden="true"/>;
}
function PauseMenu() {
  const [panel, setPanel] = useState<'settings' | 'guide' | null>(null), mode = useGameStore((s) => s.mode);
  const close = useCallback(() => setPanel(null), []);
  return <div className="pause-overlay"><div className="pause-panel"><div className="eyebrow"><span className="live-dot"/> A MOMENT BETWEEN POINTS</div><h2>Take a breather.</h2><p>The court will be right here.</p><SessionStats/><button className="primary-button full-width" onClick={resumeGame}>Back to the game <Play size={18}/></button><button className="pause-option" onClick={() => setPanel('settings')}><Settings2 size={18}/> Settings <ArrowUpRight size={17}/></button><button className="pause-option" onClick={() => setPanel('guide')}><Mouse size={18}/> Controls & technique <ArrowUpRight size={17}/></button><button className="pause-option" onClick={() => startGame(mode)}><RotateCcw size={18}/> Start a fresh {mode === 'match' ? 'match' : 'session'}<ArrowUpRight size={17}/></button><button className="pause-option" onClick={leaveGame}><Flag size={18}/> Return to the club <ArrowUpRight size={17}/></button><div className="pause-footnote">NO RUSH. FIND YOUR RHYTHM.</div></div>{panel === 'settings' && <Settings onClose={close}/>} {panel === 'guide' && <HowToPlay onClose={close}/>}</div>;
}
function MatchResult() {
  const winner = useGameStore((s) => s.winner), games = useGameStore((s) => s.games), contacts = useGameStore((s) => s.contacts), history = useGameStore((s) => s.gameHistory);
  return <div className="pause-overlay"><div className="pause-panel result-panel"><Trophy size={35}/><div className="eyebrow">MATCH COMPLETE</div><h2>{winner === 0 ? 'Your court. Your win.' : 'A game to build on.'}</h2><div className="result-score">{games[0]} <span>–</span> {games[1]}</div><div className="game-history">{history.map((points, i) => <div key={i}><span>GAME {i + 1}</span><strong className={points[0] > points[1] ? 'game-won' : ''}>{points[0]} <span>–</span> {points[1]}</strong></div>)}</div><p>{contacts} racket contacts. Every one a little more experience.</p><button className="primary-button full-width" onClick={() => startGame('match')}>Run it back <RotateCcw size={18}/></button><button className="pause-option" onClick={leaveGame}><ArrowLeft size={17}/> Back to the club</button></div></div>;
}
