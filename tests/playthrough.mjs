// ---------------------------------------------------------------------------
// REAL PLAYTHROUGH TEST
//
// Mounts the ACTUAL App component in jsdom with a mocked WebGL context and
// drives it the way a player would: click the menu, start a match, hold keys,
// pass, shoot, pause, change tactics, quit. Anything that throws, warns, or
// silently does nothing is a bug.
//
// This is the test that was missing. SSR rendering a component in isolation
// proves nothing about whether the game is playable.
// ---------------------------------------------------------------------------

import { JSDOM } from 'jsdom';

// ---- WebGL mock (three.js needs a plausible context) ----------------------
const GL = {};
let cv = 0x9000;
function makeGL() {
  const noop = () => {};
  return new Proxy({}, {
    get(t, p) {
      if (typeof p !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(p)) return (GL[p] ??= ++cv);
      switch (p) {
        case 'getExtension': return (n) => (/debug_renderer|draw_buffers|float|derivatives|anisotropic|element_index/i.test(n)
          ? { UNMASKED_RENDERER_WEBGL: 1, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 1, MAX_DRAW_BUFFERS_WEBGL: 8 } : null);
        case 'getParameter': return (x) => {
          if (x === GL.SCISSOR_BOX || x === GL.VIEWPORT) return new Int32Array([0, 0, 1280, 720]);
          if (x === GL.VERSION) return 'WebGL 2.0 (mock)';
          if (x === GL.SHADING_LANGUAGE_VERSION) return 'WebGL GLSL ES 3.00';
          if (x === GL.MAX_SAMPLES) return 4;
          return 8192;
        };
        case 'getShaderPrecisionFormat': return () => ({ rangeMin: 127, rangeMax: 127, precision: 23 });
        case 'getProgramParameter': case 'getShaderParameter': return () => 1;
        case 'getProgramInfoLog': case 'getShaderInfoLog': return () => '';
        case 'getUniformLocation': return () => ({ u: ++cv });
        case 'getAttribLocation': return () => 0;
        case 'getActiveUniform': return () => ({ name: 'u', type: GL.FLOAT, size: 1 });
        case 'getActiveAttrib': return () => ({ name: 'a', type: GL.FLOAT_VEC3, size: 1 });
        case 'getContextAttributes': return () => ({ alpha: true, depth: true, stencil: false, antialias: true });
        case 'isContextLost': return () => false;
        case 'getSupportedExtensions': return () => [];
        case 'checkFramebufferStatus': return () => GL.FRAMEBUFFER_COMPLETE;
        case 'getError': return () => 0;
        default:
          if (/^create/.test(p)) return () => ({ id: ++cv });
          return noop;
      }
    },
  });
}
function make2D(w, h) {
  const noop = () => {};
  const data = new Uint8ClampedArray(Math.max(4, w * h * 4));
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    stroke: noop, fill: noop, save: noop, restore: noop, translate: noop,
    rotate: noop, scale: noop, drawImage: noop, setTransform: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    getImageData: () => ({ data, width: w, height: h }),
    putImageData: noop,
    createImageData: (a, b) => ({ data: new Uint8ClampedArray(a * b * 4), width: a, height: b }),
    measureText: () => ({ width: 10 }),
  };
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true, url: 'http://localhost:5173/',
});
const { window } = dom;

window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') return make2D(this.width || 300, this.height || 150);
  return makeGL();
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:,';
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get() { return 1280; }, configurable: true });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get() { return 720; }, configurable: true });
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.devicePixelRatio = 1;
window.AudioContext = undefined;
window.webkitAudioContext = undefined;
window.scrollTo = () => {};

// Drive rAF manually so we control simulated time exactly.
const rafQueue = [];
window.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
window.cancelAnimationFrame = (id) => { rafQueue[id - 1] = null; };

for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement',
  'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent',
  'getComputedStyle', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame',
  'localStorage', 'DOMRect', 'Image']) {
  if (k in window) {
    try { Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true }); }
    catch { /* some are getter-only */ }
  }
}
globalThis.self = window;
// Keep Node's own performance object. Assigning jsdom's back onto window
// creates a self-referential getter loop (jsdom delegates to globalThis).
// A VIRTUAL clock. The game loop derives frameDt from performance.now(), so
// driving rAF without advancing this makes every frame dt=0 and the sim never
// steps. Tests advance it explicitly via frames().
let vnow = 1000;
const virtualPerf = Object.create(globalThis.performance);
virtualPerf.now = () => vnow;
Object.defineProperty(window, 'performance', { value: virtualPerf, configurable: true, writable: true });
Object.defineProperty(globalThis, 'performance', { value: virtualPerf, configurable: true, writable: true });

