import { ArrowDownRight, Crosshair, Hand, Wind, Zap } from 'lucide-react';
import { useGameStore } from '../../state/gameStore';
export function SwingCoach() {
  const assisted = useGameStore((s) => s.settings.controls === 'assisted');
  const guides = useGameStore((s) => s.settings.guides), reach = useGameStore((s) => s.reachReady);
  const armed = useGameStore((s) => s.swingReady), pulse = useGameStore((s) => s.contactPulse);
  const shot = useGameStore((s) => s.shot), timed = useGameStore((s) => s.timedContact), speed = useGameStore((s) => s.speed);
  const active = useGameStore((s) => s.rallyActive), smashReady = useGameStore((s) => s.smashReady);
  const selected = useGameStore((s) => s.selectedShot), feedback = useGameStore((s) => s.feedback);
  const aimLabel = useGameStore((s) => s.aimLabel), placement = useGameStore((s) => s.placement);
  if (!assisted || !guides) return null;
  const smashing = pulse > 0 && shot === 'Smash', dropping = pulse > 0 && (shot === 'Drop' || shot === 'Net shot');
  return <>
    <div className={`swing-coach shot-coach ${smashReady ? 'attack-window' : reach ? 'in-reach' : ''} ${pulse > 0 ? 'connected' : ''} ${smashing ? 'smash-contact' : dropping ? 'drop-contact' : ''}`}>
      {pulse > 0 ? <>{smashing ? <Zap size={25}/> : dropping ? <Wind size={25}/> : <span className="contact-spark">✦</span>}<div>
        <strong>{smashing ? timed ? 'Timed smash!' : 'Smash!' : dropping ? shot === 'Net shot' ? 'Just over the tape.' : 'Soft drop.' : shot === 'Serve' ? 'In play.' : `${shot || 'Clean contact'}.`}</strong>
        <span>{smashing ? `${Math.round(speed)} KM/H · ${timed ? 'YOU CAUGHT THE WINDOW' : 'RECOVER FOR THE BLOCK'}` : placement !== null ? `${feedback || ''} · ${placement < 0.6 ? 'ON THE MARK' : `${placement.toFixed(1)} M OFF THE MARK`}` : feedback || 'WATCH YOUR OPPONENT. WHERE IS THE SPACE?'}</span>
      </div></> : <>{smashReady ? <Zap size={23}/> : selected === 'drop' ? <Wind size={23}/> : <Hand size={21}/>}<div>
        <strong>{!active ? 'Your next point starts here.' : smashReady ? 'High ball. Take it on.' : reach ? selected === 'drop' ? 'Soft hands. Bring them in.' : armed ? `Committed ${aimLabel.toLowerCase()}.` : 'In reach. Look where you want it.' : selected === 'smash' ? 'Smash ready. Meet it high.' : 'Build the point.'}</strong>
        <span>{!active ? 'LOOK AT YOUR TARGET · CLICK TO SEND IT THERE' : smashReady ? 'F TO SMASH · RIGHT-CLICK TO DISGUISE A DROP' : 'WHERE YOU LOOK IS WHERE IT GOES. PICK A CORNER.'}</span>
      </div></>}
    </div>
    <div className="shot-choice-bar" role="group" aria-label="Assisted shot controls">
      <div className={`shot-command ${selected === 'rally' && armed ? 'selected' : ''}`}><kbd>LMB</kbd><span>RALLY</span><ArrowDownRight size={12}/></div>
      <div className={`shot-command ${selected === 'drop' && armed ? 'selected touch' : ''}`}><kbd>RMB</kbd><span>DROP</span><Wind size={13}/></div>
      <div className={`shot-command smash-command ${smashReady ? 'available' : ''} ${selected === 'smash' && armed ? 'selected' : ''}`}><kbd>F</kbd><span>SMASH<small>{smashReady ? 'WINDOW OPEN' : 'HIGH CONTACT'}</small></span><Zap size={13}/></div>
      <div className={`shot-command aim-command ${armed ? 'locked' : ''}`}><Crosshair size={13}/><span>AIM<small>{aimLabel}</small></span></div>
    </div>
  </>;
}
