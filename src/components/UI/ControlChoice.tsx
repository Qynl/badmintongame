import { Check, Hand, ScanLine } from 'lucide-react';
import { useGameStore } from '../../state/gameStore';
export function ControlChoice({ compact = false }: { compact?: boolean }) {
  const controls = useGameStore((s) => s.settings.controls), set = useGameStore((s) => s.setSettings);
  return <section className={`control-choice ${compact ? 'compact-choice' : ''}`} aria-label="Swing controls"><div className="section-label">HOW YOU WANT TO PLAY</div><div className="control-options">
    <button className={controls === 'assisted' ? 'selected' : ''} aria-pressed={controls === 'assisted'} onClick={() => set({ controls: 'assisted' })}><Hand size={18}/><span><strong>Assisted <em>RECOMMENDED</em></strong><small>Easy contact. Three shots. Your choice.</small></span>{controls === 'assisted' && <Check size={15}/>}</button>
    <button className={controls === 'simulation' ? 'selected' : ''} aria-pressed={controls === 'simulation'} onClick={() => set({ controls: 'simulation' })}><ScanLine size={18}/><span><strong>Simulation</strong><small>Exact string-bed contact. Manual wrist control.</small></span>{controls === 'simulation' && <Check size={15}/>}</button>
  </div><p>{controls === 'assisted' ? 'Left-click returns. Right-click drops. F smashes a high ball. Hold a control for timing help, or tap as the window opens for a cleaner attack.' : 'Hold click and move the mouse to position and accelerate the racket. Every contact is physical and unassisted.'}</p></section>;
}
