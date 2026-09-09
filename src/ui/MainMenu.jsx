import React, { useState } from 'react';
import { CLUBS } from '../data/names.js';
import { FORMATIONS, PRESETS } from '../sim/formations.js';
import { POS } from '../sim/constants.js';

const WEATHERS = [
  { id: 'clear', label: 'Clear', s: 'Dry, fast pitch' },
  { id: 'cloudy', label: 'Overcast', s: 'Neutral' },
  { id: 'wet', label: 'Damp', s: 'Ball skids on' },
  { id: 'rain', label: 'Heavy Rain', s: 'Slick, unpredictable' },
  { id: 'windy', label: 'Windy', s: 'Long balls drift' },
  { id: 'night', label: 'Night', s: 'Floodlit' },
];

const POSITIONS = [
  { id: POS.GK, label: 'Goalkeeper' },
  { id: POS.CB, label: 'Centre Back' },
  { id: POS.LB, label: 'Left Back' },
  { id: POS.RB, label: 'Right Back' },
  { id: POS.DM, label: 'Def. Midfield' },
  { id: POS.CM, label: 'Centre Mid' },
  { id: POS.AM, label: 'Att. Midfield' },
  { id: POS.LW, label: 'Left Wing' },
  { id: POS.RW, label: 'Right Wing' },
  { id: POS.ST, label: 'Striker' },
];

export function MainMenu({ onStart, onCareer, onResumeCareer, hasSave, settings, setSettings }) {
  const [mode, setMode] = useState('home'); // home | quick | career | settings | controls
  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="brand">Pitchside</div>
        <h1 className="title">Eleven versus eleven.</h1>
        <p className="subtitle">
          A full football match simulated in real time — twenty-two players, each with their own
          attributes, reading the game and making their own decisions. You control one of them.
          Nothing here is scripted; the same fixture never plays out twice.
        </p>

        <div className="tabs">
          <button className={`tab ${mode === 'home' ? 'on' : ''}`} onClick={() => setMode('home')}>Play</button>
          <button className={`tab ${mode === 'quick' ? 'on' : ''}`} onClick={() => setMode('quick')}>Quick Match</button>
          <button className={`tab ${mode === 'career' ? 'on' : ''}`} onClick={() => setMode('career')}>Career</button>
          <button className={`tab ${mode === 'settings' ? 'on' : ''}`} onClick={() => setMode('settings')}>Settings</button>
          <button className={`tab ${mode === 'controls' ? 'on' : ''}`} onClick={() => setMode('controls')}>Controls</button>
        </div>

        {mode === 'home' && (
          <div className="grid g2">
            <div className="card">
              <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Career</h3>
              <p className="dim small" style={{ marginTop: 0, lineHeight: 1.55 }}>
                Take one footballer from a young hopeful to whatever you can make of them. Train
                during the week, earn your place in the side, and develop the attributes you
                actually use on the pitch. Your manager is watching.
              </p>
              <div className="row mt">
                {hasSave && <button className="btn primary" onClick={onResumeCareer}>Continue Career</button>}
                <button className={`btn ${hasSave ? '' : 'primary'}`} onClick={() => setMode('career')}>
                  {hasSave ? 'New Career' : 'Start Career'}
                </button>
              </div>
            </div>
            <div className="card">
              <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Quick Match</h3>
              <p className="dim small" style={{ marginTop: 0, lineHeight: 1.55 }}>
                Pick two clubs, a formation and the conditions, then play. Choose any position on
                the pitch — or sit back and watch the AI play itself, which is the fastest way to
                see how the team intelligence behaves.
              </p>
              <div className="row mt">
                <button className="btn primary" onClick={() => setMode('quick')}>Set Up Match</button>
              </div>
            </div>
          </div>
        )}

        {mode === 'quick' && <QuickMatchSetup onStart={onStart} />}
        {mode === 'career' && <CareerSetup onCareer={onCareer} />}
        {mode === 'settings' && <SettingsPanel settings={settings} setSettings={setSettings} />}
        {mode === 'controls' && <ControlsPanel />}
      </div>
    </div>
  );
}

