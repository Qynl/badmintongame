import React, { useState, useMemo } from 'react';
import { FORMATIONS, PRESETS } from '../sim/formations.js';
import { PITCH } from '../sim/constants.js';
import { overall } from '../sim/attributes.js';
import { SettingsPanel } from './MainMenu.jsx';

export function PauseMenu({ match, onResume, onQuit, settings, setSettings, gameLoopRef }) {
  const [tab, setTab] = useState('tactics');
  return (
    <div className="overlay">
      <div className="box">
        <div className="spread mb">
          <div>
            <h3>Paused</h3>
            <p className="hint" style={{ margin: 0 }}>
              {match.teams[0].name} {match.score[0]} – {match.score[1]} {match.teams[1].name}
            </p>
          </div>
          <button className="btn primary" onClick={onResume}>Resume</button>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'tactics' ? 'on' : ''}`} onClick={() => setTab('tactics')}>Tactics</button>
          <button className={`tab ${tab === 'squad' ? 'on' : ''}`} onClick={() => setTab('squad')}>Squad</button>
          <button className={`tab ${tab === 'stats' ? 'on' : ''}`} onClick={() => setTab('stats')}>Stats</button>
          <button className={`tab ${tab === 'settings' ? 'on' : ''}`} onClick={() => setTab('settings')}>Settings</button>
        </div>

        {tab === 'tactics' && <TacticsPanel match={match} />}
        {tab === 'squad' && <SquadPanel match={match} gameLoopRef={gameLoopRef} />}
        {tab === 'stats' && <StatsPanel match={match} />}
        {tab === 'settings' && <SettingsPanel settings={settings} setSettings={setSettings} />}

        <div className="row mt-l">
          <button className="btn primary" onClick={onResume}>Resume Match</button>
          <button className="btn danger" onClick={onQuit}>Abandon Match</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function TacticsPanel({ match, teamIndex }) {
  const idx = teamIndex ?? match.humanTeam ?? 0;
  const team = match.teams[idx];
  const [, force] = useState(0);
  const t = team.tactics;

  const apply = (fn) => { fn(); team.brain?.onTacticsChanged?.(); force(v => v + 1); };

  const sliders = [
    ['mentality', 'Mentality', 'Defensive', 'Attacking',
      'How far the whole team commits forward. High mentality pushes fullbacks on and leaves space behind.'],
    ['defensiveLine', 'Defensive Line', 'Deep', 'High',
      'Where the back line sits. A high line squeezes the pitch and creates offsides, but is exposed to balls in behind.'],
    ['pressing', 'Pressing', 'Contain', 'Press Hard',
      'How aggressively players leave their position to close the ball down. Costs stamina.'],
    ['width', 'Width', 'Narrow', 'Wide',
      'How far apart the team spreads. Width stretches the opposition; narrow packs the middle.'],
    ['tempo', 'Tempo', 'Patient', 'Fast',
      'How quickly players look to move the ball on rather than settle it.'],
    ['directness', 'Directness', 'Build Up', 'Direct',
      'Whether the team plays out through the lines or goes long earlier.'],
    ['compactness', 'Compactness', 'Spread', 'Compact',
      'Distance between the units out of possession.'],
    ['counter', 'Counter Attack', 'Rebuild', 'Break Fast',
      'How eagerly the team breaks the moment it wins the ball back.'],
  ];

  return (
    <>
      <div className="grid g2">
        <div>
          <h2 className="section" style={{ marginTop: 0 }}>Shape</h2>
          <FormationPitch team={team} />
          <label className="field mt">
            <span className="lab">Formation</span>
            <select value={t.formation} onChange={e => apply(() => {
              match.applyFormation(idx, e.target.value);
            })}>
              {Object.keys(FORMATIONS).map(f => <option key={f} value={f}>{f} — {FORMATIONS[f].style}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="lab">Preset Style</span>
            <select value={t.presetName ?? ''} onChange={e => apply(() => {
              Object.assign(t, PRESETS[e.target.value]);
              t.presetName = e.target.value;
            })}>
              {Object.keys(PRESETS).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>

        <div>
          <h2 className="section" style={{ marginTop: 0 }}>Instructions</h2>
          {sliders.map(([key, label, lo, hi, hint]) => (
            <div key={key} style={{ marginBottom: 13 }}>
              <div className="spread" style={{ marginBottom: 3 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
                <span className="mono tiny dim">{Math.round((t[key] ?? 0.5) * 100)}</span>
              </div>
              <input type="range" min="0" max="1" step="0.02" value={t[key] ?? 0.5}
                     onChange={e => apply(() => { t[key] = +e.target.value; t.presetName = 'Custom'; })} />
              <div className="spread tiny dim2"><span>{lo}</span><span>{hi}</span></div>
              <div className="tiny dim2" style={{ marginTop: 3, lineHeight: 1.4 }}>{hint}</div>
            </div>
          ))}
        </div>
      </div>
      <p className="tiny dim2 mt">
        Changes apply immediately. The team AI re-evaluates its block, pressing triggers and
        support runs from these numbers every tenth of a second — you will see the shape move.
      </p>
    </>
  );
}

function FormationPitch({ team }) {
  const players = team.players.filter(p => p.onPitch);
  return (
    <div className="tactics-pitch">
      <div className="tp-line" style={{ left: '50%', top: 0, bottom: 0, width: 1 }} />
      <div className="tp-line" style={{ left: '50%', top: '50%', width: 60, height: 60, marginLeft: -30, marginTop: -30, borderRadius: '50%', background: 'none', border: '1px solid rgba(255,255,255,.22)' }} />
      {players.map(p => {
        // Team 0 attacks +X. Draw so the human team always attacks right.
        const dir = team.index === 0 ? 1 : -1;
        const left = ((p.homeX ?? p.x) * dir / PITCH.length + 0.5) * 100;
        const top = ((p.homeZ ?? p.z) * dir / PITCH.width + 0.5) * 100;
        return (
          <div key={p.id} className="tp-dot"
               style={{
                 left: `${Math.max(3, Math.min(97, left))}%`,
                 top: `${Math.max(6, Math.min(94, top))}%`,
                 background: team.colors.primary,
                 color: contrast(team.colors.primary),
               }}>
            {p.shirt}
            <span className="pn">{p.position}</span>
          </div>
        );
      })}
    </div>
  );
}

function contrast(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return (r * 0.299 + g * 0.587 + b * 0.114) > 0.55 ? '#111' : '#fff';
}

// ---------------------------------------------------------------------------
function SquadPanel({ match, gameLoopRef }) {
  const idx = match.humanTeam ?? 0;
  const team = match.teams[idx];
  const [, force] = useState(0);
  const [subOff, setSubOff] = useState(null);

  const onPitch = team.players.filter(p => p.onPitch);
  const bench = team.bench.filter(p => !p.onPitch && !p.sentOff);
  const subsLeft = 5 - (team.subsUsed ?? 0);

  const doSub = (on) => {
    if (!subOff || subsLeft <= 0) return;
    match.makeSubstitution(team, subOff, on);
    setSubOff(null);
    force(v => v + 1);
  };

  const takeControl = (p) => {
    match.setHumanPlayer(p.id);
    gameLoopRef?.current?.renderer.setHuman(p.id);
    force(v => v + 1);
  };

  return (
    <>
      <div className="spread mb">
        <h2 className="section" style={{ margin: 0 }}>On the pitch</h2>
        <span className="pill">{subsLeft} substitutions left</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>#</th><th>Player</th><th>Pos</th><th className="num">OVR</th>
            <th className="num">Rating</th><th className="num">Stam</th>
            <th className="num">Passes</th><th className="num">Tkl</th><th />
          </tr>
        </thead>
        <tbody>
          {onPitch.map(p => (
            <tr key={p.id} className={p === match.human ? 'me' : ''}>
              <td className="mono dim2">{p.shirt}</td>
              <td>{p.name}{p.yellow ? ' 🟨' : ''}{p.injury > 0 ? ' ➕' : ''}</td>
              <td className="dim">{p.position}</td>
              <td className="num">{overall(p.attrs, p.position)}</td>
              <td className="num" style={{ color: ratingColor(p.stats.rating) }}>{p.stats.rating.toFixed(1)}</td>
              <td className="num" style={{ color: p.stamina < 30 ? '#ff4d5e' : p.stamina < 55 ? '#ffb020' : undefined }}>
                {Math.round(p.stamina)}
              </td>
              <td className="num dim">{p.stats.passesCompleted}/{p.stats.passes}</td>
              <td className="num dim">{p.stats.tacklesWon}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {p !== match.human && (
                  <button className="btn sm ghost" onClick={() => takeControl(p)}>Control</button>
                )}
                {' '}
                <button className={`btn sm ${subOff === p ? 'primary' : 'ghost'}`}
                        disabled={subsLeft <= 0}
                        onClick={() => setSubOff(subOff === p ? null : p)}>
                  {subOff === p ? 'Off ✓' : 'Sub'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section">Bench</h2>
      {subOff && <p className="small" style={{ color: '#ffcc70' }}>Choose a replacement for {subOff.name}.</p>}
      <table className="tbl">
        <thead><tr><th>#</th><th>Player</th><th>Pos</th><th className="num">OVR</th><th /></tr></thead>
        <tbody>
          {bench.map(p => (
            <tr key={p.id}>
              <td className="mono dim2">{p.shirt}</td>
              <td>{p.name}</td>
              <td className="dim">{p.position}</td>
              <td className="num">{overall(p.attrs, p.position)}</td>
              <td style={{ textAlign: 'right' }}>
                <button className="btn sm" disabled={!subOff || subsLeft <= 0} onClick={() => doSub(p)}>
                  Bring on
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ratingColor(r) {
  return r >= 7.5 ? '#35d47a' : r >= 6.5 ? '#e8edf4' : r >= 5.5 ? '#ffb020' : '#ff4d5e';
}

// ---------------------------------------------------------------------------
export function StatsPanel({ match }) {
  const s = match.stats;
  const rows = [
    ['Possession', `${s.possession[0]}%`, `${s.possession[1]}%`],
    ['Shots', s.shots[0], s.shots[1]],
    ['On target', s.shotsOnTarget[0], s.shotsOnTarget[1]],
    ['Passes', s.passes[0], s.passes[1]],
    ['Pass accuracy',
      pct(s.passesCompleted[0], s.passes[0]), pct(s.passesCompleted[1], s.passes[1])],
    ['Tackles', s.tackles[0], s.tackles[1]],
    ['Throw-ins', s.throwIns[0], s.throwIns[1]],
    ['Free kicks', s.freeKicks[0], s.freeKicks[1]],
    ['Expected goals', s.xg[0].toFixed(2), s.xg[1].toFixed(2)],
    ['Fouls', s.fouls[0], s.fouls[1]],
    ['Yellow cards', s.yellow[0], s.yellow[1]],
    ['Red cards', s.red[0], s.red[1]],
    ['Corners', s.corners[0], s.corners[1]],
    ['Offsides', s.offsides[0], s.offsides[1]],
    ['Saves', s.saves[0], s.saves[1]],
  ];

  const best = useMemo(() => {
    const all = match.allPlayers.filter(p => p.stats.rating !== 6.0 || p.onPitch);
    return [...all].sort((a, b) => b.stats.rating - a.stats.rating).slice(0, 6);
  }, [match, match.matchSeconds]);

  return (
    <>
      <div className="card">
        <div className="spread mb" style={{ fontWeight: 800, fontSize: 15 }}>
          <span>{match.teams[0].name}</span>
          <span className="mono">{match.score[0]} – {match.score[1]}</span>
          <span>{match.teams[1].name}</span>
        </div>
        {rows.map(r => (
          <div className="spread" key={r[0]} style={{ padding: '5px 0', fontSize: 12.5, borderBottom: '1px solid rgba(255,255,255,.05)' }}>
            <span className="mono" style={{ width: 60, textAlign: 'left', fontWeight: 700 }}>{r[1]}</span>
            <span className="dim">{r[0]}</span>
            <span className="mono" style={{ width: 60, textAlign: 'right', fontWeight: 700 }}>{r[2]}</span>
          </div>
        ))}
      </div>

      <h2 className="section">Top performers</h2>
      <table className="tbl">
        <thead><tr><th>Player</th><th>Team</th><th className="num">Rating</th><th className="num">G</th><th className="num">A</th><th className="num">Pass</th></tr></thead>
        <tbody>
          {best.map(p => (
            <tr key={p.id} className={p === match.human ? 'me' : ''}>
              <td>{p.name}</td>
              <td className="dim">{match.teams[p.team].shortName}</td>
              <td className="num" style={{ color: ratingColor(p.stats.rating) }}>{p.stats.rating.toFixed(1)}</td>
              <td className="num">{p.stats.goals}</td>
              <td className="num">{p.stats.assists}</td>
              <td className="num dim">{p.stats.passesCompleted}/{p.stats.passes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function pct(a, b) { return b > 0 ? `${Math.round((a / b) * 100)}%` : '—'; }
