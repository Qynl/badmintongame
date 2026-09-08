import { Monitor, Volume2, Mouse, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { ControlChoice } from '../UI/ControlChoice';
import { useGameStore, defaultSettings } from '../../state/gameStore';
import { Modal } from '../UI/Modal';
import { audio } from '../../game/audio/AudioManager';
export function Toggle({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  return <button className={`toggle ${value ? 'on' : ''}`} onClick={onChange} role="switch" aria-checked={value} aria-label={label}><span/></button>;
}
export function Settings({ onClose }: { onClose: () => void }) {
  const s = useGameStore((s) => s.settings), set = useGameStore((s) => s.setSettings);
  return <Modal title="Make it your game." eyebrow="PREFERENCES" onClose={onClose}>
    <ControlChoice/>
    <section className="settings-section"><div className="setting-row"><div>Shuttle & swing cues<small>Clearer tracking and an in-reach indicator in Assisted mode</small></div><Toggle value={s.guides} onChange={() => set({ guides: !s.guides })} label="Shuttle and swing cues"/></div></section>
    <section className="settings-section"><h3><Monitor size={16}/> Graphics</h3><div className="segmented">{(['performance', 'balanced', 'ultra'] as const).map((quality) => <button key={quality} className={s.quality === quality ? 'selected' : ''} onClick={() => set({ quality })}>{quality}</button>)}</div><p className="field-note">{s.quality === 'performance' ? 'Lower resolution, no dynamic shadows. Built for lighter devices.' : s.quality === 'ultra' ? 'High-resolution shadows and a sharper image. Best on a dedicated GPU.' : 'Soft shadows and adaptive resolution. The recommended balance.'}</p></section>
    <section className="settings-section"><h3><Volume2 size={16}/> Hall audio <span>{Math.round(s.volume * 100)}%</span></h3><input aria-label="Audio volume" type="range" min="0" max="1" step="0.01" value={s.volume} onChange={(e) => { const volume = +e.target.value; set({ volume }); audio.volume(volume); }}/></section>
    <section className="settings-section"><h3><Mouse size={16}/> Mouse sensitivity <span>{s.sensitivity.toFixed(1)}×</span></h3><input aria-label="Mouse sensitivity" type="range" min="0.3" max="2" step="0.1" value={s.sensitivity} onChange={(e) => set({ sensitivity: +e.target.value })}/><div className="setting-row"><div>Natural head movement<small>Subtle steps and landing response</small></div><Toggle value={s.headMotion} onChange={() => set({ headMotion: !s.headMotion })} label="Natural head movement"/></div></section>
    <section className="settings-section"><h3><SlidersHorizontal size={16}/> Practice tools</h3>{([['trajectory', 'Shuttle trail'], ['impact', 'Contact & swing metrics'], ['landing', 'Predicted landing marker']] as const).map(([key, label]) => <div className="setting-row" key={key}><span>{label}</span><Toggle value={s[key]} onChange={() => set({ [key]: !s[key] })} label={label}/></div>)}<p className="field-note">Training tools stay hidden in competitive matches.</p></section>
    <button className="text-button" onClick={() => set(defaultSettings)}><RotateCcw size={14}/> Reset preferences</button>
  </Modal>;
}
