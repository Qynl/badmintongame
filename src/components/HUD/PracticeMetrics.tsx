import { Crosshair, SlidersHorizontal, Target, Timer, TrendingUp } from 'lucide-react';
import { useGameStore } from '../../state/gameStore';
import { drills } from '../../game/training/Drills';
export function StringBedImpact() {
  const point = useGameStore((s) => s.impactPoint), contact = useGameStore((s) => s.contact);
  const x = point ? 38 + Math.max(-1, Math.min(1, point[0])) * 27 : 38;
  const y = point ? 44 - Math.max(-1, Math.min(1, point[1])) * 35 : 44;
  return <svg className="stringbed-impact" viewBox="0 0 76 90" role="img" aria-label={point ? `Racket contact: ${contact}, ${Math.round(Math.hypot(...point) * 100)} percent from center` : 'No racket contact yet'}>
    <defs><clipPath id="string-bed-clip"><ellipse cx="38" cy="44" rx="27" ry="35"/></clipPath></defs>
    <ellipse cx="38" cy="44" rx="28.5" ry="36.5" fill="none" stroke="currentColor" strokeWidth="1" opacity=".7"/>
    <g clipPath="url(#string-bed-clip)" stroke="currentColor" opacity=".16" strokeWidth=".7">{Array.from({ length: 9 }, (_, i) => <path key={i} d={`M ${10 + i * 7} 8 V 80 M 10 ${9 + i * 8} H 66`}/>)}</g>
    <ellipse cx="38" cy="44" rx="10" ry="13" fill="currentColor" opacity=".08"/>
    <path d="M 35 44 H 41 M 38 41 V 47" stroke="currentColor" opacity=".5"/>
    {point && <g className={contact === 'Perfect' ? 'impact-perfect' : ''}><circle cx={x} cy={y} r="7" fill="currentColor" opacity=".18"/><circle cx={x} cy={y} r="2.8" fill="currentColor"/></g>}
    {!point && contact === 'Miss' && <path d="M 33 39 L 43 49 M 43 39 L 33 49" stroke="#d5a082" strokeWidth="1.4"/>}
  </svg>;
}
export function NextFeed() {
  const next = useGameStore((s) => s.nextFeed);
  return <span className="next-feed"><Timer size={12}/> NEXT FEED {next > 0 ? `${next.toFixed(1)}s` : 'READY'}<span>·</span><kbd>E</kbd> FEED NOW</span>;
}
export function PracticeMetrics() {
  const assisted = useGameStore((s) => s.settings.controls === 'assisted');
  const contact = useGameStore((s) => s.contact), shot = useGameStore((s) => s.shot), speed = useGameStore((s) => s.speed);
  const racketSpeed = useGameStore((s) => s.racketSpeed), impact = useGameStore((s) => s.settings.impact);
  const contacts = useGameStore((s) => s.contacts), mode = useGameStore((s) => s.mode);
  const feedback = useGameStore((s) => s.feedback), landing = useGameStore((s) => s.lastLanding);
  return <>{impact && <aside className="practice-metrics" aria-label="Contact lab">
    <div className="metrics-heading"><SlidersHorizontal size={13}/> CONTACT LAB <span>{assisted ? 'ASSISTED' : 'EXACT'}</span></div>
    <div className="impact-summary"><div className={`contact-result ${contact === 'Perfect' ? 'perfect' : ''}`}>{contact || 'Find the feel.'}<small>{shot || 'Make your first connection'}</small>{landing && <span className={`landing-chip ${landing === 'Target' ? 'on-target' : ''}`}>{landing === 'Target' ? <Target size={10}/> : <Crosshair size={10}/>} {landing === 'Target' ? 'ON TARGET' : landing === 'In' ? 'LANDED IN' : 'OUT / FAULT'}</span>}</div><StringBedImpact/></div>
    <div className="metric-row"><span>Racket speed</span><strong>{racketSpeed.toFixed(1)} <small>KM/H</small></strong></div>
    <div className="metric-row"><span>Shuttle off strings</span><strong>{speed.toFixed(0)} <small>KM/H</small></strong></div>
    <div className="metric-row"><span>Racket contacts</span><strong>{contacts}</strong></div>
    <div className="contact-coach"><span>ONE SMALL ADJUSTMENT</span><p>{feedback || 'Move into position before you swing. The shuttle will come to you.'}</p></div>
  </aside>}{mode === 'training' && <TrainingGoal/>}</>;
}
function TrainingGoal() {
  const shot = useGameStore((s) => s.trainingShot), attempts = useGameStore((s) => s.trainingAttempts);
  const success = useGameStore((s) => s.trainingSuccess), streak = useGameStore((s) => s.trainingStreak);
  const drill = drills[shot], percentage = attempts > 0 ? Math.round(success / attempts * 100) : 0;
  return <aside className="drill-card" aria-label={`${shot} training progress`}><div className="drill-eyebrow"><Target size={15}/> THE {shot.toUpperCase()} SESSION</div>
    <h3>{drill.targetLabel.toLowerCase()}.</h3><p>{drill.instruction}</p>
    <div className="drill-progress"><div><strong>{success}<span> / {attempts}</span></strong><small>SHOT + TARGET</small></div><div><strong>{percentage}<span>%</span></strong><small>ACCURACY</small></div></div>
    <div className="accuracy-track"><span style={{ width: `${percentage}%` }}/></div><div className="drill-streak"><TrendingUp size={12}/>{streak > 0 ? `${streak} in a row. Keep the feeling.` : 'Right shot. Right landing. Both count.'}</div>
  </aside>;
}
export function SessionStats() {
  const mode = useGameStore((s) => s.mode), rallies = useGameStore((s) => s.rallies), best = useGameStore((s) => s.bestRally);
  const success = useGameStore((s) => s.trainingSuccess), attempts = useGameStore((s) => s.trainingAttempts), streak = useGameStore((s) => s.trainingBestStreak);
  return <div className="session-stats"><div><strong>{mode === 'training' ? `${success}/${attempts}` : rallies}</strong><span>{mode === 'training' ? 'ON TARGET' : 'RALLIES PLAYED'}</span></div><div><strong>{mode === 'training' ? streak : best}</strong><span>{mode === 'training' ? 'BEST STREAK' : 'LONGEST RALLY'}</span></div></div>;
}
