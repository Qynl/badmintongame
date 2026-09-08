import { Move, Mouse, ScanLine, ArrowUpRight, Crosshair, Footprints } from 'lucide-react';
import { useGameStore } from '../../state/gameStore';
import { Modal } from '../UI/Modal';
export function HowToPlay({ onClose }: { onClose: () => void }) {
  const assisted = useGameStore((s) => s.settings.controls === 'assisted');
  return <Modal title="Find your sweet spot." eyebrow="THE ESSENTIALS" onClose={onClose} wide>
    <p className="modal-intro">{assisted ? 'Easy to pick up. Plenty of room to get better. Assisted controls are on.' : 'Simulation controls: exact racket contact, with no reach or trajectory assistance.'}</p>
    <div className="guide-grid">
      <article><Move size={23}/><span>01 / FIND YOUR FEET</span><h3>Move with intention.</h3><p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move. Hold <kbd>Shift</kbd> to sprint or lunge into a reach. <kbd>Space</kbd> jumps. Your momentum takes a moment to settle.</p></article>
      <article><Mouse size={23}/><span>02 / READ THE FLIGHT</span><h3>Keep your eye on it.</h3><p>Move your mouse to look. Watch the cork: the shuttle slows quickly as it crosses the net. Get your feet into position before you swing.</p></article>
      <article><Crosshair size={23}/><span>03 / MAKE CONTACT</span><h3>{assisted ? 'Just click to connect.' : 'Your mouse is your swing.'}</h3><p>{assisted ? 'Click when the shuttle gets close. Or hold click: your racket stays ready for a more forgiving timing window. Guided reach helps you connect, and a plain click sends a useful return. No mouse flick required.' : 'Hold the left mouse button and move your mouse to guide your racket. Up raises it, down lowers it. The exact string bed must meet the shuttle; your motion determines its response.'}</p></article>
      <article><ScanLine size={23}/><span>04 / START A RALLY</span><h3>Serve. Read. Recover.</h3><p>{assisted ? <>Click to serve, or press <kbd>E</kbd>. In a rally, a gentle downward flick plays shorter; a fast downward flick from high contact attacks. An upward flick sends it deeper.</> : <>Press <kbd>E</kbd> to release your serve, then swing through the shuttle below 1.15 m into the diagonal service box.</>} Practice and training feed automatically; <kbd>E</kbd> restarts a feed. In training, use the requested shot and land in the highlighted zone. <kbd>Esc</kbd> pauses.</p></article>
    </div>
    <div className="guide-tip"><Footprints size={21}/><p><strong>Start with free practice.</strong> Choose Assisted + Casual, hold click for your first few returns, and get comfortable moving. Switch to Simulation in Settings only when you want exact-contact control.</p></div>
    <div className="guide-footer"><span>Desktop · Keyboard & mouse · Headphones recommended</span><button className="text-button" onClick={onClose}>Got it <ArrowUpRight size={17}/></button></div>
  </Modal>;
}