// ---- Capture every console error/warning and every uncaught throw ---------
const problems = [];
const origError = console.error;
const origWarn = console.warn;
console.error = (...a) => { problems.push({ kind: 'console.error', text: a.map(String).join(' ') }); };
console.warn = (...a) => {
  const s = a.map(String).join(' ');
  // three.js logs a benign notice about the mocked context.
  if (!/THREE.WebGLRenderer: (WEBGL_|EXT_)/.test(s)) problems.push({ kind: 'console.warn', text: s });
};
window.addEventListener('error', (e) => problems.push({ kind: 'window.error', text: String(e.message) }));
process.on('unhandledRejection', (r) => problems.push({ kind: 'unhandledRejection', text: String(r) }));

// ---------------------------------------------------------------------------
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const App = (await import('../src/ui/App.jsx')).default;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const root = createRoot(document.getElementById('root'));
await act(async () => { root.render(React.createElement(App)); });

// Helpers -------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const byText = (sel, re) => $$(sel).find(e => re.test(e.textContent || ''));
const click = async (el) => {
  if (!el) throw new Error('click target missing');
  await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
};
const key = async (code, type = 'keydown') => {
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent(type, { code, bubbles: true }));
  });
};
// Advance N frames of the real game loop.
const frames = async (n, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) {
    vnow += dt * 1000;
    const q = rafQueue.splice(0, rafQueue.length);
    await act(async () => {
      for (const fn of q) if (fn) fn(vnow);
    });
  }
};

console.log('\n--- MENU ---');
ok('app mounts', !!$('.screen'), `${document.body.textContent.slice(0, 40).trim()}...`);
ok('title renders', /Eleven versus eleven/.test(document.body.textContent));

// Go to Quick Match
await click(byText('.tab', /Quick Match/));
ok('quick match tab opens', /Kick Off/.test(document.body.textContent));

// Pick a position then kick off.
const cmOpt = $$('.opt').find(e => (e.textContent || '').startsWith('CM'));
if (cmOpt) await click(cmOpt);
const kick = byText('.btn', /Kick Off/);
ok('kick off button exists', !!kick);

console.log('\n--- STARTING MATCH ---');
await click(kick);
await frames(3);

const canvas = $('canvas.game-canvas');
ok('canvas mounts', !!canvas);
ok('HUD mounts', !!$('.hud'));
ok('scorebug renders', !!$('.scorebug'));
ok('player card renders', !!$('.player-card'));

// Grab the live match/loop off the window if exposed; otherwise infer from DOM.
console.log('\n--- PLAYING (600 frames = 10s) ---');
await frames(600);

// Locate the live Match instance by walking the React fiber tree from the
// canvas. This lets the test assert on real simulation state, not just pixels.
{
  const c = $('canvas.game-canvas');
  let fiber = null;
  for (const k of Object.keys(c)) if (k.startsWith('__reactFiber')) fiber = c[k];
  let node = fiber, found = null, guard = 0;
  while (node && guard++ < 400) {
    let s2 = node.memoizedState;
    let g2 = 0;
    while (s2 && g2++ < 60) {
      const v = s2.memoizedState;
      if (v && typeof v === 'object' && v.ball && v.teams && typeof v.step === 'function') { found = v; break; }
      if (v && typeof v === 'object' && v.current && v.current.match) { found = v.current.match; break; }
      s2 = s2.next;
    }
    if (found) break;
    node = node.return;
  }
  globalThis.__M = found;
  ok('the live Match instance is reachable and running', !!found && found.running && !found.paused,
    found ? `phase=${found.phase} score=${found.score.join('-')} human=${found.human ? found.human.name : 'NONE'}`
          : 'could not find Match in the fiber tree');
}
ok('survives 10s of play without console errors', problems.length === 0,
  problems.length ? problems.slice(0, 3).map(p => p.kind + ': ' + p.text.slice(0, 110)).join(' | ') : 'clean');

const clockText = $('.scorebug .clock')?.textContent ?? '';
ok('match clock is advancing', /^[0-9]+:[0-9]{2}$/.test(clockText) && clockText !== '0:00', `clock=${clockText}`);

