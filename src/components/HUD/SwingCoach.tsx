import { ArrowUp, Hand, Mouse, Move } from 'lucide-react';
import { useGameStore } from '../../state/gameStore';
export function SwingCoach() {
  const assisted = useGameStore((s) => s.settings.controls === 'assisted');
  const guides = useGameStore((s) => s.settings.guides), reach = useGameStore((s) => s.reachReady);
  const armed = useGameStore((s) => s.swingReady), pulse = useGameStore((s) => s.contactPulse);
  const shot = useGameStore((s) => s.shot), quality = useGameStore((s) => s.contact);
  const contacts = useGameStore((s) => s.contacts), active = useGameStore((s) => s.rallyActive);
  if (!assisted || !guides) return null;
  return <><div className={`swing-coach ${reach ? 'in-reach' : ''} ${pulse > 0 ? 'connected' : ''}`}>
    {pulse > 0 ? <><span className="contact-spark">✦</span><div><strong>{quality === 'Perfect' ? 'That’s the feeling.' : 'Connected.'}</strong><span>{shot?.toUpperCase()} · RECOVER & READ THE NEXT ONE</span></div></>
      : <><Hand size={21}/><div><strong>{!active ? 'One click gets you going.' : reach ? armed ? 'Racket ready. Stay with it.' : 'In reach. Click to swing.' : armed ? 'Ready for the return.' : 'Track it. Step in. Click.'}</strong><span>{contacts < 3 ? 'HOLD CLICK FOR EXTRA TIMING HELP. NO FLICK NEEDED.' : 'MOUSE TO AIM · CLICK TO RETURN · MOVE FOR THE NEXT SHOT'}</span></div></>}
  </div>{contacts < 3 && <div className="first-rally-tips"><span><Move size={13}/><kbd>WASD</kbd> MOVE</span><span><Mouse size={13}/> CLICK / HOLD TO HIT</span><span><ArrowUp size={13}/> FLICK FOR VARIETY</span></div>}</>;
}
