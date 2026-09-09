import React, { useEffect, useRef, useState, memo } from 'react';
import { PITCH } from '../sim/constants.js';

// ---------------------------------------------------------------------------
// HUD
//
// React renders the chrome; it never renders the 3D scene. To avoid a React
// re-render at 60fps, the high-frequency parts (clock, stamina, radar) mutate
// DOM nodes directly through refs, driven by a callback the game loop calls.
// ---------------------------------------------------------------------------

export function Hud({ match, gameLoopRef, onPause, showRadar, showPerf, touch }) {
  const clockRef = useRef(null);
  const scoreRef = useRef(null);
  const periodRef = useRef(null);
  const staminaRef = useRef(null);
  const staminaValRef = useRef(null);
  const conditionRef = useRef(null);
  const nameRef = useRef(null);
  const numRef = useRef(null);
  const roleRef = useRef(null);
  const ratingRef = useRef(null);
  const radarRef = useRef(null);
  const chargeRef = useRef(null);
  const chargeWrapRef = useRef(null);
  const chargeLabelRef = useRef(null);
  const perfRef = useRef(null);

  const [commentary, setCommentary] = useState(null);
  const [banner, setBanner] = useState(null);
  const [toasts, setToasts] = useState([]);

  // ---- Event-driven UI (low frequency: React state is fine) ----
  useEffect(() => {
    if (!match) return;
    const bus = match.events;
    const offs = [];
    const sub = (n, f) => { offs.push(bus.on(n, f)); };
    let toastId = 0;
    const pushToast = (kind, text) => {
      const id = ++toastId;
      const t = fmtClock(match.matchSeconds, match);
      setToasts((prev) => [...prev.slice(-4), { id, kind, text, t }]);
      setTimeout(() => setToasts((prev) => prev.filter(x => x.id !== id)), 5200);
    };

    sub('commentary', (d) => {
      setCommentary({ text: d.text, id: Math.random() });
    });
    sub('goal', (d) => {
      const t = match.teams[d.team];
      setBanner({
        headline: 'GOAL',
        sub: `${d.scorer?.name ?? ''} — ${t.name} ${match.score[0]}-${match.score[1]}`,
        color: t.colors.primary, id: Math.random(),
      });
      pushToast('goal', `⚽ ${d.scorer?.name ?? 'Goal'} (${t.shortName})`);
      setTimeout(() => setBanner(null), 3800);
    });
    sub('yellowCard', (d) => pushToast('card', `🟨 ${d.player?.name ?? ''}`));
    sub('redCard', (d) => {
      pushToast('red', `🟥 ${d.player?.name ?? ''} sent off`);
      setBanner({ headline: 'RED CARD', sub: d.player?.name ?? '', color: '#ff4d5e', id: Math.random() });
      setTimeout(() => setBanner(null), 3200);
    });
    sub('substitution', (d) => pushToast('sub', `🔁 ${d.on?.name ?? ''} ← ${d.off?.name ?? ''}`));
    sub('injury', (d) => pushToast('card', `➕ ${d.player?.name ?? ''} down injured`));
    sub('offside', (d) => pushToast('', `🚩 Offside — ${d.player?.name ?? ''}`));
    sub('halfTime', () => {
      setBanner({ headline: 'HALF TIME', sub: `${match.teams[0].shortName} ${match.score[0]} - ${match.score[1]} ${match.teams[1].shortName}`, color: '#ffffff', id: Math.random() });
      setTimeout(() => setBanner(null), 4200);
    });
    sub('fullTime', () => {
      setBanner({ headline: 'FULL TIME', sub: `${match.teams[0].shortName} ${match.score[0]} - ${match.score[1]} ${match.teams[1].shortName}`, color: '#ffffff', id: Math.random() });
    });
    return () => { for (const off of offs) off?.(); };
  }, [match]);

  // Commentary auto-clear
  useEffect(() => {
    if (!commentary) return;
    const t = setTimeout(() => setCommentary(null), 4200);
    return () => clearTimeout(t);
  }, [commentary]);

  // ---- High-frequency updates via direct DOM writes ----
  useEffect(() => {
    if (!match || !gameLoopRef?.current) return;
    const loop = gameLoopRef.current;
    let raf;
    let last = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      // 15Hz is plenty for text; the 3D runs at full rate independently.
      if (now - last < 66) return;
      last = now;

      if (clockRef.current) {
        clockRef.current.textContent = fmtClock(match.matchSeconds, match);
        const inAdded = match.matchSeconds > match.halfSeconds * match.half;
        clockRef.current.classList.toggle('added', inAdded);
      }
      if (scoreRef.current) scoreRef.current.textContent = `${match.score[0]} - ${match.score[1]}`;
      if (periodRef.current) periodRef.current.textContent = periodLabel(match);

      const p = match.human;
      if (p) {
        if (nameRef.current && nameRef.current._n !== p.name) {
          nameRef.current.textContent = p.name;
          nameRef.current._n = p.name;
          if (numRef.current) numRef.current.textContent = p.shirt;
          if (roleRef.current) roleRef.current.textContent = `${p.position} · ${p.role ?? ''}`;
        }
        if (staminaRef.current) {
          const s = Math.max(0, Math.min(1, p.stamina));
          staminaRef.current.style.width = `${s * 100}%`;
          staminaRef.current.style.background = s > 0.55 ? '#35d47a' : s > 0.28 ? '#ffb020' : '#ff4d5e';
          if (staminaValRef.current) staminaValRef.current.textContent = `${Math.round(s * 100)}%`;
        }
        if (conditionRef.current) {
          const c = Math.max(0, Math.min(1, p.condition ?? 1));
          conditionRef.current.style.width = `${c * 100}%`;
          conditionRef.current.style.background = '#59a8ff';
        }
        if (ratingRef.current) {
          const r = p.stats.rating;
          ratingRef.current.textContent = r.toFixed(1);
          ratingRef.current.style.color = r >= 7.5 ? '#35d47a' : r >= 6.5 ? '#e8edf4' : r >= 5.5 ? '#ffb020' : '#ff4d5e';
        }
      }

      // Charge meter
      if (chargeWrapRef.current) {
        const c = match.humanCharge ?? 0;
        const active = c > 0.02 && match.humanChargeType;
        chargeWrapRef.current.style.display = active ? 'block' : 'none';
        if (active) {
          chargeRef.current.style.width = `${Math.min(1, c) * 100}%`;
          chargeLabelRef.current.textContent =
            match.humanChargeType === 'shoot' ? 'SHOT POWER' : 'LOFTED PASS';
        }
      }

      // Radar
      if (radarRef.current) drawRadar(radarRef.current, match);

      // Perf
      if (perfRef.current && showPerf) {
        const fps = loop.renderer.fps;
        const cls = fps > 50 ? 'ok' : fps > 30 ? 'warn' : 'bad';
        perfRef.current.innerHTML =
          `<span class="${cls}">${fps.toFixed(0)} fps</span><br>` +
          `${loop.simSteps ?? 0} sim/frame<br>` +
          `${match.allPlayers.filter(x => x.onPitch).length} players`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [match, gameLoopRef, showPerf]);

  if (!match) return null;
  const [home, away] = match.teams;

  return (
    <div className="hud">
      {/* Scoreboard */}
      <div className="scorebug">
        <div className="team">
          <span className="swatch" style={{ background: home.colors.primary }} />
          {home.shortName}
        </div>
        <div className="score" ref={scoreRef}>0 - 0</div>
        <div className="team">
          {away.shortName}
          <span className="swatch" style={{ background: away.colors.primary }} />
        </div>
        <div className="clock" ref={clockRef}>0:00</div>
        <div className="period" ref={periodRef}>1ST</div>
      </div>

      {/* Player card */}
      <div className="player-card">
        <div className="top">
          <div className="num" ref={numRef}>-</div>
          <div className="grow">
            <div className="nm" ref={nameRef}>—</div>
            <div className="role" ref={roleRef}>—</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, fontSize: 17 }} ref={ratingRef}>6.0</div>
            <div className="tiny dim2">RATING</div>
          </div>
        </div>
        <div className="bars">
          <div className="bar-row">
            <span className="lbl">Stamina</span>
            <span className="bar"><i ref={staminaRef} style={{ width: '100%', background: '#35d47a' }} /></span>
            <span className="val" ref={staminaValRef}>100%</span>
          </div>
          <div className="bar-row">
            <span className="lbl">Sharpness</span>
            <span className="bar"><i ref={conditionRef} style={{ width: '100%', background: '#59a8ff' }} /></span>
            <span className="val" />
          </div>
        </div>
      </div>

      {/* Charge meter */}
      <div className="charge" ref={chargeWrapRef} style={{ display: 'none' }}>
        <div className="lbl" ref={chargeLabelRef}>POWER</div>
        <i ref={chargeRef} style={{ width: '0%' }} />
      </div>

      {/* Radar */}
      {showRadar && (
        <div className="radar">
          <canvas ref={radarRef} width={218} height={142} />
        </div>
      )}

      {/* Commentary */}
      {commentary && <div className="commentary" key={commentary.id}>{commentary.text}</div>}

      {/* Big banner */}
      {banner && (
        <div className="event-banner" key={banner.id}>
          <div className="headline" style={{ color: banner.color }}>{banner.headline}</div>
          <div className="sub">{banner.sub}</div>
        </div>
      )}

      {/* Toasts */}
      <div className="toasts">
        {toasts.map(t => (
          <div className={`toast ${t.kind}`} key={t.id}>
            <div className="t">{t.t}</div>
            {t.text}
          </div>
        ))}
      </div>

      {/* Perf */}
      {showPerf && <div className="perf" ref={perfRef} />}

      {/* Controls hint (hidden when perf overlay or touch is on) */}
      {!showPerf && !touch && <ControlHints />}
    </div>
  );
}

