import { RallyRead } from './RallyRead';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Pause, Play, Settings2, Mouse, Flag, RotateCcw, ArrowLeft, Trophy } from 'lucide-react';
import { useGameStore } from '../../state/gameStore';
import { Brand, ShuttleIcon } from '../UI/Brand';
import { focusGame, leaveGame, resumeGame, startGame } from '../UI/gameActions';
import { Settings } from '../Menus/Settings';
import { HowToPlay } from '../Menus/HowToPlay';
import { SwingCoach } from './SwingCoach';
import { NextFeed, PracticeMetrics, SessionStats } from './PracticeMetrics';
import { styles } from '../../game/ai/Styles';
export function GameHUD() {
  const phase = useGameStore((s) => s.phase), mode = useGameStore((s) => s.mode), score = useGameStore((s) => s.score), games = useGameStore((s) => s.games), game = useGameStore((s) => s.game), server = useGameStore((s) => s.server), active = useGameStore((s) => s.rallyActive), message = useGameStore((s) => s.message), rally = useGameStore((s) => s.rally);
  const assisted = useGameStore((s) => s.settings.controls === 'assisted');
  const minimal = useGameStore((s) => s.settings.minimal), opponent = useGameStore((s) => s.settings.opponent);
  const [locked, setLocked] = useState(!!document.pointerLockElement);
  useEffect(() => { const update = () => setLocked(!!document.pointerLockElement); document.addEventListener('pointerlockchange', update); return () => document.removeEventListener('pointerlockchange', update); }, []);
  const pause = () => { useGameStore.getState().pause(); if (document.pointerLockElement) document.exitPointerLock(); };
  // Panels fade while the shuttle is in the air so they never sit on top of it.
  return <div className={`game-hud ${active ? 'hud-quiet' : ''} ${minimal ? 'minimal' : ''}`}><CourtFade/>
    <div className="hud-top"><Brand compact/>{mode === 'match' ? <div className="scoreboard"><div className="score-person"><span>YOU {server === 0 && <i/>}</span><strong>{String(score[0]).padStart(2, '0')}</strong></div><div className="score-middle"><span>GAME {game}</span><ShuttleIcon size={23}/><div>{games[0]} <span>–</span> {games[1]}</div></div><div className="score-person opponent-score"><span>{server === 1 && <i/>} OPPONENT <em>{styles[opponent].name}</em></span><strong>{String(score[1]).padStart(2, '0')}</strong></div></div> : <div className="practice-title"><span className="live-dot"/>{mode === 'practice' ? 'FREE PRACTICE' : 'SHOT TRAINING'}<span>COURT 01</span></div>}<button className="icon-button hud-pause" aria-label="Pause game" onClick={pause}><Pause size={19}/></button></div>
    {phase === 'playing' && locked && <><RallyRead/><SwingCoach/><span className="reticle"/>{!active && <div className="rally-message"><span>{message}</span><p>{mode === 'match' ? server === 0 ? <>{assisted ? <><kbd>CLICK</kbd> Serve <span>·</span> <kbd>E</kbd> also works</> : <><kbd>E</kbd> Release shuttle <span>·</span> Hold click & move to swing</>}</> : 'Take your receiving position' : <NextFeed/>}</p></div>}<div className="hud-bottom"><span><kbd>W A S D</kbd> MOVE <i/> <Mouse size={14}/> LOOK <i/>{assisted ? <><kbd>LMB</kbd> RALLY <i/><kbd>RMB</kbd> DROP <i/><kbd>F</kbd> SMASH <i/><Mouse size={14}/> AIM WHERE IT LANDS</> : <><kbd>HOLD LMB</kbd> + MOVE TO SWING</>}</span><span>{mode !== 'match' && <><kbd>E</kbd> NEW FEED <i/></>}{rally > 0 && `${rally} CONTACT${rally === 1 ? '' : 'S'} · `}<kbd>ESC</kbd> PAUSE</span></div>{mode !== 'match' && <PracticeMetrics/>}</>}
    {phase === 'playing' && !locked && <div className="focus-overlay"><div><Mouse size={29}/><h2>Your place is on the court.</h2><p>{assisted ? <>WASD moves. Look at a spot on the opposite court and click:<br/>the shuttle lands where your marker sits. Right-click drops, F smashes, Space jumps.</> : <>Hold click and move your mouse to swing the racket.<br/>Exact contact matters in Simulation mode.</>}<br/>Press Escape whenever you need a breather.</p><button className="primary-button" onClick={focusGame}>Ready when you are <ArrowUpRight size={21}/></button><button className="text-button" onClick={leaveGame}><ArrowLeft size={15}/> Back to the club</button></div></div>}
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
  return <div className="pause-overlay"><div className="pause-panel"><div className="eyebrow"><span className="live-dot"/> A MOMENT BETWEEN POINTS</div><h2>Take a breather.</h2><p>The court will be right here.</p><SessionStats/><WinnerStats/><button className="primary-button full-width" onClick={resumeGame}>Back to the game <Play size={18}/></button><button className="pause-option" onClick={() => setPanel('settings')}><Settings2 size={18}/> Settings <ArrowUpRight size={17}/></button><button className="pause-option" onClick={() => setPanel('guide')}><Mouse size={18}/> Controls & technique <ArrowUpRight size={17}/></button><button className="pause-option" onClick={() => startGame(mode)}><RotateCcw size={18}/> Start a fresh {mode === 'match' ? 'match' : 'session'}<ArrowUpRight size={17}/></button><button className="pause-option" onClick={leaveGame}><Flag size={18}/> Return to the club <ArrowUpRight size={17}/></button><div className="pause-footnote">NO RUSH. FIND YOUR RHYTHM.</div></div>{panel === 'settings' && <Settings onClose={close}/>} {panel === 'guide' && <HowToPlay onClose={close}/>}</div>;
}
function MatchResult() {
  const format = useGameStore(s => s.matchFormat), points = useGameStore(s => s.score);
  const winner = useGameStore((s) => s.winner), games = useGameStore((s) => s.games), contacts = useGameStore((s) => s.contacts), history = useGameStore((s) => s.gameHistory);
  return <div className="pause-overlay"><div className="pause-panel result-panel"><Trophy size={35}/><div className="eyebrow">MATCH COMPLETE</div><h2>{winner === 0 ? 'Your court. Your win.' : 'A game to build on.'}</h2><div className="result-score">{format === 'duel' ? points[0] : games[0]} <span>–</span> {format === 'duel' ? points[1] : games[1]}</div><WinnerStats/><div className="game-history">{history.map((points, i) => <div key={i}><span>GAME {i + 1}</span><strong className={points[0] > points[1] ? 'game-won' : ''}>{points[0]} <span>–</span> {points[1]}</strong></div>)}</div><p>{contacts} racket contacts. Every one a little more experience.</p><button className="primary-button full-width" onClick={() => startGame('match')}>Run it back <RotateCcw size={18}/></button><button className="pause-option" onClick={leaveGame}><ArrowLeft size={17}/> Back to the club</button></div></div>;
}

function WinnerStats() {
  const mode = useGameStore((s) => s.mode), winners = useGameStore((s) => s.winners);
  const smashes = useGameStore((s) => s.smashWinners), touches = useGameStore((s) => s.touchWinners);
  const onTarget = useGameStore((s) => s.placementOnTarget), shots = useGameStore((s) => s.placementShots);
  const average = useGameStore((s) => s.placementAvg), topSpeed = useGameStore((s) => s.topSpeed);
  if (mode !== 'match') return null;
  return <div className="winner-stats"><div><strong>{winners}</strong><span>WINNERS</span></div><div><strong>{smashes}</strong><span>SMASH WINNERS</span></div><div><strong>{touches}</strong><span>TOUCH WINNERS</span></div><div><strong>{topSpeed ? Math.round(topSpeed) : '—'}</strong><span>KM/H FASTEST</span></div><div><strong>{shots ? `${onTarget}/${shots}` : '—'}</strong><span>ON THE MARK{average > 0 ? ` · AVG ${average.toFixed(2)} M` : ''}</span></div></div>;
}
