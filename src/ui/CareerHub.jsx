import React, { useState, useMemo } from 'react';
import { TRAINING_DRILLS } from '../career/career.js';
import { overall } from '../sim/attributes.js';

// ---------------------------------------------------------------------------
// CAREER HUB
//
// The between-matches screen: pick training, see whether you are in the side,
// track objectives, the league table and how your attributes are moving.
// ---------------------------------------------------------------------------

export function CareerHub({ career, attributes, onPlayMatch, onSimMatch, onSave, onQuit, lastResult }) {
  const [tab, setTab] = useState('week');
  const [plan, setPlan] = useState(career.trainingPlan);
  const [trainingResult, setTrainingResult] = useState(null);
  const [, force] = useState(0);

  const p = career.player;
  const fixture = career.currentFixture();
  const opponent = fixture ? (fixture.home === career.club ? fixture.away : fixture.home) : null;
  const isHome = fixture ? fixture.home === career.club : true;
  const ovr = overall(attributes, p.position);
  const selection = useMemo(
    () => career.weeklyTrainingDone ? career.selectionDecision() : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [career.weeklyTrainingDone, trainingResult]
  );

  const runTraining = () => {
    career.trainingPlan = plan;
    const gains = career.runTraining(plan, attributes);
    setTrainingResult(gains);
    onSave?.();
    force(v => v + 1);
  };

  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="spread mb">
          <div>
            <div className="brand">Career · Season {career.season}</div>
            <h1 className="title" style={{ fontSize: 34, marginBottom: 2 }}>{career.fullName}</h1>
            <div className="dim small">
              {p.position} · {career.club.name} · Age {p.age} ·
              <strong style={{ color: '#e8edf4' }}> OVR {ovr}</strong>
              <span className="dim2"> / potential {p.potential}</span>
            </div>
          </div>
          <div className="row">
            <button className="btn ghost sm" onClick={onSave}>Save</button>
            <button className="btn ghost sm" onClick={onQuit}>Main Menu</button>
          </div>
        </div>

        <div className="grid g4 mb">
          <Stat label="Form" value={formLabel(p.form)} tone={p.form > 0.25 ? 'good' : p.form < -0.25 ? 'bad' : ''} />
          <Stat label="Fitness" value={`${Math.round((1 - p.fatigue) * 100)}%`} tone={p.fatigue > 0.7 ? 'bad' : p.fatigue > 0.45 ? 'warn' : 'good'} />
          <Stat label="Manager trust" value={`${Math.round(p.managerTrust * 100)}%`} tone={p.managerTrust > 0.6 ? 'good' : p.managerTrust < 0.3 ? 'bad' : ''} />
          <Stat label="Reputation" value={Math.round(p.reputation)} />
        </div>

        {p.injury && (
          <div className="card mb" style={{ borderColor: 'rgba(255,77,94,.4)' }}>
            <strong style={{ color: '#ff98a3' }}>➕ {p.injury.name}</strong>
            <span className="dim small"> — out for roughly {p.injury.weeks} more week(s). You cannot be selected.</span>
          </div>
        )}

        {lastResult && <LastMatchCard result={lastResult} />}

        <div className="tabs">
          <button className={`tab ${tab === 'week' ? 'on' : ''}`} onClick={() => setTab('week')}>This Week</button>
          <button className={`tab ${tab === 'objectives' ? 'on' : ''}`} onClick={() => setTab('objectives')}>Objectives</button>
          <button className={`tab ${tab === 'attributes' ? 'on' : ''}`} onClick={() => setTab('attributes')}>Attributes</button>
          <button className={`tab ${tab === 'table' ? 'on' : ''}`} onClick={() => setTab('table')}>League</button>
          <button className={`tab ${tab === 'history' ? 'on' : ''}`} onClick={() => setTab('history')}>History</button>
          {career.transferOffers.length > 0 &&
            <button className={`tab ${tab === 'transfers' ? 'on' : ''}`} onClick={() => setTab('transfers')}>
              Transfers ({career.transferOffers.length})
            </button>}
        </div>

        {tab === 'week' && (
          <>
            <div className="grid g2">
              <div className="card">
                <h2 className="section" style={{ marginTop: 0 }}>Training — week {career.week}</h2>
                <p className="small dim" style={{ marginTop: 0 }}>
                  Choose four sessions. Hard work develops you faster but leaves you tired for the
                  match, and fatigue both hurts your performance and raises your injury risk.
                </p>
                <div className="opt-grid">
                  {Object.entries(TRAINING_DRILLS).map(([key, d]) => {
                    const count = plan.filter(x => x === key).length;
                    return (
                      <div key={key} className={`opt ${count ? 'on' : ''}`}
                           onClick={() => {
                             if (career.weeklyTrainingDone) return;
                             setPlan(prev => {
                               const i = prev.indexOf(key);
                               if (i >= 0) return prev.filter((_, j) => j !== i);
                               if (prev.length >= 4) return [...prev.slice(1), key];
                               return [...prev, key];
                             });
                           }}>
                        {d.label}
                        <span className="s">
                          {count > 1 ? `×${count} · ` : ''}
                          {d.fatigue > 0 ? `+${Math.round(d.fatigue * 100)} fatigue` : `${Math.round(d.fatigue * 100)} fatigue`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="row mt">
                  <button className="btn primary" disabled={career.weeklyTrainingDone || plan.length === 0}
                          onClick={runTraining}>
                    {career.weeklyTrainingDone ? 'Training complete' : `Train (${plan.length}/4)`}
                  </button>
                  {!career.weeklyTrainingDone &&
                    <span className="tiny dim2">Projected fatigue after: {Math.round(Math.min(1, p.fatigue + plan.reduce((a, k) => a + TRAINING_DRILLS[k].fatigue, 0)) * 100)}%</span>}
                </div>
                {trainingResult && Object.keys(trainingResult).length > 0 && (
                  <div className="mt">
                    <div className="tiny dim2 mb">Development this week</div>
                    <div className="row" style={{ gap: 6 }}>
                      {Object.entries(trainingResult)
                        .filter(([, g]) => g > 0.005)
                        .sort((a, b) => b[1] - a[1]).slice(0, 8)
                        .map(([a, g]) => (
                          <span key={a} className="pill good">{a} +{g.toFixed(2)}</span>
                        ))}
                      {Object.values(trainingResult).every(g => g <= 0.005) &&
                        <span className="tiny dim2">No measurable gain — you are at your ceiling in these areas.</span>}
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <h2 className="section" style={{ marginTop: 0 }}>Next fixture</h2>
                {opponent ? (
                  <>
                    <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>
                      {isHome ? 'vs' : 'away to'} {opponent.name}
                    </div>
                    <div className="dim small mb">
                      {isHome ? 'Home' : 'Away'} · Opponent rating {opponent.rating} ·
                      Matchweek {career.week} of {career.fixtures.length}
                    </div>

                    {!career.weeklyTrainingDone ? (
                      <div className="card" style={{ background: 'rgba(255,176,32,.08)', borderColor: 'rgba(255,176,32,.25)' }}>
                        <span className="small">Complete this week's training to find out if you have been selected.</span>
                      </div>
                    ) : (
                      <>
                        <div className="card mb" style={{
                          background: selection.starting ? 'rgba(53,212,122,.1)' : 'rgba(255,255,255,.03)',
                          borderColor: selection.starting ? 'rgba(53,212,122,.3)' : undefined,
                        }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            {selection.starting ? '✓ Selected to start' : selection.benched ? 'On the bench' : '✕ Not in the squad'}
                          </div>
                          <div className="tiny dim">{selection.reason}</div>
                        </div>
                        <div className="row">
                          <button className="btn primary lg" disabled={!selection.starting && !selection.benched}
                                  onClick={() => onPlayMatch(selection)}>
                            {selection.starting ? 'Play Match' : selection.benched ? 'Play (from the bench)' : 'Cannot play'}
                          </button>
                          <button className="btn" onClick={() => onSimMatch(selection)}>
                            Simulate
                          </button>
                        </div>
                        <p className="tiny dim2 mt-s">
                          Simulating still runs the full match engine — your player is controlled by
                          the AI, and the result and your rating are real.
                        </p>
                      </>
                    )}
                  </>
                ) : <p className="dim">Season complete.</p>}
              </div>
            </div>

            {career.news.length > 0 && (
              <>
                <h2 className="section">News</h2>
                <div className="card">
                  {career.news.slice(0, 8).map((n, i) => (
                    <div key={i} className="kv">
                      <span className="k small">{n.text}</span>
                      <span className="v tiny dim2">S{n.season} W{n.week}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'objectives' && (
          <div className="card">
            <h2 className="section" style={{ marginTop: 0 }}>Season objectives</h2>
            {career.objectives.map(o => {
              const pctv = Math.min(100, (o.progress / o.target) * 100);
              return (
                <div key={o.id} style={{ marginBottom: 15 }}>
                  <div className="spread" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {o.awarded ? '✓ ' : ''}{o.label}
                    </span>
                    <span className="mono small dim">
                      {typeof o.progress === 'number' ? o.progress.toFixed(o.stat === 'rating' ? 2 : o.stat === 'passPct' ? 0 : 0) : 0} / {o.target}
                    </span>
                  </div>
                  <div className="bar" style={{ height: 7 }}>
                    <i style={{ width: `${pctv}%`, background: o.awarded ? '#35d47a' : '#59a8ff' }} />
                  </div>
                </div>
              );
            })}
            <p className="tiny dim2">
              Completing objectives raises your standing with the manager and your morale. They
              reset each season and get harder as your reputation grows.
            </p>
          </div>
        )}

        {tab === 'attributes' && <AttributesPanel career={career} attributes={attributes} />}
        {tab === 'table' && <LeagueTable career={career} />}
        {tab === 'history' && <HistoryPanel career={career} />}
        {tab === 'transfers' && <TransfersPanel career={career} onAccept={(o) => { career.acceptOffer(o); onSave?.(); force(v => v + 1); setTab('week'); }} />}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="tiny dim2" style={{ letterSpacing: '.1em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 800, marginTop: 2,
        color: tone === 'good' ? '#35d47a' : tone === 'bad' ? '#ff4d5e' : tone === 'warn' ? '#ffb020' : undefined,
      }}>{value}</div>
    </div>
  );
}

function formLabel(f) {
  if (f > 0.55) return 'Excellent';
  if (f > 0.22) return 'Good';
  if (f > -0.22) return 'Average';
  if (f > -0.55) return 'Poor';
  return 'Terrible';
}

function LastMatchCard({ result }) {
  const s = result.playerStats;
  return (
    <div className="card mb" style={{ borderColor: 'rgba(89,168,255,.28)' }}>
      <div className="spread">
        <div>
          <div className="tiny dim2" style={{ letterSpacing: '.1em', textTransform: 'uppercase' }}>Last match</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {result.home ? 'vs' : 'at'} {result.opponent} — {result.score[0]}-{result.score[1]}
            <span className={`pill ${result.result === 'W' ? 'good' : result.result === 'L' ? 'bad' : ''}`}
                  style={{ marginLeft: 8 }}>{result.result}</span>
          </div>
        </div>
        {result.played && s && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.rating >= 7 ? '#35d47a' : s.rating >= 6 ? '#e8edf4' : '#ff4d5e' }}>
              {s.rating.toFixed(1)}
            </div>
            <div className="tiny dim2">{result.minutes}′ played{result.motm ? ' · MOTM' : ''}</div>
          </div>
        )}
      </div>
      {result.played && s && (
        <div className="row mt-s" style={{ gap: 6 }}>
          {s.goals > 0 && <span className="pill good">{s.goals} goal{s.goals > 1 ? 's' : ''}</span>}
          {s.assists > 0 && <span className="pill good">{s.assists} assist{s.assists > 1 ? 's' : ''}</span>}
          <span className="pill">{s.passesCompleted}/{s.passes} passes</span>
          {s.shots > 0 && <span className="pill">{s.shots} shots</span>}
          {s.tacklesWon > 0 && <span className="pill">{s.tacklesWon} tackles won</span>}
          {s.interceptions > 0 && <span className="pill">{s.interceptions} interceptions</span>}
          {s.saves > 0 && <span className="pill">{s.saves} saves</span>}
          <span className="pill">{(s.distance / 1000).toFixed(1)} km</span>
        </div>
      )}
      {result.development && Object.keys(result.development).length > 0 && (
        <div className="mt-s">
          <div className="tiny dim2 mb">Development from this performance</div>
          <div className="row" style={{ gap: 5 }}>
            {Object.entries(result.development).map(([a, g]) => (
              <span key={a} className={`pill ${g > 0 ? 'good' : 'bad'}`}>
                {a} {g > 0 ? '+' : ''}{g.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AttributesPanel({ career, attributes }) {
  const p = career.player;
  const ceilings = career.ceilingsFor(attributes);
  const groups = {
    Physical: ['pace', 'acceleration', 'agility', 'stamina', 'strength', 'reactions'],
    Technical: ['passing', 'technique', 'dribbling', 'shooting', 'finishing', 'heading', 'crossing'],
    Defensive: ['tackling', 'marking', 'interception', 'positioning'],
    Mental: ['vision', 'decisions', 'composure', 'teamwork', 'workrate', 'aggression'],
    Goalkeeping: ['reflexes', 'handling', 'gkPositioning'],
  };
  return (
    <>
      <div className="card mb">
        <div className="spread">
          <span className="dim small">Current overall</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{overall(attributes, p.position)}</span>
        </div>
        <div className="bar mt-s" style={{ height: 8 }}>
          <i style={{
            width: `${((overall(attributes, p.position) - 40) / (p.potential - 40)) * 100}%`,
            background: 'linear-gradient(90deg,#35d47a,#59a8ff)',
          }} />
        </div>
        <div className="spread tiny dim2 mt-s">
          <span>Started at {p.startingOverall ?? '—'}</span>
          <span>Potential {p.potential}</span>
        </div>
      </div>
      {Object.entries(groups).map(([g, keys]) => {
        const present = keys.filter(k => attributes[k] != null);
        if (!present.length) return null;
        if (g === 'Goalkeeping' && p.position !== 'GK') return null;
        return (
          <div key={g} className="card mb">
            <h2 className="section" style={{ marginTop: 0 }}>{g}</h2>
            <div className="attr-grid">
              {present.map(k => {
                const v = attributes[k];
                const ceil = ceilings[k] ?? v;
                const room = Math.max(0, ceil - v);
                return (
                  <div key={k} className="attr">
                    <div>
                      <span className="an">{k.replace(/([A-Z])/g, ' $1')}</span>
                      <div className="bar" style={{ height: 4, marginTop: 3 }}>
                        <i style={{ width: `${v}%`, background: attrColor(v) }} />
                        {room > 0.5 && <i style={{
                          width: `${Math.min(99, ceil) - v}%`, marginTop: -4,
                          marginLeft: `${v}%`, background: 'rgba(89,168,255,.35)',
                        }} />}
                      </div>
                    </div>
                    <span className="av" style={{ color: attrColor(v) }}>{Math.round(v)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="tiny dim2">
        The faint blue extension on each bar is the ceiling for that attribute — how far it can
        still develop given your potential and how central it is to playing {p.position}.
      </p>
    </>
  );
}

function attrColor(v) {
  return v >= 82 ? '#35d47a' : v >= 70 ? '#8fd66f' : v >= 58 ? '#e8edf4' : v >= 45 ? '#ffb020' : '#ff4d5e';
}

function LeagueTable({ career }) {
  return (
    <div className="card">
      <table className="tbl">
        <thead>
          <tr>
            <th>#</th><th>Club</th><th className="num">P</th><th className="num">W</th>
            <th className="num">D</th><th className="num">L</th><th className="num">GF</th>
            <th className="num">GA</th><th className="num">GD</th><th className="num">Pts</th>
          </tr>
        </thead>
        <tbody>
          {career.league.map((t, i) => (
            <tr key={t.club.name} className={t.club === career.club ? 'me' : ''}>
              <td className="dim2 mono">{i + 1}</td>
              <td>{t.club.name}</td>
              <td className="num">{t.played}</td><td className="num">{t.won}</td>
              <td className="num">{t.drawn}</td><td className="num">{t.lost}</td>
              <td className="num dim">{t.gf}</td><td className="num dim">{t.ga}</td>
              <td className="num dim">{t.gf - t.ga > 0 ? '+' : ''}{t.gf - t.ga}</td>
              <td className="num" style={{ fontWeight: 800 }}>{t.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryPanel({ career }) {
  const ss = career.player.seasonStats;
  const cs = career.player.careerStats;
  return (
    <>
      <div className="grid g2 mb">
        <div className="card">
          <h2 className="section" style={{ marginTop: 0 }}>This season</h2>
          <SeasonStats s={ss} />
        </div>
        <div className="card">
          <h2 className="section" style={{ marginTop: 0 }}>Career total</h2>
          <SeasonStats s={cs} />
        </div>
      </div>

      {career.seasonHistory.length > 0 && (
        <div className="card mb">
          <h2 className="section" style={{ marginTop: 0 }}>Previous seasons</h2>
          <table className="tbl">
            <thead><tr><th>Season</th><th>Club</th><th className="num">Pos</th><th className="num">Apps</th><th className="num">G</th><th className="num">A</th><th className="num">Avg</th></tr></thead>
            <tbody>
              {career.seasonHistory.map(s => (
                <tr key={s.season}>
                  <td>{s.season}</td><td className="dim">{s.club}</td>
                  <td className="num">{s.leaguePosition}</td><td className="num">{s.apps}</td>
                  <td className="num">{s.goals}</td><td className="num">{s.assists}</td>
                  <td className="num">{s.avgRating.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2 className="section" style={{ marginTop: 0 }}>Recent matches</h2>
        <table className="tbl">
          <thead><tr><th>Wk</th><th>Opponent</th><th className="num">Score</th><th className="num">Min</th><th className="num">Rating</th></tr></thead>
          <tbody>
            {[...career.history].reverse().slice(0, 15).map((h, i) => (
              <tr key={i}>
                <td className="dim2 mono">{h.season}·{h.week}</td>
                <td>{h.home ? '' : '@ '}{h.opponent}</td>
                <td className="num mono">{h.score[0]}-{h.score[1]}</td>
                <td className="num dim">{h.played ? `${h.minutes}′` : '—'}</td>
                <td className="num" style={{ color: h.rating ? (h.rating >= 7 ? '#35d47a' : h.rating >= 6 ? undefined : '#ff4d5e') : undefined }}>
                  {h.rating ? h.rating.toFixed(1) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SeasonStats({ s }) {
  const rows = [
    ['Appearances', s.apps], ['Starts', s.started], ['Minutes', s.minutes],
    ['Goals', s.goals], ['Assists', s.assists],
    ['Pass accuracy', s.passes ? `${Math.round((s.passesCompleted / s.passes) * 100)}%` : '—'],
    ['Key passes', s.keyPasses], ['Tackles won', s.tacklesWon],
    ['Interceptions', s.interceptions],
    ['Average rating', s.apps ? (s.ratingSum / s.apps).toFixed(2) : '—'],
    ['Man of the match', s.motm],
    ['Distance', `${(s.distance / 1000).toFixed(1)} km`],
  ];
  return rows.map(r => (
    <div className="kv" key={r[0]}><span className="k">{r[0]}</span><span className="v">{r[1]}</span></div>
  ));
}

function TransfersPanel({ career, onAccept }) {
  return (
    <>
      <p className="dim small">
        Clubs that have made an approach. Moving up a level means tougher competition for places —
        your manager's trust resets to match your new standing in the squad.
      </p>
      <div className="grid g2">
        {career.transferOffers.map((o, i) => (
          <div key={i} className="card">
            <div className="spread">
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{o.club.name}</div>
                <div className="tiny dim">{o.club.city} · Rating {o.club.rating}</div>
              </div>
              <span className={`pill ${o.better ? 'good' : ''}`}>{o.role}</span>
            </div>
            <div className="kv mt-s"><span className="k">Wage</span><span className="v">{o.wage}k / week</span></div>
            <div className="kv"><span className="k">Current club</span><span className="v">{career.club.name} ({career.club.rating})</span></div>
            <button className="btn primary block mt" onClick={() => onAccept(o)}>Accept</button>
          </div>
        ))}
      </div>
      <button className="btn ghost mt" onClick={() => { career.transferOffers = []; }}>Reject all and stay</button>
    </>
  );
}