const ControlHints = memo(function ControlHints() {
  const [open, setOpen] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOpen(false), 12000); return () => clearTimeout(t); }, []);
  if (!open) return null;
  return (
    <div className="prompts">
      <div className="prompt"><span className="key">WASD</span> Move</div>
      <div className="prompt"><span className="key">⇧</span> Sprint</div>
      <div className="prompt"><span className="key">SPC</span> Pass</div>
      <div className="prompt"><span className="key">E</span> Through ball</div>
      <div className="prompt"><span className="key">Q</span> Lofted <span className="dim2">(hold)</span></div>
      <div className="prompt"><span className="key">F</span> Shoot <span className="dim2">(hold)</span></div>
      <div className="prompt"><span className="key">C</span> Cross</div>
      <div className="prompt"><span className="key">J</span> Tackle</div>
      <div className="prompt"><span className="key">K</span> Slide</div>
      <div className="prompt"><span className="key">V</span> Switch player</div>
      <div className="prompt"><span className="key">B</span> Camera</div>
      <div className="prompt"><span className="key">ESC</span> Pause</div>
    </div>
  );
});

// ---------------------------------------------------------------------------
function fmtClock(seconds, match) {
  // The sim runs compressed time; display it as a real 90-minute clock.
  const total = match.totalMatchSeconds;
  const shown = (seconds / total) * 90 * 60;
  const m = Math.floor(shown / 60);
  const s = Math.floor(shown % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function periodLabel(match) {
  if (match.phase === 'fulltime' || match.finished) return 'FT';
  if (match.phase === 'halftime') return 'HT';
  return match.half === 1 ? '1ST' : '2ND';
}

// ---------------------------------------------------------------------------
// Radar: 2D top-down of every player, drawn straight to a canvas.
function drawRadar(canvas, match) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const pad = 6;
  const sx = (W - pad * 2) / PITCH.length;
  const sy = (H - pad * 2) / PITCH.width;
  const X = (x) => pad + (x + PITCH.halfLength) * sx;
  const Y = (z) => pad + (z + PITCH.halfWidth) * sy;

  ctx.clearRect(0, 0, W, H);
  // Pitch
  ctx.fillStyle = 'rgba(30, 74, 34, 0.75)';
  ctx.fillRect(pad, pad, W - pad * 2, H - pad * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
  ctx.beginPath(); ctx.moveTo(X(0), pad); ctx.lineTo(X(0), H - pad); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(0), Y(0), PITCH.centreCircle * sx, 0, Math.PI * 2); ctx.stroke();
  for (const s of [-1, 1]) {
    const bx = s > 0 ? X(PITCH.halfLength - PITCH.penaltyAreaLength) : X(-PITCH.halfLength);
    ctx.strokeRect(bx, Y(-PITCH.penaltyAreaHalfWidth),
      PITCH.penaltyAreaLength * sx, PITCH.penaltyAreaHalfWidth * 2 * sy);
  }

  // Players
  for (const t of match.teams) {
    for (const p of t.players) {
      if (!p.onPitch) continue;
      const isHuman = p === match.human;
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.z), isHuman ? 4 : p.isGK ? 3 : 2.6, 0, Math.PI * 2);
      ctx.fillStyle = isHuman ? '#35d47a' : t.colors.primary;
      ctx.fill();
      if (isHuman || match.carrier === p) {
        ctx.strokeStyle = isHuman ? '#ffffff' : '#ffd34d';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
  }

  // Ball
  const b = match.ball;
  ctx.beginPath();
  ctx.arc(X(b.x), Y(b.z), 2.2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}