function QuickMatchSetup({ onStart }) {
  const [homeIdx, setHomeIdx] = useState(0);
  const [awayIdx, setAwayIdx] = useState(1);
  const [formation, setFormation] = useState('4-3-3');
  const [awayFormation, setAwayFormation] = useState('4-4-2');
  const [preset, setPreset] = useState('Balanced');
  const [weather, setWeather] = useState('clear');
  const [position, setPosition] = useState(POS.CM);
  const [spectate, setSpectate] = useState(false);
  const [halfMinutes, setHalfMinutes] = useState(5);
  const [difficulty, setDifficulty] = useState('pro');

  const start = () => onStart({
    homeClub: CLUBS[homeIdx], awayClub: CLUBS[awayIdx],
    formation, awayFormation, preset, weather,
    position, spectate, halfMinutes, difficulty,
    seed: (Math.random() * 0xffffffff) >>> 0,
  });

  return (
    <>
      <div className="grid g2">
        <div className="card">
          <h2 className="section" style={{ marginTop: 0 }}>Home</h2>
          <label className="field">
            <span className="lab">Club</span>
            <select value={homeIdx} onChange={e => setHomeIdx(+e.target.value)}>
              {CLUBS.map((c, i) => <option key={c.name} value={i} disabled={i === awayIdx}>{c.name} ({c.rating})</option>)}
            </select>
          </label>
          <label className="field">
            <span className="lab">Formation</span>
            <select value={formation} onChange={e => setFormation(e.target.value)}>
              {Object.keys(FORMATIONS).map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="lab">Tactical Style</span>
            <select value={preset} onChange={e => setPreset(e.target.value)}>
              {Object.keys(PRESETS).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>

        <div className="card">
          <h2 className="section" style={{ marginTop: 0 }}>Away</h2>
          <label className="field">
            <span className="lab">Club</span>
            <select value={awayIdx} onChange={e => setAwayIdx(+e.target.value)}>
              {CLUBS.map((c, i) => <option key={c.name} value={i} disabled={i === homeIdx}>{c.name} ({c.rating})</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="lab">Formation</span>
            <select value={awayFormation} onChange={e => setAwayFormation(e.target.value)}>
              {Object.keys(FORMATIONS).map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        </div>
      </div>

      <h2 className="section">Your Position</h2>
      <div className="opt-grid">
        {POSITIONS.map(p => (
          <div key={p.id} className={`opt ${!spectate && position === p.id ? 'on' : ''}`}
               onClick={() => { setPosition(p.id); setSpectate(false); }}>
            {p.id}<span className="s">{p.label}</span>
          </div>
        ))}
        <div className={`opt ${spectate ? 'on' : ''}`} onClick={() => setSpectate(true)}>
          👁<span className="s">Spectate</span>
        </div>
      </div>

      <h2 className="section">Conditions</h2>
      <div className="opt-grid">
        {WEATHERS.map(w => (
          <div key={w.id} className={`opt ${weather === w.id ? 'on' : ''}`} onClick={() => setWeather(w.id)}>
            {w.label}<span className="s">{w.s}</span>
          </div>
        ))}
      </div>

      <h2 className="section">Difficulty</h2>
      <div className="opt-grid">
        {[
          { id: 'amateur', l: 'Amateur', s: 'Opponents hesitate' },
          { id: 'semipro', l: 'Semi-Pro', s: 'Some sharpness' },
          { id: 'pro', l: 'Professional', s: 'True to the sim' },
          { id: 'elite', l: 'Elite', s: 'Sharper decisions' },
        ].map(d => (
          <div key={d.id} className={`opt ${difficulty === d.id ? 'on' : ''}`} onClick={() => setDifficulty(d.id)}>
            {d.l}<span className="s">{d.s}</span>
          </div>
        ))}
      </div>
      <p className="tiny dim2 mt-s">
        Difficulty changes how well the opposition <em>decides</em> — their decision noise and
        reaction latency. It never gives them attributes they don't have.
      </p>

      <h2 className="section">Half Length</h2>
      <div className="row">
        <input type="range" min="2" max="15" step="1" value={halfMinutes}
               onChange={e => setHalfMinutes(+e.target.value)} style={{ maxWidth: 320 }} />
        <span className="mono" style={{ minWidth: 90 }}>{halfMinutes} min halves</span>
        <span className="tiny dim2">(compressed — shown as a 90-minute clock)</span>
      </div>

      <div className="row mt-l">
        <button className="btn primary lg" onClick={start}>Kick Off</button>
      </div>
    </>
  );
}

function CareerSetup({ onCareer }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState(POS.CM);
  const [age, setAge] = useState(18);
  const [level, setLevel] = useState(70);
  const [difficulty, setDifficulty] = useState('pro');

  return (
    <>
      <div className="grid g2">
        <div className="card">
          <h2 className="section" style={{ marginTop: 0 }}>Your Player</h2>
          <div className="grid g2" style={{ gap: 10 }}>
            <label className="field">
              <span className="lab">First Name</span>
              <input type="text" value={firstName} placeholder="Random"
                     onChange={e => setFirstName(e.target.value)} />
            </label>
            <label className="field">
              <span className="lab">Surname</span>
              <input type="text" value={lastName} placeholder="Random"
                     onChange={e => setLastName(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="lab">Starting Age — {age}</span>
            <input type="range" min="16" max="30" value={age} onChange={e => setAge(+e.target.value)} />
            <span className="tiny dim2">
              {age <= 19 ? 'Long career, big development ceiling, hard to get games.'
                : age <= 24 ? 'A ready-made prospect with room to grow.'
                : 'Established now, but the physical decline starts soon.'}
            </span>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="lab">Starting Level</span>
            <select value={level} onChange={e => setLevel(+e.target.value)}>
              <option value={64}>Lower league — start from nothing</option>
              <option value={70}>Mid table — a real chance</option>
              <option value={76}>Strong club — fight for your place</option>
              <option value={82}>Elite club — you may not play at all</option>
            </select>
          </label>
        </div>

        <div className="card">
          <h2 className="section" style={{ marginTop: 0 }}>Position</h2>
          <div className="opt-grid">
            {POSITIONS.map(p => (
              <div key={p.id} className={`opt ${position === p.id ? 'on' : ''}`} onClick={() => setPosition(p.id)}>
                {p.id}<span className="s">{p.label}</span>
              </div>
            ))}
          </div>
          <h2 className="section">Difficulty</h2>
          <div className="opt-grid">
            {['amateur', 'semipro', 'pro', 'elite'].map(d => (
              <div key={d} className={`opt ${difficulty === d ? 'on' : ''}`} onClick={() => setDifficulty(d)}>
                {d[0].toUpperCase() + d.slice(1)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt">
        <h2 className="section" style={{ marginTop: 0 }}>How progression works</h2>
        <p className="small dim" style={{ lineHeight: 1.6, margin: 0 }}>
          There is no experience bar. Your attributes move because of the actions you complete in
          matches — passes you land train your passing and vision, tackles you win train your
          tackling, sprints you make build your stamina. Training between matches lets you target
          specific areas but costs fatigue, and a tired player trains badly and picks up injuries.
          Every attribute has its own ceiling based on your potential and how central it is to your
          position, so a centre-back will never develop a striker's finishing. Your manager picks
          the side on trust, form and fitness; play well and you keep the shirt.
        </p>
      </div>

      <div className="row mt-l">
        <button className="btn primary lg" onClick={() => onCareer({
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          position, age, startingLevel: level, difficulty,
          seed: (Math.random() * 0xffffffff) >>> 0,
        })}>Begin Career</button>
      </div>
    </>
  );
}

export function SettingsPanel({ settings, setSettings }) {
  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));
  return (
    <>
      <h2 className="section" style={{ marginTop: 0 }}>Graphics Quality</h2>
      <div className="opt-grid">
        {[
          { id: 'low', l: 'Low', s: 'No shadows, small crowd' },
          { id: 'medium', l: 'Medium', s: 'Shadows, 2.6k crowd' },
          { id: 'high', l: 'High', s: 'Full shadows, 5.2k crowd' },
        ].map(q => (
          <div key={q.id} className={`opt ${settings.quality === q.id ? 'on' : ''}`} onClick={() => set('quality', q.id)}>
            {q.l}<span className="s">{q.s}</span>
          </div>
        ))}
      </div>

      <h2 className="section">Camera</h2>
      <div className="opt-grid">
        {[
          { id: 'player', l: 'Player', s: 'Behind your footballer' },
          { id: 'firstPerson', l: 'First Person', s: 'Through their eyes' },
          { id: 'broadcast', l: 'Broadcast', s: 'TV touchline' },
          { id: 'tactical', l: 'Tactical', s: 'High and wide' },
        ].map(c => (
          <div key={c.id} className={`opt ${settings.camera === c.id ? 'on' : ''}`} onClick={() => set('camera', c.id)}>
            {c.l}<span className="s">{c.s}</span>
          </div>
        ))}
      </div>

      <h2 className="section">Audio</h2>
      <div className="card">
        <div className="spread mb">
          <span>Master volume</span>
          <input type="range" min="0" max="1" step="0.05" value={settings.volume}
                 onChange={e => set('volume', +e.target.value)} style={{ maxWidth: 260 }} />
          <span className="mono" style={{ minWidth: 42, textAlign: 'right' }}>{Math.round(settings.volume * 100)}%</span>
        </div>
        <Toggle label="Crowd and stadium audio" on={settings.audio} onChange={v => set('audio', v)} />
      </div>

      <h2 className="section">Gameplay</h2>
      <div className="card">
        <Toggle label="Auto-switch to the nearest player" on={settings.autoSwitch} onChange={v => set('autoSwitch', v)}
                hint="Hands control to whoever the ball is going to. Turn off to stay with one footballer all match." />
        <Toggle label="Show radar" on={settings.radar} onChange={v => set('radar', v)} />
        <Toggle label="Show performance overlay" on={settings.perf} onChange={v => set('perf', v)} />
        <Toggle label="Touch controls" on={settings.touch} onChange={v => set('touch', v)}
                hint="On-screen stick and buttons for phones and tablets." />
      </div>
    </>
  );
}

function Toggle({ label, on, onChange, hint }) {
  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
      <div className="spread">
        <div>
          <div style={{ fontSize: 13.5 }}>{label}</div>
          {hint && <div className="tiny dim2" style={{ marginTop: 3, maxWidth: 420 }}>{hint}</div>}
        </div>
        <button className={`btn sm ${on ? 'primary' : 'ghost'}`} onClick={() => onChange(!on)}
                style={{ minWidth: 58 }}>{on ? 'On' : 'Off'}</button>
      </div>
    </div>
  );
}

function ControlsPanel() {
  const rows = [
    ['Move', 'W A S D  /  Arrows', 'Left stick'],
    ['Sprint (hold)', 'Shift', 'RT / R2'],
    ['Pass', 'Space', 'B / Circle'],
    ['Through ball', 'E', 'X / Square'],
    ['Lofted pass (hold to charge)', 'Q', 'Y / Triangle'],
    ['Cross', 'C', 'RB / R1'],
    ['Shoot (hold to charge)', 'F', 'A / Cross'],
    ['Tackle / press', 'J', 'B / Circle'],
    ['Slide tackle', 'K', 'A / Cross'],
    ['Call for the ball (hold)', 'G', 'LB / L1'],
    ['Switch player', 'V', 'Select'],
    ['Change camera', 'B', '—'],
    ['Toggle radar', 'M', '—'],
    ['Pause', 'Esc', 'Start'],
  ];
  return (
    <>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Action</th><th>Keyboard</th><th>Gamepad</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r[0]}>
                <td>{r[0]}</td>
                <td className="mono dim">{r[1]}</td>
                <td className="mono dim2">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card mt">
        <h2 className="section" style={{ marginTop: 0 }}>Playing well</h2>
        <ul className="small dim" style={{ lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
          <li>Aim matters. Passes go where you are pointing — the game picks the best teammate in
              that direction, it does not pick for you.</li>
          <li>You are one of eleven. If you abandon your position, the space you left is real and
              the opposition will use it. Nobody covers for you automatically.</li>
          <li>Sprinting drains stamina fast, and a tired player's first touch, passing and top
              speed all degrade. Recover when the ball is elsewhere.</li>
          <li>Hold shoot or lofted pass to build power, and release. Short taps are placed passes.</li>
          <li>Sliding when you are not close enough is a foul, and a second yellow is a red.</li>
        </ul>
      </div>
    </>
  );
}