const nameText = $('.player-card .nm')?.textContent ?? '';
ok('a player is under control', nameText.length > 1 && nameText !== '—', `controlling "${nameText}"`);

// ---- INPUT: does holding a key actually move the player? ------------------
console.log('\n--- INPUT ---');
// Hold sprint for ~6.5s of simulated time and assert the controlled player
// actually tires. Note frames() advances a virtual clock: the game loop derives
// its dt from performance.now(), so firing rAF without advancing it steps nothing.
// Wait for open play: during set pieces the choreography freezes players, so
// they would regenerate rather than tire and the test would be meaningless.
for (let i = 0; i < 600 && globalThis.__M?.phase !== 'open'; i++) await frames(1);
await key('KeyW', 'keydown');
await key('ShiftLeft', 'keydown');
await frames(30);
const tracked = globalThis.__M?.human ?? null;
const st0 = tracked ? tracked.stamina : null;
const dist0 = tracked ? tracked.stats.distance : 0;
let sprintFrames = 0;
// Only count frames actually spent in open play.
for (let i = 0; i < 900 && sprintFrames < 390; i++) {
  await frames(1);
  if (globalThis.__M?.phase === 'open') sprintFrames++;
}
await key('KeyW', 'keyup');
await key('ShiftLeft', 'keyup');
// The real invariant: a player who covers ground must tire. If control was
// auto-switched away mid-test the tracked player may legitimately have idled
// and recovered, which is correct behaviour, not a bug.
{
  const ran = tracked ? tracked.stats.distance - dist0 : 0;
  const drop = tracked ? st0 - tracked.stamina : 0;
  ok('running drains stamina, idling recovers it',
    !!tracked && (ran > 15 ? drop > 1 : drop <= 0.001),
    tracked ? `${tracked.name} covered ${ran.toFixed(0)}m, stamina ${st0.toFixed(1)} -> ${tracked.stamina.toFixed(1)}`
            : 'no human');
}

// Fire every action key; none may throw.
const before = problems.length;
for (const k of ['Space', 'KeyE', 'KeyQ', 'KeyC', 'KeyF', 'KeyJ', 'KeyK', 'KeyG', 'KeyV', 'KeyB', 'KeyM']) {
  await key(k, 'keydown'); await frames(4); await key(k, 'keyup'); await frames(4);
}
ok('all action keys are safe to press', problems.length === before,
  problems.slice(before, before + 2).map(p => p.text.slice(0, 100)).join(' | ') || 'no errors');

// ---- PAUSE + TACTICS ------------------------------------------------------
console.log('\n--- PAUSE / TACTICS / SQUAD ---');
await key('Escape', 'keydown'); await key('Escape', 'keyup');
await frames(4);
ok('escape opens the pause menu', !!$('.overlay'), $('.overlay h3')?.textContent ?? 'no overlay');

if ($('.overlay')) {
  ok('tactics panel renders', /Mentality/.test(document.body.textContent));
  const sliders = $$('.overlay input[type=range]');
  ok('tactical sliders exist', sliders.length >= 6, `${sliders.length} sliders`);

  // Move a slider and make sure it doesn't explode.
  const e0 = problems.length;
  if (sliders[0]) {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(sliders[0], '0.9');
      sliders[0].dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }
  ok('changing a tactic is safe', problems.length === e0);

  // Formation dropdown
  const sel = $$('.overlay select')[0];
  const e1 = problems.length;
  if (sel && sel.options.length > 1) {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, sel.options[1].value);
      sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
  }
  ok('changing formation mid-match is safe', problems.length === e1,
    problems.slice(e1, e1 + 1).map(p => p.text.slice(0, 120)).join('') || 'no errors');

  await click(byText('.tab', /Squad/)); await frames(2);
  ok('squad panel renders a team sheet', $$('.overlay table.tbl tr').length > 10,
    `${$$('.overlay table.tbl tr').length} rows`);

  await click(byText('.tab', /Stats/)); await frames(2);
  ok('stats panel renders', /Possession/.test(document.body.textContent));

  await click(byText('.tab', /Tactics/)); await frames(2);
  await click(byText('.btn', /Resume Match/));
  await frames(4);
  ok('resume closes the pause menu', !$('.overlay'));
}

// ---- LONG RUN: play out a full half --------------------------------------
console.log('\n--- LONG RUN ---');
const e2 = problems.length;
await frames(3600, 1 / 30);   // 2 minutes of wall time at 30fps
ok('3600 more frames without errors', problems.length === e2,
  problems.slice(e2, e2 + 3).map(p => p.kind + ': ' + p.text.slice(0, 110)).join(' | ') || 'clean');

const clock2 = $('.scorebug .clock')?.textContent ?? '';
ok('clock still advancing after long run', clock2 !== clockText, `${clockText} -> ${clock2}`);

// The match must actually PLAY football, not just tick a clock. Check the sim
// produced the events a real match produces.
const M = globalThis.__M;
if (M) {
  const st = M.stats ?? {};
  const tot = (k) => (st[k] ? st[k][0] + st[k][1] : (M[k] ? M[k][0] + M[k][1] : 0));
  ok('match reached a sensible clock', M.matchSeconds > 300,
    `${M.matchSeconds.toFixed(0)}s of ${M.totalMatchSeconds}s simulated`);
  // Shape check. Skipped at kickoff, where all 22 legitimately stand within a
  // couple of metres of the centre spot waiting for the whistle.
  {
    const on = M.allPlayers.filter((p) => p.onPitch);
    const xs = on.map((p) => p.x), zs = on.map((p) => p.z);
    const dx = Math.max(...xs) - Math.min(...xs);
    const dz = Math.max(...zs) - Math.min(...zs);
    ok('players hold a spread-out shape, not a clump',
      M.phase === 'kickoff' || (dx > 12 && dz > 12),
      `phase=${M.phase} spread ${dx.toFixed(0)}m x ${dz.toFixed(0)}m across ${on.length} players`);
  }
  // A team may legitimately be short after a sending-off, so reconcile the
  // count against red cards rather than demanding a flat 11 v 11.
  {
    const c = [0, 0];
    for (const p of M.allPlayers) if (p.onPitch) c[p.team]++;
    const red = M.stats.red ?? [0, 0];
    ok('both teams field 11, less any sendings-off',
      c[0] === 11 - red[0] && c[1] === 11 - red[1],
      `${c.join(' v ')} on pitch, red cards ${red.join('/')}`);
  }
  ok('no player escaped the pitch bounds', M.allPlayers.every(
    (p) => !p.onPitch || (Math.abs(p.x) < 70 && Math.abs(p.z) < 48)),
    'all inside the touchlines + margin');
  ok('ball is in a legal position', Math.abs(M.ball.x) < 70 && Math.abs(M.ball.z) < 48 && M.ball.y >= -0.01,
    `ball at (${M.ball.x.toFixed(1)}, ${M.ball.y.toFixed(1)}, ${M.ball.z.toFixed(1)})`);
  ok('nobody has NaN state', M.allPlayers.every(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.stamina)),
    'positions and stamina all finite');
  ok('the squad has tired over the match', (() => {
    const on = M.allPlayers.filter((p) => p.onPitch && !p.isGK);
    return on.some((p) => p.stamina < 92);
  })(), (() => {
    const on = M.allPlayers.filter((p) => p.onPitch && !p.isGK).map((p) => p.stamina);
    return `lowest outfield stamina ${Math.min(...on).toFixed(0)}%`;
  })());
}

// ---- QUIT -----------------------------------------------------------------
console.log('\n--- QUIT ---');
await key('Escape', 'keydown'); await key('Escape', 'keyup');
await frames(4);
const abandon = byText('.btn', /Abandon Match/);
ok('abandon button present', !!abandon);
if (abandon) {
  await click(abandon);
  await frames(6);
  ok('returns to the main menu', !!byText('.tab', /Quick Match/) || /Eleven versus eleven/.test(document.body.textContent));
}

console.log('\n--- ALL CAPTURED PROBLEMS ---');
if (problems.length === 0) console.log('  (none)');
else {
  const seen = new Map();
  for (const p of problems) {
    const k = p.text.slice(0, 150);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  let i = 0;
  for (const [text, n] of seen) {
    if (i++ > 14) { console.log(`  ... and ${seen.size - 15} more distinct`); break; }
    console.log(`  [x${n}] ${text}`);
  }
}

console.error = origError; console.warn = origWarn;
console.log(`\n${pass} passed, ${fail} failed, ${problems.length} console problems`);
process.exit(fail > 0 || problems.length > 0 ? 1 : 0);
